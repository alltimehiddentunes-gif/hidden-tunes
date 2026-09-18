/**
 * Background playback prewarm: resolve top playable search hits AFTER search returns.
 * Single-flight so a tap during prewarm joins the same in-flight ingest.
 */

import { recordMetric } from "./metrics.js";
import { isKnownUnplayable } from "./playability.js";

const inflight = new Map();
let generation = 0;
let activePrewarms = 0;

function sourceKey(hit) {
  return String(hit?.canonicalSourceKey || `${hit?.provider || ""}:${hit?.sourceId || ""}`)
    .trim()
    .toLowerCase();
}

export function loadPrewarmConfig(config = {}, env = process.env) {
  const enabledRaw = String(env.PLAYBACK_PREWARM_ENABLED ?? "true").trim().toLowerCase();
  const enabled = enabledRaw === "" ? true : enabledRaw === "true";
  const topN = Number.parseInt(String(env.PLAYBACK_PREWARM_TOP_N || "2"), 10);
  const maxConcurrent = Number.parseInt(String(env.MAX_PREWARM_RESOLUTIONS || "1"), 10);
  const timeoutMs = Number.parseInt(String(env.PLAYBACK_PREWARM_TIMEOUT_MS || "45000"), 10);
  return {
    enabled,
    topN: Math.max(0, Math.min(5, Number.isFinite(topN) ? topN : 2)),
    maxConcurrent: Math.max(1, Math.min(2, Number.isFinite(maxConcurrent) ? maxConcurrent : 1)),
    timeoutMs: Math.max(1000, Number.isFinite(timeoutMs) ? timeoutMs : 45000),
    allow: Boolean(config.ready),
  };
}

export function bumpPrewarmGeneration() {
  generation += 1;
  return generation;
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
      { signal: options.signal, timeoutMs: options.timeoutMs },
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

export function schedulePlaybackPrewarm(records, client, store, config, deps = {}) {
  const cfg = deps.prewarmConfig || loadPrewarmConfig(config);
  if (!cfg.enabled || !cfg.allow || !cfg.topN) {
    return { scheduled: 0, generation };
  }
  const gen = bumpPrewarmGeneration();
  const targets = (Array.isArray(records) ? records : [])
    .filter((r) => r?.provider && r?.sourceId && !isKnownUnplayable(r))
    .slice(0, cfg.topN);

  const runNext = (index) => {
    if (gen !== generation) return;
    if (index >= targets.length) return;

    const waitAndContinue = () => {
      if (gen !== generation) return;
      if (activePrewarms >= cfg.maxConcurrent) {
        setTimeout(waitAndContinue, 50);
        return;
      }
      startAt(index);
    };

    const startAt = (i) => {
      if (gen !== generation) return;
      if (i >= targets.length) return;
      const record = targets[i];
      const key = sourceKey(record);
      if (!key) {
        startAt(i + 1);
        return;
      }
      if (record.bridgeMediaId || inflight.has(key)) {
        startAt(i + 1);
        return;
      }
      if (activePrewarms >= cfg.maxConcurrent) {
        setTimeout(() => startAt(i), 50);
        return;
      }

      activePrewarms += 1;
      const started = Date.now();
      recordMetric("playbackPrewarmAttempt", { generation: gen });

      resolveBridgeMediaId(record, client, store, {
        publicPlaybackId: record.publicPlaybackId,
        timeoutMs: cfg.timeoutMs,
      })
        .then(async () => {
          const mid = store.get(record.publicPlaybackId)?.bridgeMediaId;
          if (mid && typeof client.stream === "function" && gen === generation) {
            try {
              const upstream = await client.stream(mid, {
                method: "HEAD",
                range: "bytes=0-0",
              });
              if (upstream?.body?.cancel) {
                try {
                  await upstream.body.cancel();
                } catch (_e) {
                  /* ignore */
                }
              }
            } catch (_e) {
              /* best-effort stream warm */
            }
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
          activePrewarms = Math.max(0, activePrewarms - 1);
          startAt(i + 1);
        });
    };

    waitAndContinue();
  };

  setImmediate(() => runNext(0));
  return { scheduled: targets.length, generation: gen };
}

export function prewarmStats() {
  return { activePrewarms, inflight: inflight.size, generation };
}

export function clearPrewarmForTests() {
  inflight.clear();
  activePrewarms = 0;
  generation = 0;
}
