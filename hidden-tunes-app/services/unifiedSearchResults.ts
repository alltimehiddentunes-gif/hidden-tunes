import type { HiddenTunesNormalizedSong } from "./hiddenTunesApi";
import { rankCatalogSongs } from "../utils/catalogSongRanking";

export const HIDDEN_TUNES_SEARCH_LABEL = "Hidden Tunes";

export const UNIFIED_SEARCH_SECTIONS = [
  "songs",
  "artists",
  "albums",
  "playlists",
] as const;

export type UnifiedSearchSection = (typeof UNIFIED_SEARCH_SECTIONS)[number];

export function brandUnifiedSearchTrack<T extends Record<string, unknown>>(
  track: T,
  internalSource = "hidden-tunes"
): T & { sourceName: string; source: string } {
  return {
    ...track,
    source: internalSource,
    sourceName: HIDDEN_TUNES_SEARCH_LABEL,
  };
}

export function buildLocalCatalogSearchFallback(
  catalogSongs: HiddenTunesNormalizedSong[],
  query: string,
  limit = 24
) {
  const safeQuery = String(query || "").trim();
  if (!safeQuery || catalogSongs.length === 0) return [];

  return rankCatalogSongs(catalogSongs, safeQuery, limit).map((hit) =>
    brandUnifiedSearchTrack(
      {
        ...hit.song,
        type: "r2",
        matchReason: hit.matchReason,
      },
      "hidden-tunes"
    )
  );
}

export function mergeUnifiedSongResults(
  primary: Record<string, unknown>[],
  fallback: Record<string, unknown>[]
) {
  if (primary.length > 0) return primary;
  return fallback;
}
