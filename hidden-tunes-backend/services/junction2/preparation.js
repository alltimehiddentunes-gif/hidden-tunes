/**
 * Unified PlaybackPreparationService.
 * Priorities: P0 user tap > P1 next/SEARCH_TOP > P2 auto-next > P3 next+1/SEARCH_SECONDARY > P4 legacy search > P5 other.
 * Single-flight via resolveBridgeMediaId. INTERNAL ONLY.
 */

import { recordMetric } from "./metrics.js";
import { isKnownUnplayable } from "./playability.js";
import {
  resolveBridgeMediaId,
  beginUserPlay,
  endUserPlay,
  getInflightResolve,
  loadPrewarmConfig,
} from "./prewarm.js";
import { rollingWindowAfter, markSessionTrackReady, registerSearchSession } from "./listeningSession.js";

/** @typedef {'COLD'|'QUEUED'|'RESOLVING'|'READY'|'STALE'|'FAILED'|'READY_LOCAL'} PrepState */

const PRIORITY = {
  P0_USER: 0,
  P1_NEXT: 1,
  /** Alias: search result #1 — same urgency as NEXT so first tap is warm. */
  P1_SEARCH_TOP: 1,
  P2_AUTO_NEXT: 2,
  P3_NEXT_PLUS: 3,
  /** Alias: search result #2 when capacity permits. */
  P3_SEARCH_SECONDARY: 3,
  P4_SEARCH: 4,
  P5_OTHER: 5,
};

const states = new Map(); // sourceKey → { state, priority, updatedAt, expiresAt, bridgeMediaId, publicPlaybackId, record }
const waiters = []; // priority queue of jobs
let activeJobs = 0;
let refreshTimers = new Map();
let maxConcurrent = 2;
let resolveTtlHintMs = 8 * 60 * 1000;
/** Bumped on each final search response — stale speculative search jobs yield. */
let searchPrepGeneration = 0;

function sourceKey(hit) {
  return String(hit?.canonicalSourceKey || `${hit?.provider || ""}:${hit?.sourceId || ""}`)
    .trim()
    .toLowerCase();
}

export function configurePreparation(opts = {}) {
  if (Number.isFinite(opts.maxConcurrent)) {
    maxConcurrent = Math.max(1, Math.min(2, opts.maxConcurrent));
  }
  if (Number.isFinite(opts.resolveTtlHintMs) && opts.resolveTtlHintMs > 0) {
    resolveTtlHintMs = opts.resolveTtlHintMs;
  }
}

export function getPreparationState(hitOrKey) {
  const key = typeof hitOrKey === "string" ? hitOrKey : sourceKey(hitOrKey);
  return key ? states.get(key) || { state: "COLD" } : { state: "COLD" };
}

function setState(key, patch) {
  const prev = states.get(key) || { state: "COLD", priority: PRIORITY.P5_OTHER };
  const next = { ...prev, ...patch, updatedAt: Date.now() };
  states.set(key, next);
  return next;
}

function enqueue(job) {
  const key = job.key;
  const existing = waiters.findIndex((j) => j.key === key);
  if (existing >= 0) {
    if (job.priority < waiters[existing].priority) {
      waiters[existing] = job;
      waiters.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
    } else if (
      job.searchGen != null &&
      (waiters[existing].searchGen == null || job.searchGen >= waiters[existing].searchGen)
    ) {
      waiters[existing].searchGen = job.searchGen;
    }
    return;
  }
  waiters.push(job);
  waiters.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
  setState(key, { state: "QUEUED", priority: job.priority, publicPlaybackId: job.record?.publicPlaybackId });
  recordMetric("playbackPreparationQueued", { priority: job.priority });
  pump();
}

/** Drop queued speculative search jobs from older queries (never P0–P2 playback window). */
function cancelStaleSearchPrep(gen) {
  for (let i = waiters.length - 1; i >= 0; i -= 1) {
    const job = waiters[i];
    if (job.searchGen == null) continue;
    if (job.searchGen >= gen) continue;
    if (job.priority <= PRIORITY.P2_AUTO_NEXT && job.searchGen == null) continue;
    // Speculative search only — playback-window jobs do not carry searchGen.
    waiters.splice(i, 1);
    setState(job.key, { state: "COLD" });
    recordMetric("playbackPreparationCancelled", { reason: "stale_search", priority: job.priority });
  }
}

function dropLowPriorityQueued() {
  // Keep P0–P3; drop P4/P5 queued when saturated.
  for (let i = waiters.length - 1; i >= 0; i -= 1) {
    if (waiters[i].priority >= PRIORITY.P4_SEARCH) {
      const [removed] = waiters.splice(i, 1);
      setState(removed.key, { state: "COLD" });
      recordMetric("playbackPreparationCancelled", { reason: "capacity", priority: removed.priority });
    }
  }
}

function pump() {
  while (activeJobs < maxConcurrent && waiters.length > 0) {
    const job = waiters.shift();
    if (!job) break;
    if (job.priority >= PRIORITY.P4_SEARCH && activeJobs > 0) {
      // Speculative yields if any higher work might need room — still allow if under cap.
    }
    startJob(job);
  }
}

function startJob(job) {
  const { key, record, client, store, priority, timeoutMs, force, searchGen } = job;
  if (isKnownUnplayable(record)) {
    setState(key, { state: "FAILED", priority });
    recordMetric("playbackPreparationFailed", { reason: "unplayable" });
    return;
  }
  // Stale speculative search — do not starve a newer query (unless promoted to user tap).
  if (
    searchGen != null &&
    searchGen < searchPrepGeneration &&
    priority > PRIORITY.P0_USER
  ) {
    setState(key, { state: "COLD" });
    recordMetric("playbackPreparationCancelled", { reason: "stale_search_start", priority });
    pump();
    return;
  }
  // Always run ingest/resolve — an existing bridgeMediaId does NOT mean Gateway
  // resolution cache is warm (TTL may have expired). Ingest is single-flight + idempotent.

  activeJobs += 1;
  setState(key, { state: "RESOLVING", priority, publicPlaybackId: record.publicPlaybackId });
  recordMetric("playbackPreparationStarted", { priority });
  const started = Date.now();

  const work = resolveBridgeMediaId(record, client, store, {
    publicPlaybackId: record.publicPlaybackId,
    timeoutMs: timeoutMs || 45_000,
    priority: priority === PRIORITY.P0_USER ? "user" : "prewarm",
    // Only force on STALE refresh / explicit force. Always-force starved P1
    // slots and re-resolved tracks that were already READY for auto-next.
    force: Boolean(force),
  });

  Promise.resolve(work)
    .then((mid) => {
      setState(key, {
        state: "READY",
        priority,
        bridgeMediaId: mid,
        publicPlaybackId: record.publicPlaybackId,
        expiresAt: Date.now() + resolveTtlHintMs,
        lastValidatedAt: Date.now(),
      });
      markSessionTrackReady(record.publicPlaybackId, mid);
      recordMetric("playbackPreparationReady", {
        durationMs: Date.now() - started,
        priority,
      });
      console.log(
        JSON.stringify({
          event: "j2_playback_preparation",
          status: "ready",
          priority,
          durationMs: Date.now() - started,
        }),
      );
      // Best-effort HEAD warm (does not hold preparation slot after resolve).
      if (typeof client.stream === "function" && mid) {
        client
          .stream(mid, { method: "HEAD", range: "bytes=0-0" })
          .then(async (up) => {
            if (up?.body?.cancel) {
              try {
                await up.body.cancel();
              } catch {
                /* ignore */
              }
            }
          })
          .catch(() => {});
      }
      scheduleRefresh(job);
    })
    .catch((err) => {
      setState(key, { state: "FAILED", priority });
      const code = String(err?.code || err?.message || "unknown").slice(0, 80);
      recordMetric("playbackPreparationFailed", {
        durationMs: Date.now() - started,
        priority,
        code,
      });
      console.log(
        JSON.stringify({
          event: "j2_playback_preparation",
          status: "failed",
          priority,
          durationMs: Date.now() - started,
          code,
        }),
      );
    })
    .finally(() => {
      activeJobs = Math.max(0, activeJobs - 1);
      pump();
    });
}

function scheduleRefresh(job) {
  const key = job.key;
  const existing = refreshTimers.get(key);
  if (existing) clearTimeout(existing);
  const state = states.get(key);
  if (!state?.expiresAt) return;
  // Refresh before expiry; also bias earlier using current-track duration when provided.
  const durationMs = Number(job.currentDurationMs) || 0;
  const safetyMs = 45_000;
  let delay = Math.max(5_000, state.expiresAt - Date.now() - safetyMs);
  if (durationMs > 60_000) {
    // Prefer refresh ~60s before expected transition if sooner than TTL refresh.
    const towardEnd = Math.max(5_000, durationMs - 60_000);
    delay = Math.min(delay, towardEnd);
  }
  const timer = setTimeout(() => {
    refreshTimers.delete(key);
    const st = states.get(key);
    if (!st || st.state === "FAILED") return;
    setState(key, { state: "STALE" });
    // Force re-resolve: clear remembered bridge only if we need fresh gateway candidate.
    // Re-ingest is idempotent via single-flight + gateway source cache.
    prepare(job.record, {
      priority: Math.min(st.priority ?? PRIORITY.P1_NEXT, PRIORITY.P1_NEXT),
      client: job.client,
      store: job.store,
      timeoutMs: job.timeoutMs,
      force: true,
      currentDurationMs: job.currentDurationMs,
    });
  }, delay);
  refreshTimers.set(key, timer);
}

/**
 * @param {object} record playback store record or search hit
 * @param {object} options
 */
export function prepare(record, options = {}) {
  if (!record?.provider || !record?.sourceId) return { state: "COLD" };
  if (isKnownUnplayable(record)) return { state: "FAILED" };
  const key = sourceKey(record);
  const priority = Number.isFinite(options.priority) ? options.priority : PRIORITY.P5_OTHER;
  const st = states.get(key);
  if (!options.force && st?.state === "READY" && st.expiresAt > Date.now() + 15_000) {
    if (priority < (st.priority ?? 99)) setState(key, { priority });
    return st;
  }
  if (!options.force && (st?.state === "RESOLVING" || getInflightResolve(key))) {
    recordMetric("singleFlightJoin", { priority });
    return st || { state: "RESOLVING" };
  }
  if (!options.client || !options.store) return { state: "COLD" };

  enqueue({
    key,
    record,
    client: options.client,
    store: options.store,
    priority,
    timeoutMs: options.timeoutMs,
    currentDurationMs: options.currentDurationMs,
    force: Boolean(options.force),
    searchGen: options.searchGen,
    enqueuedAt: Date.now(),
  });
  return getPreparationState(key);
}

export function prepareMany(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const basePriority = Number.isFinite(options.priority) ? options.priority : PRIORITY.P4_SEARCH;
  for (let i = 0; i < list.length; i += 1) {
    const record = list[i];
    let priority = basePriority;
    if (options.rankedSearchPriorities) {
      if (i === 0) priority = PRIORITY.P1_SEARCH_TOP;
      else if (i === 1) priority = PRIORITY.P3_SEARCH_SECONDARY;
      else priority = PRIORITY.P4_SEARCH;
    }
    prepare(record, { ...options, priority });
  }
}

export function cancel(hitOrKey, reason = "cancel") {
  const key = typeof hitOrKey === "string" ? hitOrKey : sourceKey(hitOrKey);
  if (!key) return;
  for (let i = waiters.length - 1; i >= 0; i -= 1) {
    if (waiters[i].key === key) {
      waiters.splice(i, 1);
      recordMetric("playbackPreparationCancelled", { reason });
    }
  }
  const t = refreshTimers.get(key);
  if (t) {
    clearTimeout(t);
    refreshTimers.delete(key);
  }
}

/**
 * Called when a media stream for playbackId starts (user is listening).
 * Prepares rolling window next / next+1 from search session.
 */
export function onTrackStarted(playbackRecord, client, store, config = {}) {
  if (!playbackRecord?.publicPlaybackId) return { prepared: 0 };
  const cfg = loadPrewarmConfig(config);
  configurePreparation({ maxConcurrent: cfg.maxConcurrent });

  const window = rollingWindowAfter(playbackRecord.publicPlaybackId, 2);
  let prepared = 0;
  for (const track of window) {
    const priority = track.windowOffset === 1 ? PRIORITY.P1_NEXT : PRIORITY.P3_NEXT_PLUS;
    // Cancel lower speculative for same key is handled by enqueue priority upgrade.
    prepare(
      {
        provider: track.provider,
        sourceId: track.sourceId,
        canonicalSourceKey: track.canonicalSourceKey,
        publicPlaybackId: track.publicPlaybackId,
        bridgeMediaId: track.bridgeMediaId,
        durationMs: track.durationMs,
      },
      {
        priority,
        client,
        store,
        timeoutMs: cfg.timeoutMs,
        currentDurationMs: playbackRecord.durationMs,
      },
    );
    prepared += 1;
  }

  // Soft-cancel distant P4/P5 if capacity tight
  if (activeJobs >= maxConcurrent) dropLowPriorityQueued();

  recordMetric("sessionWindowPrepared", { prepared, currentDurationMs: playbackRecord.durationMs || 0 });
  return { prepared, window: window.length };
}

/**
 * Player queue window: CURRENT known; prepare NEXT / NEXT+1 at P1/P2.
 * Supersedes search-order session for rolling preparation.
 */
export function preparePlayerQueueWindow(opaqueIds, client, store, config = {}, meta = {}) {
  const cfg = loadPrewarmConfig(config);
  configurePreparation({ maxConcurrent: cfg.maxConcurrent });

  const ids = {
    current: String(opaqueIds?.current || "").trim(),
    next: Array.isArray(opaqueIds?.next)
      ? opaqueIds.next.map((id) => String(id || "").trim()).filter(Boolean).slice(0, 2)
      : [],
  };

  const currentRecord = ids.current ? store.get(ids.current) : null;
  const nextRecords = ids.next.map((id) => store.get(id)).filter(Boolean);

  const sessionRecords = [];
  if (currentRecord) sessionRecords.push(currentRecord);
  for (const rec of nextRecords) sessionRecords.push(rec);

  if (sessionRecords.length) {
    registerSearchSession(sessionRecords, {
      queryFold: String(meta.queryFold || "player-queue").slice(0, 120),
    });
  }

  if (!cfg.enabled || !cfg.allow) {
    return {
      accepted: true,
      scheduled: 0,
      missing: ids.next.filter((id) => !store.get(id)),
      currentFound: Boolean(currentRecord),
    };
  }

  // Deprioritize speculative search work when real next needs capacity.
  if (nextRecords.length) dropLowPriorityQueued();

  let scheduled = 0;
  if (nextRecords[0]) {
    prepare(nextRecords[0], {
      priority: PRIORITY.P1_NEXT,
      client,
      store,
      timeoutMs: cfg.timeoutMs,
      currentDurationMs: Number(meta.currentDurationMs) || currentRecord?.durationMs || 0,
    });
    scheduled += 1;
  }
  if (nextRecords[1]) {
    prepare(nextRecords[1], {
      priority: PRIORITY.P2_AUTO_NEXT,
      client,
      store,
      timeoutMs: cfg.timeoutMs,
      currentDurationMs: Number(meta.currentDurationMs) || currentRecord?.durationMs || 0,
    });
    scheduled += 1;
  }

  recordMetric("playerQueuePrepare", {
    scheduled,
    nextRequested: ids.next.length,
    missing: ids.next.filter((id) => !store.get(id)).length,
  });
  console.log(
    JSON.stringify({
      event: "j2_player_queue_prepare",
      scheduled,
      nextRequested: ids.next.length,
      currentFound: Boolean(currentRecord),
      missing: ids.next.filter((id) => !store.get(id)).length,
    }),
  );

  return {
    accepted: true,
    scheduled,
    missing: ids.next.filter((id) => !store.get(id)),
    currentFound: Boolean(currentRecord),
  };
}

/**
 * Search returned: register session + prepare top results BEFORE tap.
 * #1 → P1 SEARCH_TOP (resolve now). #2 → P3 SEARCH_SECONDARY if capacity.
 * Does not block the search HTTP response (caller fires this after return path).
 */
export function onSearchResults(records, client, store, config = {}, meta = {}) {
  const session = registerSearchSession(records, meta);
  const cfg = loadPrewarmConfig(config);
  if (!cfg.enabled || !cfg.allow || !cfg.topN) {
    return { scheduled: 0, sessionId: session?.id || null };
  }
  configurePreparation({ maxConcurrent: cfg.maxConcurrent });
  searchPrepGeneration += 1;
  const gen = searchPrepGeneration;
  cancelStaleSearchPrep(gen);
  const targets = (Array.isArray(records) ? records : [])
    .filter((r) => r?.provider && r?.sourceId && !isKnownUnplayable(r))
    .slice(0, Math.min(cfg.topN, 2));
  prepareMany(targets, {
    rankedSearchPriorities: true,
    client,
    store,
    timeoutMs: cfg.timeoutMs,
    searchGen: gen,
  });
  console.log(
    JSON.stringify({
      event: "j2_search_top_prep",
      scheduled: targets.length,
      searchGen: gen,
      topSourceId: targets[0]?.sourceId || null,
      priorities: targets.map((_, i) => (i === 0 ? PRIORITY.P1_SEARCH_TOP : PRIORITY.P3_SEARCH_SECONDARY)),
    }),
  );
  return { scheduled: targets.length, sessionId: session?.id || null, searchGen: gen };
}

export function preparationStats() {
  const byState = {};
  for (const st of states.values()) {
    byState[st.state] = (byState[st.state] || 0) + 1;
  }
  return {
    activeJobs,
    queued: waiters.length,
    maxConcurrent,
    states: byState,
    refreshes: refreshTimers.size,
  };
}

export function clearPreparationForTests() {
  waiters.length = 0;
  activeJobs = 0;
  states.clear();
  searchPrepGeneration = 0;
  for (const t of refreshTimers.values()) clearTimeout(t);
  refreshTimers.clear();
}

export { PRIORITY, beginUserPlay, endUserPlay };
