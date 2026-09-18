import { loadJunction2Config, isJunction2SearchActive, isOwnerCanaryQuery } from "./config.js";
import { getMediaBridgeClient } from "./client.js";
import { isPubliclySurfaceable } from "./eligibility.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "./map.js";
import { playbackStore } from "./playbackStore.js";
import { containsPublicLeak } from "./leak.js";

export async function discoverAndMerge(localSongs, context = {}, deps = {}) {
  const local = Array.isArray(localSongs) ? localSongs : [];
  const config = deps.config || loadJunction2Config();
  if (!isJunction2SearchActive(config, context.query)) return local;
  if (!context.query) return local;

  const publicBaseUrl = String(context.publicBaseUrl || "").trim();
  if (!publicBaseUrl) return local;

  const client = deps.client || getMediaBridgeClient(config);
  const store = deps.store || playbackStore;
  const canary = isOwnerCanaryQuery(context.query, config);
  // Open/query canary uses the owner's typed query directly (no forced upstream rewrite).
  const bridgeQuery =
    canary && config.ownerCanaryMode === "queries" && config.ownerCanaryUpstreamQuery
      ? config.ownerCanaryUpstreamQuery
      : context.query;
  const started = Date.now();

  try {
    const results = await client.search(bridgeQuery, {
      limit: config.searchLimit,
      signal: context.signal,
    });
    const mapped = [];
    for (const hit of results) {
      if (!isPubliclySurfaceable(hit, config)) continue;
      if (local.some((song) => isConservativeDuplicate(hit, song))) continue;
      const record = store.putFromSearchHit(hit);
      mapped.push(toPublicSong(record, publicBaseUrl));
    }

    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: mapped.length,
          bridgeHits: Array.isArray(results) ? results.length : 0,
          durationMs: Date.now() - started,
          status: "success",
        }),
      );
    }

    if (containsPublicLeak(mapped, publicBaseUrl)) return local;
    const limit = context.limit ?? local.length + mapped.length;
    if (canary) {
      // Owner canary must surface even when catalog search fills the page.
      const rest = local.filter(
        (song) => !mapped.some((hit) => isConservativeDuplicate({ title: hit.title, artist: hit.artist }, song)),
      );
      return [...mapped, ...rest].slice(0, limit);
    }
    return mergePreferLocal(local, mapped, limit);
  } catch {
    if (canary) {
      console.log(
        JSON.stringify({
          event: "j2_owner_canary_search",
          mode: config.ownerCanaryMode,
          workerRole: config.workerRole,
          surfaced: 0,
          durationMs: Date.now() - started,
          status: "failure",
          error: "isolated",
        }),
      );
    }
    return local;
  }
}
