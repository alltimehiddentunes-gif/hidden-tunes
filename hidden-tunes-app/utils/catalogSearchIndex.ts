import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import { normalizeSearchText, tokenizeSearchText } from "./universalSearch";

export type CatalogSearchIndexEntry = {
  songId: string;
  haystack: string;
  titleKey: string;
  artistKey: string;
  genreKey: string;
  song: HiddenTunesNormalizedSong;
};

export type CatalogSearchIndex = {
  entries: CatalogSearchIndexEntry[];
  builtAt: number;
  songCount: number;
};

function buildSongHaystack(song: HiddenTunesNormalizedSong): string {
  const raw = song.raw || {};

  return normalizeSearchText(
    [
      song.title,
      song.artist,
      song.album,
      song.genre,
      song.mood,
      raw.tags,
      raw.description,
      song.sourceName,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

export function buildCatalogSearchIndex(
  songs: HiddenTunesNormalizedSong[]
): CatalogSearchIndex {
  const entries: CatalogSearchIndexEntry[] = [];

  for (const song of songs) {
    const songId = String(song.id || "").trim();
    if (!songId) continue;

    entries.push({
      songId,
      haystack: buildSongHaystack(song),
      titleKey: normalizeSearchText(song.title),
      artistKey: normalizeSearchText(song.artist),
      genreKey: normalizeSearchText(song.genre || song.mood),
      song,
    });
  }

  return {
    entries,
    builtAt: Date.now(),
    songCount: entries.length,
  };
}

export function scoreFastCatalogMatch(
  entry: CatalogSearchIndexEntry,
  normalizedQuery: string,
  queryTokens: string[]
): number {
  if (!normalizedQuery) return 0;

  const { haystack, titleKey, artistKey, genreKey } = entry;

  if (!haystack) return 0;

  if (haystack.includes(normalizedQuery)) {
    if (titleKey.startsWith(normalizedQuery)) return 140;
    if (titleKey.includes(normalizedQuery)) return 120;
    if (artistKey.includes(normalizedQuery)) return 108;
    if (genreKey.includes(normalizedQuery)) return 96;
    return 88;
  }

  if (!queryTokens.length) return 0;

  const tokenMatches = queryTokens.every((token) => haystack.includes(token));
  if (!tokenMatches) return 0;

  if (queryTokens.every((token) => titleKey.includes(token))) return 112;
  if (queryTokens.every((token) => artistKey.includes(token))) return 102;
  if (queryTokens.every((token) => genreKey.includes(token))) return 92;

  return 78;
}

export function searchCatalogIndex(
  index: CatalogSearchIndex,
  query: string,
  limit = 24
): HiddenTunesNormalizedSong[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  const queryTokens = tokenizeSearchText(normalizedQuery);
  const scored: Array<{ score: number; song: HiddenTunesNormalizedSong }> = [];

  for (const entry of index.entries) {
    const score = scoreFastCatalogMatch(entry, normalizedQuery, queryTokens);
    if (score <= 0) continue;

    scored.push({ score, song: entry.song });
  }

  scored.sort((left, right) => right.score - left.score);

  const seen = new Set<string>();
  const results: HiddenTunesNormalizedSong[] = [];

  for (const item of scored) {
    const key = String(item.song.id || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    results.push(item.song);
    if (results.length >= limit) break;
  }

  return results;
}
