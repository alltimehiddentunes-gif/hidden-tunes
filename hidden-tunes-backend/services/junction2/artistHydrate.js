/**
 * Hydrate artist popular tracks from opaque J2 entity index + discovery.
 * Used when catalog has no songs for an artist UUID / name.
 */

import { entityStore } from "./entityStore.js";
import { playbackStore } from "./playbackStore.js";
import { discoverAndMerge } from "./discover.js";
import { toPublicSong } from "./map.js";
import { onSearchResults } from "./preparation.js";
import { getMediaBridgeClient } from "./client.js";
import { loadJunction2Config } from "./config.js";

function recordsToSongs(ids, publicBaseUrl) {
  const out = [];
  for (const id of ids) {
    const record = playbackStore.get(id);
    if (!record) continue;
    const song = toPublicSong(record, publicBaseUrl);
    out.push(song);
  }
  return out;
}

/**
 * @returns {Promise<object[]>} songs in existing public song contract shape
 */
export async function hydrateArtistSongs(artistRef, options = {}) {
  const config = options.config || loadJunction2Config();
  const publicBaseUrl = String(options.publicBaseUrl || config.publicApiBaseUrl || "").trim();
  if (!publicBaseUrl) return [];

  const limit = Math.min(40, Math.max(1, Number(options.limit) || 20));
  let artist = null;
  const ref = String(artistRef || "").trim();
  if (!ref) return [];

  artist = entityStore.getArtist(ref) || entityStore.findArtistByName(ref);
  if (!artist && options.artistName) {
    artist = entityStore.findArtistByName(options.artistName);
  }

  // Cache hit: return indexed tracks immediately.
  if (artist) {
    const cached = recordsToSongs(entityStore.trackIdsForArtist(artist.id), publicBaseUrl).slice(0, limit);
    if (cached.length > 0) {
      if (options.prepare !== false) {
        const records = entityStore
          .trackIdsForArtist(artist.id)
          .map((id) => playbackStore.get(id))
          .filter(Boolean)
          .slice(0, 3);
        onSearchResults(records, getMediaBridgeClient(config), playbackStore, config, {
          queryFold: String(artist.name || "").toLowerCase(),
        });
      }
      return cached;
    }
  }

  const queryName = artist?.name || options.artistName || ref;
  if (!queryName || queryName.length < 2) return [];

  // Miss: bounded discovery under artist name, then filter by opaque artist identity.
  const discovered = await discoverAndMerge([], {
    query: queryName,
    limit,
    publicBaseUrl,
    signal: options.signal,
    rolloutKey: options.rolloutKey || "artist-hydrate",
  }, {
    config,
    schedulePlaybackPrewarm: options.prepare !== false,
  });

  // Prefer tracks linked to this opaque/catalog artist id.
  const artistId = artist?.id || entityStore.findArtistByName(queryName)?.id;
  if (artistId) {
    const linked = discovered.filter((s) => String(s.artistId || s.artist_id || "") === artistId);
    if (linked.length) return linked.slice(0, limit);
  }

  // Soft match by primary artist name when identity lag.
  const fold = String(queryName).toLowerCase();
  const named = discovered.filter((s) => String(s.artist || "").toLowerCase().includes(fold));
  return (named.length ? named : discovered).slice(0, limit);
}

export function getOpaqueArtistPublic(artistRef, tracks = []) {
  const ref = String(artistRef || "").trim();
  const row = entityStore.getArtist(ref) || entityStore.findArtistByName(ref);
  return entityStore.toPublicArtist(row, tracks);
}
