import type { HiddenTunesSong } from "../services/hiddenTunes";

export type SearchMatchReason =
  | "exact_artist"
  | "exact_title"
  | "exact_album"
  | "artist_starts_with"
  | "title_starts_with"
  | "album_starts_with"
  | "artist_contains"
  | "title_contains"
  | "album_contains"
  | "genre_contains"
  | "mood_contains"
  | "tag_description_contains"
  | "related_fallback"
  | "external_fallback"
  | "none";

export type SearchRankableItem = {
  artist?: unknown;
  name?: unknown;
  title?: unknown;
  album?: unknown;
  genre?: unknown;
  mood?: unknown;
  tags?: unknown;
  description?: unknown;
  lyrics?: unknown;
  streamUrl?: unknown;
  url?: unknown;
  isOnline?: unknown;
};

export type SearchRankScore = {
  score: number;
  reason: SearchMatchReason;
  textDistance: number;
  isPlayable: boolean;
};

export const SEARCH_SCORE = {
  exactArtist: 10000,
  exactTitle: 9000,
  exactAlbum: 8000,
  artistStartsWith: 7000,
  titleStartsWith: 6500,
  albumStartsWith: 6000,
  artistContains: 5000,
  titleContains: 4500,
  albumContains: 4000,
  genreContains: 2000,
  moodContains: 1500,
  tagDescriptionContains: 500,
  relatedFallbackMax: 300,
  externalFallbackMax: 100,
} as const;

export function normalizeSearchRankingText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryTokens(query: string) {
  return normalizeSearchRankingText(query).split(" ").filter(Boolean);
}

function tokensMatchField(field: string, tokens: string[]) {
  if (!field || !tokens.length) return false;
  return tokens.every((token) => field.includes(token));
}

function textDistance(query: string, ...values: unknown[]) {
  const normalizedQuery = normalizeSearchRankingText(query);
  if (!normalizedQuery) return 9999;

  let best = 9999;
  for (const value of values) {
    const field = normalizeSearchRankingText(value);
    if (!field) continue;
    best = Math.min(best, Math.abs(field.length - normalizedQuery.length));
    if (field.includes(normalizedQuery)) {
      best = Math.min(best, field.length - normalizedQuery.length);
    }
  }

  return best;
}

function isPlayableItem(item: SearchRankableItem) {
  const streamUrl = String(item.streamUrl || item.url || "").trim();
  if (streamUrl) return true;
  return item.isOnline !== false;
}

function applyScore(
  current: { score: number; reason: SearchMatchReason },
  nextScore: number,
  nextReason: SearchMatchReason
) {
  if (nextScore > current.score) {
    current.score = nextScore;
    current.reason = nextReason;
  }
}

export function scoreSearchResult(
  item: SearchRankableItem,
  query: string,
  options: {
    isRelatedFallback?: boolean;
    isExternal?: boolean;
  } = {}
): SearchRankScore {
  const normalizedQuery = normalizeSearchRankingText(query);
  const tokens = queryTokens(query);
  const result = { score: 0, reason: "none" as SearchMatchReason };

  if (!normalizedQuery || normalizedQuery.length < 2) {
    return {
      score: 0,
      reason: "none",
      textDistance: 9999,
      isPlayable: isPlayableItem(item),
    };
  }

  const artist = normalizeSearchRankingText(item.artist || item.name);
  const title = normalizeSearchRankingText(item.title);
  const album = normalizeSearchRankingText(item.album);
  const genre = normalizeSearchRankingText(item.genre);
  const mood = normalizeSearchRankingText(item.mood);
  const tagText = normalizeSearchRankingText(
    [item.tags, item.description, item.lyrics].filter(Boolean).join(" ")
  );

  if (artist) {
    if (artist === normalizedQuery) {
      applyScore(result, SEARCH_SCORE.exactArtist, "exact_artist");
    } else if (artist.startsWith(normalizedQuery)) {
      applyScore(result, SEARCH_SCORE.artistStartsWith, "artist_starts_with");
    } else if (artist.includes(normalizedQuery) || tokensMatchField(artist, tokens)) {
      applyScore(result, SEARCH_SCORE.artistContains, "artist_contains");
    }
  }

  if (title) {
    if (title === normalizedQuery) {
      applyScore(result, SEARCH_SCORE.exactTitle, "exact_title");
    } else if (title.startsWith(normalizedQuery)) {
      applyScore(result, SEARCH_SCORE.titleStartsWith, "title_starts_with");
    } else if (title.includes(normalizedQuery) || tokensMatchField(title, tokens)) {
      applyScore(result, SEARCH_SCORE.titleContains, "title_contains");
    }
  }

  if (album) {
    if (album === normalizedQuery) {
      applyScore(result, SEARCH_SCORE.exactAlbum, "exact_album");
    } else if (album.startsWith(normalizedQuery)) {
      applyScore(result, SEARCH_SCORE.albumStartsWith, "album_starts_with");
    } else if (album.includes(normalizedQuery) || tokensMatchField(album, tokens)) {
      applyScore(result, SEARCH_SCORE.albumContains, "album_contains");
    }
  }

  if (genre && (genre.includes(normalizedQuery) || tokensMatchField(genre, tokens))) {
    applyScore(result, SEARCH_SCORE.genreContains, "genre_contains");
  }

  if (mood && (mood.includes(normalizedQuery) || tokensMatchField(mood, tokens))) {
    applyScore(result, SEARCH_SCORE.moodContains, "mood_contains");
  }

  if (tagText && (tagText.includes(normalizedQuery) || tokensMatchField(tagText, tokens))) {
    applyScore(result, SEARCH_SCORE.tagDescriptionContains, "tag_description_contains");
  }

  if (options.isRelatedFallback) {
    result.score = Math.min(
      result.score > 0 ? result.score : SEARCH_SCORE.relatedFallbackMax,
      SEARCH_SCORE.relatedFallbackMax
    );
    if (result.reason === "none") {
      result.reason = "related_fallback";
    }
  }

  if (options.isExternal) {
    result.score = Math.min(
      result.score > 0 ? result.score : SEARCH_SCORE.externalFallbackMax,
      SEARCH_SCORE.externalFallbackMax
    );
    if (result.reason === "none") {
      result.reason = "external_fallback";
    }
  }

  return {
    score: result.score,
    reason: result.reason,
    textDistance: textDistance(query, artist, title, album),
    isPlayable: isPlayableItem(item),
  };
}

export type RankedSearchItem<T> = {
  item: T;
  score: number;
  reason: SearchMatchReason;
  textDistance: number;
  isPlayable: boolean;
  catalogIndex: number;
};

export function compareRankedSearchItems<T extends SearchRankableItem>(
  left: RankedSearchItem<T>,
  right: RankedSearchItem<T>
) {
  if (right.score !== left.score) return right.score - left.score;
  if (left.isPlayable !== right.isPlayable) return left.isPlayable ? -1 : 1;
  if (left.textDistance !== right.textDistance) return left.textDistance - right.textDistance;
  return left.catalogIndex - right.catalogIndex;
}

export function rankSearchItems<T extends SearchRankableItem>(
  items: T[],
  query: string,
  options: {
    limit?: number;
    isRelatedFallback?: boolean;
    isExternal?: boolean;
    getScoreItem?: (item: T) => SearchRankableItem;
  } = {}
): RankedSearchItem<T>[] {
  const limit = options.limit ?? items.length;
  const getScoreItem = options.getScoreItem ?? ((item: T) => item);

  const ranked = items.map((item, catalogIndex) => {
    const scored = scoreSearchResult(getScoreItem(item), query, {
      isRelatedFallback: options.isRelatedFallback,
      isExternal: options.isExternal,
    });

    return {
      item,
      score: scored.score,
      reason: scored.reason,
      textDistance: scored.textDistance,
      isPlayable: scored.isPlayable,
      catalogIndex,
    };
  });

  ranked.sort(compareRankedSearchItems);
  return ranked.filter((entry) => entry.score > 0).slice(0, limit);
}

export function rankSearchSongs(
  songs: HiddenTunesSong[],
  query: string,
  options: {
    limit?: number;
    isRelatedFallback?: boolean;
    isExternal?: boolean;
  } = {}
) {
  return rankSearchItems(songs, query, options);
}

export function unwrapRankedSearchItems<T>(ranked: RankedSearchItem<T>[]) {
  return ranked.map((entry) => entry.item);
}

export function countDirectSearchMatches<T extends SearchRankableItem>(
  ranked: RankedSearchItem<T>[]
) {
  return ranked.filter((entry) => entry.score >= SEARCH_SCORE.albumContains).length;
}

export function countFallbackDemoted<T extends SearchRankableItem>(
  ranked: RankedSearchItem<T>[]
) {
  return ranked.filter(
    (entry) =>
      entry.reason === "related_fallback" ||
      entry.reason === "external_fallback" ||
      entry.reason === "mood_contains" ||
      entry.reason === "genre_contains" ||
      entry.reason === "tag_description_contains"
  ).length;
}
