import type { HiddenTunesNormalizedSong } from "./hiddenTunesApi";
import {
  peekRoomInitialTracks,
  upsertRoomDiscoverySession,
} from "./roomDiscoverySession";

type CatalogViewSeed = {
  cacheKey: string;
  songs: HiddenTunesNormalizedSong[];
  setAt: number;
};

let pendingSeed: CatalogViewSeed | null = null;

function seedCacheKey(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
  genreAnchor?: string;
}) {
  const type = String(input.type || "mood");
  const title = String(input.title || input.query || input.id || "").trim();
  const genreAnchor = String(input.genreAnchor || "").trim().toLowerCase();
  const id = String(input.id || (genreAnchor ? `${genreAnchor}|${title}` : title)).trim();
  // Country|Reflective must NEVER share Global|Reflective seed identity.
  return genreAnchor
    ? `${type}:${id}|${genreAnchor}|${title}`.toLowerCase()
    : `${type}:${id}|${title}`.toLowerCase();
}

/**
 * Handoff Explore → Room Detail.
 * Writes durable roomDiscoverySession AND a one-shot paint seed.
 */
export function setCatalogViewSeed(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
  genreAnchor?: string;
  songs: HiddenTunesNormalizedSong[];
}) {
  const songs = Array.isArray(input.songs) ? input.songs.filter(Boolean) : [];
  if (!songs.length) return;

  upsertRoomDiscoverySession({
    type: input.type,
    id: input.id,
    title: input.title,
    query: input.query,
    initialTracks: songs,
    hasMore: true,
    replaceTracks: true,
  });

  pendingSeed = {
    cacheKey: seedCacheKey(input),
    songs,
    setAt: Date.now(),
  };
}

export function consumeCatalogViewSeed(input: {
  type?: string;
  id?: string;
  title?: string;
  query?: string;
  genreAnchor?: string;
}): HiddenTunesNormalizedSong[] | null {
  const genreAnchor = String(input.genreAnchor || "").trim();

  // Prefer durable shared room session (Explore + Detail + Radio).
  const sessionTracks = peekRoomInitialTracks(input);
  if (sessionTracks.length) {
    // Genre-anchored rooms must not paint a global mood session by title alone.
    if (!genreAnchor) {
      pendingSeed = null;
      return sessionTracks;
    }
    // Session id for anchored rooms includes genre — trust only exact key hits.
    pendingSeed = null;
    return sessionTracks;
  }

  if (!pendingSeed) return null;
  const key = seedCacheKey(input);
  // Exact key only — never match Global Reflective seed into Country+Reflective.
  const matched = pendingSeed.cacheKey === key;
  if (!matched) return null;
  if (Date.now() - pendingSeed.setAt > 60_000) {
    pendingSeed = null;
    return null;
  }
  const songs = pendingSeed.songs;
  pendingSeed = null;
  return songs;
}
