import type { HiddenTunesNormalizedSong } from "../services/hiddenTunesApi";
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
  | "album_match"
  | "genre_match"
  | "mood_match"
  | "lyric_match";

export type CatalogSongSearchHit = {
  song: HiddenTunesNormalizedSong;
  score: number;
  matchReason: CatalogSongMatchReason;
};

const REASON_SCORE: Record<CatalogSongMatchReason, number> = {
  exact_title: 10000,
  title_starts: 9000,
  title_contains: 8000,
  artist_exact: 7500,
  artist_starts: 7000,
  artist_contains: 6500,
  album_match: 6000,
  genre_match: 5500,
  mood_match: 5400,
  lyric_match: 5000,
};

/** TV and other non-catalog rows must stay below catalog song tiers. */
export const CATALOG_SEARCH_TV_MAX_SCORE = 2800;

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

function tokensMatchField(field: string, tokens: string[]) {
  if (!field || !tokens.length) return false;
  return tokens.every((token) => field.includes(token));
}

export function scoreCatalogSongMatch(
  song: HiddenTunesNormalizedSong,
  query: string
): CatalogSongSearchHit | null {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) return null;

  const title = normalizeSearchText(song.title);
  const artist = normalizeSearchText(song.artist);
  const album = normalizeSearchText(song.album);
  const genre = normalizeSearchText(song.genre);
  const mood = normalizeSearchText(song.mood);
  const queryTokens = tokenizeSearchText(normalizedQuery);

  let matchReason: CatalogSongMatchReason | null = null;

  if (title === normalizedQuery) {
    matchReason = "exact_title";
  } else if (title.startsWith(normalizedQuery)) {
    matchReason = "title_starts";
  } else if (title.includes(normalizedQuery)) {
    matchReason = "title_contains";
  } else if (tokensMatchField(title, queryTokens)) {
    matchReason = "title_contains";
  } else if (artist === normalizedQuery) {
    matchReason = "artist_exact";
  } else if (artist.startsWith(normalizedQuery)) {
    matchReason = "artist_starts";
  } else if (artist.includes(normalizedQuery)) {
    matchReason = "artist_contains";
  } else if (tokensMatchField(artist, queryTokens)) {
    matchReason = "artist_contains";
  } else if (album && (album === normalizedQuery || album.includes(normalizedQuery))) {
    matchReason = "album_match";
  } else if (tokensMatchField(album, queryTokens)) {
    matchReason = "album_match";
  } else if (mood && (mood === normalizedQuery || mood.includes(normalizedQuery))) {
    matchReason = "mood_match";
  } else if (genre && (genre === normalizedQuery || genre.includes(normalizedQuery))) {
    matchReason = "genre_match";
  } else if (tokensMatchField(genre, queryTokens) || tokensMatchField(mood, queryTokens)) {
    matchReason = genre ? "genre_match" : "mood_match";
  } else {
    const lyricsText = normalizeSearchText(getSongLyricsText(song));
    if (
      lyricsText &&
      (lyricsText.includes(normalizedQuery) ||
        tokensMatchField(lyricsText, queryTokens))
    ) {
      matchReason = "lyric_match";
    }
  }

  if (!matchReason) return null;

  let score = REASON_SCORE[matchReason];

  if (matchReason === "title_contains" && title.startsWith(queryTokens[0] || "")) {
    score += 120;
  }

  if (matchReason === "artist_contains" && artist.startsWith(queryTokens[0] || "")) {
    score += 80;
  }

  return {
    song,
    score,
    matchReason,
  };
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
  const scanPool =
    songs.length > limit * 6 ? songs.slice(0, limit * 6) : songs;

  for (const song of scanPool) {
    const songId = String(song.id || "").trim();
    if (!songId || seen.has(songId)) continue;

    const match = scoreCatalogSongMatch(song, query);
    if (!match) continue;

    seen.add(songId);
    scored.push(match);
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
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
