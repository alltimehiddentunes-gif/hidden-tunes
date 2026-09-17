import { loadJunction2Config, isJunction2SearchActive } from "./config.js";
import { getMediaBridgeClient } from "./client.js";
import { isPubliclySurfaceable } from "./eligibility.js";
import { toPublicSong, isConservativeDuplicate, mergePreferLocal } from "./map.js";
import { playbackStore } from "./playbackStore.js";
import { containsPublicLeak } from "./leak.js";

export async function discoverAndMerge(localSongs, context = {}, deps = {}) {
  const local = Array.isArray(localSongs) ? localSongs : [];
  const config = deps.config || loadJunction2Config();
  if (!isJunction2SearchActive(config)) return local;
  if (!context.query) return local;

  const publicBaseUrl = String(context.publicBaseUrl || "").trim();
  if (!publicBaseUrl) return local;

  const client = deps.client || getMediaBridgeClient(config);
  const store = deps.store || playbackStore;

  try {
    const results = await client.search(context.query, {
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

    if (containsPublicLeak(mapped, publicBaseUrl)) return local;
    return mergePreferLocal(local, mapped, context.limit ?? local.length + mapped.length);
  } catch {
    return local;
  }
}
