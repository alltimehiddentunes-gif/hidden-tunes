import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
import {
  scoreSearchResult,
  type SearchMatchReason,
} from "./searchRanking";
import {
  normalizeSearchText,
  stripLrcTimestamps,
  tokenizeSearchText,
} from "./universalSearch";

export type CatalogSongMatchReason =
  | "exact_title"
  | "title_starts"
  | "title_contains"
  | "artist_exact"
  | "artist_starts"
  | "artist_contains"
  | "album_exact"
  | "album_starts"
  | "album_contains"
  | "genre_exact"
  | "genre_starts"
  | "genre_contains"
  | "mood_match"
  | "creator_match"
  | "lyric_match"
  | "tag_description_contains"
  | "related_fallback"
  | "external_fallback";

export type CatalogSongSearchHit = {
  song: HiddenTunesNormalizedSong;
  score: number;
  matchReason: CatalogSongMatchReason;
};

/** TV and other non-catalog rows must stay below catalog song tiers. */
export const CATALOG_SEARCH_TV_MAX_SCORE = 2800;

const SEARCH_REASON_TO_CATALOG: Record<SearchMatchReason, CatalogSongMatchReason> = {
  exact_artist: "artist_exact",
  exact_title: "exact_title",
  exact_album: "album_exact",
  artist_starts_with: "artist_starts",
  title_starts_with: "title_starts",
  album_starts_with: "album_starts",
  artist_contains: "artist_contains",
  title_contains: "title_contains",
  album_contains: "album_contains",
  genre_contains: "genre_contains",
  mood_contains: "mood_match",
  tag_description_contains: "tag_description_contains",
  related_fallback: "related_fallback",
  external_fallback: "external_fallback",
  none: "title_contains",
};

const REASON_SCORE: Record<CatalogSongMatchReason, number> = {
  artist_exact: 10000,
  exact_title: 9000,
  album_exact: 8000,
  artist_starts: 7000,
  title_starts: 6500,
  album_starts: 6000,
  artist_contains: 5000,
  title_contains: 4500,
  album_contains: 4000,
  genre_exact: 2000,
  genre_starts: 2000,
  genre_contains: 2000,
  mood_match: 1500,
  tag_description_contains: 500,
  related_fallback: 300,
  external_fallback: 100,
  creator_match: 500,
  lyric_match: 500,
};

function getSongLyricsText(song: HiddenTunesNormalizedSong) {
  const raw = song.raw || {};
  const plain =
    song.lyrics || raw.plain_lyrics || raw.plainLyrics || raw.lyrics || "";
  const synced =
    song.syncedLyrics || raw.synced_lrc || raw.syncedLrc || raw.lrc || "";

  return [stripLrcTimestamps(plain), stripLrcTimestamps(synced)]
    .filter(Boolean)
    .join(" ");
}

function mapSearchScoreToCatalog(
  song: HiddenTunesNormalizedSong,
  query: string,
  options: { isRelatedFallback?: boolean; isExternal?: boolean } = {}
): CatalogSongSearchHit | null {
  const raw = song.raw || {};
  const ranked = scoreSearchResult(
    {
      artist: song.artist,
      title: song.title,
      album: song.album,
      genre: song.genre,
      mood: song.mood,
      tags: raw.tags,
      description: raw.description,
      lyrics: getSongLyricsText(song),
      streamUrl: song.streamUrl,
      url: song.url,
      isOnline: song.isOnline,
    },
    query,
    options
  );

  if (ranked.score <= 0 || ranked.reason === "none") {
    return null;
  }

  const matchReason = SEARCH_REASON_TO_CATALOG[ranked.reason] || "title_contains";

  return {
    song,
    score: REASON_SCORE[matchReason] ?? ranked.score,
    matchReason,
  };
}

export function scoreCatalogSongMatch(
  song: HiddenTunesNormalizedSong,
  query: string
): CatalogSongSearchHit | null {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return null;

  const direct = mapSearchScoreToCatalog(song, query);
  if (direct && direct.matchReason !== "tag_description_contains") {
    return direct;
  }

  const lyricsText = normalizeSearchText(getSongLyricsText(song));
  const queryTokens = tokenizeSearchText(normalizedQuery);
  const lyricMatches =
    lyricsText &&
    (lyricsText.includes(normalizedQuery) ||
      queryTokens.every((token) => lyricsText.includes(token)));

  if (lyricMatches) {
    return {
      song,
      score: REASON_SCORE.lyric_match,
      matchReason: "lyric_match",
    };
  }

  return direct;
}

export function rankCatalogSongs(
  songs: HiddenTunesNormalizedSong[],
  query: string,
  limit = 40
): CatalogSongSearchHit[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return [];

  const scored: CatalogSongSearchHit[] = [];
  const seen = new Set<string>();

  for (const song of songs) {
    const songId = String(song.id || "").trim();
    if (!songId || seen.has(songId)) continue;

    const match = scoreCatalogSongMatch(song, query);
    if (!match) continue;

    seen.add(songId);
    scored.push(match);
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;

    const leftDistance = Math.abs(
      String(left.song.title || "").length - normalizedQuery.length
    );
    const rightDistance = Math.abs(
      String(right.song.title || "").length - normalizedQuery.length
    );
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    return String(left.song.title || "").localeCompare(String(right.song.title || ""));
  });

  return scored.slice(0, limit);
}

export function mergeCatalogSongLists(
  ...lists: HiddenTunesNormalizedSong[][]
): HiddenTunesNormalizedSong[] {
  const seen = new Set<string>();
  const merged: HiddenTunesNormalizedSong[] = [];

  for (const list of lists) {
    for (const song of list) {
      const id = String(song.id || "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(song);
    }
  }

  return merged;
}
