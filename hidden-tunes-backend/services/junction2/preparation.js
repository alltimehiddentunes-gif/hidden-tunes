/**
 * Unified PlaybackPreparationService.
 * Priorities: P0 user tap > P1 next > P2 auto-next > P3 next+1 > P4 search prewarm > P5 other.
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
  P2_AUTO_NEXT: 2,
  P3_NEXT_PLUS: 3,
  P4_SEARCH: 4,
  P5_OTHER: 5,
};

const states = new Map(); // sourceKey → { state, priority, updatedAt, expiresAt, bridgeMediaId, publicPlaybackId, record }
const waiters = []; // priority queue of jobs
let activeJobs = 0;
let refreshTimers = new Map();
let maxConcurrent = 2;
let resolveTtlHintMs = 8 * 60 * 1000;

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
    }
    return;
  }
  waiters.push(job);
  waiters.sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
  setState(key, { state: "QUEUED", priority: job.priority, publicPlaybackId: job.record?.publicPlaybackId });
  recordMetric("playbackPreparationQueued", { priority: job.priority });
  pump();
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
  const { key, record, client, store, priority, timeoutMs, force } = job;
  if (isKnownUnplayable(record)) {
    setState(key, { state: "FAILED", priority });
    recordMetric("playbackPreparationFailed", { reason: "unplayable" });
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
    // Force past local bridgeMediaId short-circuit so Gateway cache is refreshed.
    force: true,
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
    .catch(() => {
      setState(key, { state: "FAILED", priority });
      recordMetric("playbackPreparationFailed", {
        durationMs: Date.now() - started,
        priority,
      });
      console.log(
        JSON.stringify({
          event: "j2_playback_preparation",
          status: "failed",
          priority,
          durationMs: Date.now() - started,
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
    enqueuedAt: Date.now(),
  });
  return getPreparationState(key);
}

export function prepareMany(records, options = {}) {
  const list = Array.isArray(records) ? records : [];
  const basePriority = Number.isFinite(options.priority) ? options.priority : PRIORITY.P4_SEARCH;
  for (const record of list) {
    prepare(record, { ...options, priority: basePriority });
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
 * Search returned: register session + P4 prepare top N.
 */
export function onSearchResults(records, client, store, config = {}, meta = {}) {
  const session = registerSearchSession(records, meta);
  const cfg = loadPrewarmConfig(config);
  if (!cfg.enabled || !cfg.allow || !cfg.topN) {
    return { scheduled: 0, sessionId: session?.id || null };
  }
  configurePreparation({ maxConcurrent: cfg.maxConcurrent });
  const targets = (Array.isArray(records) ? records : [])
    .filter((r) => r?.provider && r?.sourceId && !isKnownUnplayable(r))
    .slice(0, cfg.topN);
  prepareMany(targets, {
    priority: PRIORITY.P4_SEARCH,
    client,
    store,
    timeoutMs: cfg.timeoutMs,
  });
  return { scheduled: targets.length, sessionId: session?.id || null };
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
  for (const t of refreshTimers.values()) clearTimeout(t);
  refreshTimers.clear();
}

export { PRIORITY, beginUserPlay, endUserPlay };
