/**
 * Background playback prewarm: resolve top playable search hits AFTER search returns.
 * Single-flight so a tap during prewarm joins the same in-flight ingest.
 * Speculative work uses a separate concurrency budget and yields to user play.
 */

import { recordMetric } from "./metrics.js";
import { isKnownUnplayable } from "./playability.js";

const inflight = new Map();
let generation = 0;
let activePrewarms = 0;
let activeUserPlays = 0;
let optionalTailTimer = null;

function sourceKey(hit) {
  return String(hit?.canonicalSourceKey || `${hit?.provider || ""}:${hit?.sourceId || ""}`)
    .trim()
    .toLowerCase();
}

export function loadPrewarmConfig(config = {}, env = process.env) {
  const enabledRaw = String(env.PLAYBACK_PREWARM_ENABLED ?? "true").trim().toLowerCase();
  const enabled = enabledRaw === "" ? true : enabledRaw === "true";
  const topN = Number.parseInt(String(env.PLAYBACK_PREWARM_TOP_N || "2"), 10);
  const maxConcurrent = Number.parseInt(String(env.MAX_PREWARM_RESOLUTIONS || "2"), 10);
  const timeoutMs = Number.parseInt(String(env.PLAYBACK_PREWARM_TIMEOUT_MS || "45000"), 10);
  const optionalExtra = String(env.PLAYBACK_PREWARM_OPTIONAL_EXTRA ?? "true").trim().toLowerCase() !== "false";
  return {
    enabled,
    topN: Math.max(0, Math.min(5, Number.isFinite(topN) ? topN : 2)),
    maxConcurrent: Math.max(1, Math.min(2, Number.isFinite(maxConcurrent) ? maxConcurrent : 2)),
    timeoutMs: Math.max(1000, Number.isFinite(timeoutMs) ? timeoutMs : 45000),
    optionalExtra,
    allow: Boolean(config.ready),
  };
}

export function bumpPrewarmGeneration() {
  generation += 1;
  if (optionalTailTimer) {
    clearTimeout(optionalTailTimer);
    optionalTailTimer = null;
  }
  return generation;
}

export function beginUserPlay() {
  activeUserPlays += 1;
}

export function endUserPlay() {
  activeUserPlays = Math.max(0, activeUserPlays - 1);
}

export function getInflightResolve(hitOrKey) {
  const key = typeof hitOrKey === "string" ? hitOrKey : sourceKey(hitOrKey);
  return key ? inflight.get(key) : undefined;
}

export async function resolveBridgeMediaId(hit, client, store, options = {}) {
  const key = sourceKey(hit);
  if (!key || !hit?.provider || !hit?.sourceId) {
    const error = new Error("missing_identity");
    error.code = "NOT_FOUND";
    throw error;
  }
  if (hit.bridgeMediaId) return String(hit.bridgeMediaId);
  if (options.publicPlaybackId && store) {
    const existing = store.get(options.publicPlaybackId);
    if (existing?.bridgeMediaId) return String(existing.bridgeMediaId);
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const bridgeMediaId = await client.ingest(
      { provider: hit.provider, sourceId: hit.sourceId },
      {
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        priority: options.priority || "user",
      },
    );
    if (options.publicPlaybackId && store?.rememberBridgeMediaId) {
      store.rememberBridgeMediaId(options.publicPlaybackId, bridgeMediaId);
    }
    return String(bridgeMediaId);
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    inflight.delete(key);
  }
}

function dedupeTargets(records, topN) {
  const seen = new Set();
  const out = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.provider || !record?.sourceId) continue;
    if (isKnownUnplayable(record)) continue;
    const key = sourceKey(record);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(record);
    if (out.length >= topN) break;
  }
  return out;
}

function warmStreamHead(client, store, record) {
  const mid = store.get(record.publicPlaybackId)?.bridgeMediaId;
  if (!mid || typeof client.stream !== "function") return Promise.resolve();
  return client
    .stream(mid, { method: "HEAD", range: "bytes=0-0" })
    .then(async (upstream) => {
      if (upstream?.body?.cancel) {
        try {
          await upstream.body.cancel();
        } catch (_e) {
          /* ignore */
        }
      }
    })
    .catch(() => {
      /* best-effort */
    });
}

function runPrewarmJob(record, client, store, cfg, gen) {
  const key = sourceKey(record);
  if (!key || record.bridgeMediaId || inflight.has(key)) return false;
  if (activePrewarms >= cfg.maxConcurrent) return false;
  if (activeUserPlays > 0) return false;

  activePrewarms += 1;
  const started = Date.now();
  let released = false;
  const releaseSlot = () => {
    if (released) return;
    released = true;
    activePrewarms = Math.max(0, activePrewarms - 1);
  };
  recordMetric("playbackPrewarmAttempt", { generation: gen });

  resolveBridgeMediaId(record, client, store, {
    publicPlaybackId: record.publicPlaybackId,
    timeoutMs: cfg.timeoutMs,
    priority: "prewarm",
  })
    .then(async () => {
      // Release speculative slot before optional HEAD warm so parallel peers can start.
      releaseSlot();
      if (gen === generation) {
        await warmStreamHead(client, store, record);
      }
      recordMetric("playbackPrewarmSuccess", { durationMs: Date.now() - started, generation: gen });
      console.log(
        JSON.stringify({
          event: "j2_playback_prewarm",
          status: "success",
          durationMs: Date.now() - started,
          generation: gen,
        }),
      );
    })
    .catch((_err) => {
      releaseSlot();
      recordMetric("playbackPrewarmFailure", { durationMs: Date.now() - started, generation: gen });
      console.log(
        JSON.stringify({
          event: "j2_playback_prewarm",
          status: "failure",
          durationMs: Date.now() - started,
          generation: gen,
        }),
      );
    })
    .finally(() => {
      releaseSlot();
      fillPrewarmSlots();
    });

  return true;
}

/** Active scheduler state for the current generation. */
let queue = [];
let queueCfg = null;
let queueClient = null;
let queueStore = null;
let queueGen = 0;
let primaryCount = 0;

function fillPrewarmSlots() {
  if (queueGen !== generation) {
    queue = [];
    return;
  }
  if (!queueCfg || !queueClient || !queueStore) return;
  while (activePrewarms < queueCfg.maxConcurrent && queue.length > 0) {
    if (activeUserPlays > 0) break;
    const next = queue.shift();
    if (!next) break;
    const started = runPrewarmJob(next, queueClient, queueStore, queueCfg, queueGen);
    if (!started) {
      // Already warm / in-flight / blocked — continue draining.
      continue;
    }
  }
  if (
    queueCfg.optionalExtra &&
    queue.length === 0 &&
    activePrewarms === 0 &&
    activeUserPlays === 0 &&
    primaryCount > 0 &&
    queueGen === generation
  ) {
    // Optional #3 already included in queue when scheduled; nothing else.
  }
}

export function schedulePlaybackPrewarm(records, client, store, config, deps = {}) {
  const cfg = deps.prewarmConfig || loadPrewarmConfig(config);
  if (!cfg.enabled || !cfg.allow || !cfg.topN) {
    return { scheduled: 0, generation };
  }
  const gen = bumpPrewarmGeneration();
  // Primary top-N distinct sources; optionally keep one more for idle tail.
  const want = cfg.optionalExtra ? Math.min(cfg.topN + 1, 5) : cfg.topN;
  const all = dedupeTargets(records, want);
  const primary = all.slice(0, cfg.topN);
  const optional = all.slice(cfg.topN);

  queueCfg = cfg;
  queueClient = client;
  queueStore = store;
  queueGen = gen;
  primaryCount = primary.length;
  queue = [...primary];

  setImmediate(() => {
    fillPrewarmSlots();
    // After primary settle, if idle and generation still current, start optional #3.
    if (optional.length && cfg.optionalExtra) {
      const tryOptional = (attempt) => {
        if (gen !== generation) return;
        if (attempt > 40) return; // ~10s max wait for idle
        if (activeUserPlays > 0 || activePrewarms > 0 || queue.length > 0) {
          optionalTailTimer = setTimeout(() => tryOptional(attempt + 1), 250);
          return;
        }
        queue.push(...optional);
        fillPrewarmSlots();
      };
      optionalTailTimer = setTimeout(() => tryOptional(0), 250);
    }
  });

  return { scheduled: primary.length, generation: gen, optional: optional.length };
}

export function prewarmStats() {
  return {
    activePrewarms,
    activeUserPlays,
    inflight: inflight.size,
    generation,
    queued: queue.length,
  };
}

export function clearPrewarmForTests() {
  inflight.clear();
  activePrewarms = 0;
  activeUserPlays = 0;
  generation = 0;
  queue = [];
  queueCfg = null;
  queueClient = null;
  queueStore = null;
  queueGen = 0;
  primaryCount = 0;
  if (optionalTailTimer) {
    clearTimeout(optionalTailTimer);
    optionalTailTimer = null;
  }
}
