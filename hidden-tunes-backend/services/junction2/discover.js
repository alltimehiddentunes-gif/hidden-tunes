import { loadJunction2Config, isJunction2SearchActive, isOwnerCanaryQuery } from "./config.js";
import { getMediaBridgeClient } from "./client.js";
import { isPubliclySurfaceable } from "./eligibility.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "./map.js";
import { playbackStore } from "./playbackStore.js";
import { containsPublicLeak } from "./leak.js";
import { recordMetric } from "./metrics.js";

export async function discoverAndMerge(localSongs, context = {}, deps = {}) {
  const local = Array.isArray(localSongs) ? localSongs : [];
  const config = deps.config || loadJunction2Config();
  if (!isJunction2SearchActive(config, context.query, context.rolloutKey)) return local;
  if (!context.query) return local;

  const publicBaseUrl = String(context.publicBaseUrl || "").trim();
  if (!publicBaseUrl) return local;

  const client = deps.client || getMediaBridgeClient(config);
  const store = deps.store || playbackStore;
  const canary = isOwnerCanaryQuery(context.query, config);
  const bridgeQuery =
    canary && config.ownerCanaryMode === "queries" && config.ownerCanaryUpstreamQuery
      ? config.ownerCanaryUpstreamQuery
      : context.query;
  const started = Date.now();
  const timeoutMs = canary ? config.ownerCanarySearchTimeoutMs : config.searchTimeoutMs;

  recordMetric("externalSearchAttempt", { canary, workerRole: config.workerRole });

  try {
    const results = await client.search(bridgeQuery, {
      limit: config.searchLimit,
      signal: context.signal,
      timeoutMs,
    });
    const mapped = [];
    for (const hit of results) {
      if (!isPubliclySurfaceable(hit, config)) continue;
      if (local.some((song) => isConservativeDuplicate(hit, song))) continue;
      const record = store.putFromSearchHit(hit);
      mapped.push(toPublicSong(record, publicBaseUrl));
    }

    const durationMs = Date.now() - started;
    recordMetric("externalSearchSuccess", {
      canary,
      workerRole: config.workerRole,
      surfaced: mapped.length,
      bridgeHits: Array.isArray(results) ? results.length : 0,
      durationMs,
    });

    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: mapped.length,
          bridgeHits: Array.isArray(results) ? results.length : 0,
          durationMs,
          status: "success",
        }),
      );
    }

    if (containsPublicLeak(mapped, publicBaseUrl)) return local;
    const limit = context.limit ?? local.length + mapped.length;
    if (canary) {
      const rest = local.filter(
        (song) => !mapped.some((hit) => isConservativeDuplicate({ title: hit.title, artist: hit.artist }, song)),
      );
      return [...mapped, ...rest].slice(0, limit);
    }
    return mergePreferLocal(local, mapped, limit);
  } catch (err) {
    const durationMs = Date.now() - started;
    const aborted = Boolean(err?.name === "AbortError" || context.signal?.aborted || err?.code === "ABORT_ERR");
    recordMetric(aborted ? "externalSearchTimeout" : "externalSearchFailure", {
      canary,
      workerRole: config.workerRole,
      durationMs,
    });
    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: 0,
          durationMs,
          status: aborted ? "timeout" : "failure",
          error: "isolated",
        }),
      );
    }
    return local;
  }
}
