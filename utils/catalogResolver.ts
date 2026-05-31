import {
  genreListMatches,
  genreMatches,
  getCanonicalGenre,
  getCanonicalGenres,
  getGenreAliases,
  getVisibleCoreGenres,
  normalizeGenreKey,
} from "./genreAliases";
import {
  getSongNormalizedGenres,
  normalizeGenreName,
} from "./genreNormalization";
import { songMatchesMoodLabel } from "./moodRooms";

export type CatalogResolverType =
  | "genre"
  | "mood"
  | "artist"
  | "album"
  | "title"
  | "category";

export type CatalogSongLike = {
  title?: unknown;
  artist?: unknown;
  artist_name?: unknown;
  album?: unknown;
  album_title?: unknown;
  genre?: unknown;
  mood?: unknown;
  tags?: unknown;
  description?: unknown;
  [key: string]: unknown;
};

export type CanonicalGenre = {
  id: string;
  title: string;
  query: string;
  emoji: string;
  aliases: string[];
};

const GENRE_EMOJI: Record<string, string> = {
  Afrobeats: "🔥",
  "Hip-Hop": "🎤",
  "R&B": "💜",
  Soul: "🎷",
  Gospel: "🙏",
  Blues: "🎺",
  Jazz: "🎷",
  Reggae: "🟢",
  Dancehall: "🟡",
  Amapiano: "🎹",
  House: "🌍",
  EDM: "🪩",
  Pop: "🌟",
  Rock: "🎸",
  Indie: "🎧",
  Alternative: "🌙",
  Country: "🤠",
  Latin: "💃",
  Classical: "🎻",
  Folk: "🪕",
  Trap: "🔊",
  Drill: "⚡",
  "Lo-Fi": "🌃",
  Ambient: "🌫️",
  Instrumental: "🎼",
  Acoustic: "🪗",
  Funk: "🕺",
  Disco: "✨",
  Soundtrack: "🎬",
};

export const CANONICAL_GENRES: CanonicalGenre[] = getVisibleCoreGenres().map(
  (core) => ({
    id: core.id,
    title: core.title,
    query: core.title,
    emoji: GENRE_EMOJI[core.title] || "🎵",
    aliases: getGenreAliases(core.title),
  })
);

const GENRE_LOOKUP = new Map<string, CanonicalGenre>();

CANONICAL_GENRES.forEach((genre) => {
  [genre.id, genre.title, genre.query, ...genre.aliases].forEach((value) => {
    getComparableKeys(value).forEach((key) => GENRE_LOOKUP.set(key, genre));
  });
});

export function normalizeCatalogText(value: unknown) {
  return normalizeGenreKey(value);
}

export function normalizeCatalogKey(value: unknown) {
  return normalizeGenreKey(value).replace(/\s+/g, "");
}

function singularizeToken(token: string) {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss") && token !== "blues") {
    return token.slice(0, -1);
  }
  return token;
}

export function getComparableKeys(value: unknown) {
  const text = normalizeCatalogText(value);
  if (!text) return [];

  const singularText = text
    .split(" ")
    .map(singularizeToken)
    .join(" ");

  return Array.from(
    new Set([
      text,
      text.replace(/\s+/g, ""),
      singularText,
      singularText.replace(/\s+/g, ""),
    ])
  ).filter(Boolean);
}

export function resolveCanonicalGenre(value: unknown) {
  const title = getCanonicalGenre(value);
  if (!title) return null;

  return CANONICAL_GENRES.find((genre) => genre.title === title) || null;
}

export function getCanonicalGenreTitle(value: unknown) {
  return resolveCanonicalGenre(value)?.title || String(value || "").trim();
}

export function getCatalogMatchAliases(label: unknown, type: CatalogResolverType) {
  const raw = String(label || "").trim();

  if (type === "genre") {
    const canonicalTitle = getCanonicalGenre(raw) || raw;
    const aliases = getGenreAliases(canonicalTitle);

    return Array.from(new Set(aliases.flatMap(getComparableKeys))).filter(Boolean);
  }

  const canonical = resolveCanonicalGenre(raw);
  const aliases = canonical
    ? [canonical.title, canonical.query, canonical.id, ...canonical.aliases]
    : [raw];

  return Array.from(new Set(aliases.flatMap(getComparableKeys))).filter(Boolean);
}

export function buildSongSearchKeys(song: CatalogSongLike) {
  const values = [
    song.genre,
    song.mood,
    song.artist,
    song.artist_name,
    song.album,
    song.album_title,
    song.title,
    song.tags,
    song.description,
  ];

  return Array.from(new Set(values.flatMap(getComparableKeys))).filter(Boolean);
}

export function buildSongGenreKeys(song: CatalogSongLike) {
  const merged = new Set<string>();

  getSongNormalizedGenres(song).forEach((value) => {
    merged.add(value);
    getCanonicalGenres(value).forEach((core) => {
      merged.add(core);
      getGenreAliases(core).forEach((alias) => merged.add(alias));
    });
  });

  return Array.from(new Set(Array.from(merged).flatMap(getComparableKeys))).filter(
    Boolean
  );
}

export function songMatchesCatalogLabel(
  song: CatalogSongLike,
  label: unknown,
  type: CatalogResolverType = "category"
) {
  const rawLabel = String(label || "").trim();
  if (!rawLabel) return false;

  if (type === "genre") {
    const target = normalizeGenreName(rawLabel);
    if (!target) return false;
    return getSongNormalizedGenres(song).includes(target);
  }

  if (type === "mood") {
    return songMatchesMoodLabel(song, rawLabel);
  }

  const aliases = getCatalogMatchAliases(rawLabel, type);
  if (!aliases.length) return false;

  const songKeys = buildSongSearchKeys(song);
  if (!songKeys.length) return false;

  return aliases.some((alias) =>
    songKeys.some((key) => {
      if (key === alias) return true;
      if (alias.length <= 3 || key.length <= 3) return false;
      return key.includes(alias) || alias.includes(key);
    })
  );
}

export function filterSongsByCatalogLabel<T extends CatalogSongLike>(
  songs: T[],
  label: unknown,
  type: CatalogResolverType = "category"
) {
  return songs.filter((song) => songMatchesCatalogLabel(song, label, type));
}

export function getCatalogResolverDebugInfo<T extends CatalogSongLike>({
  label,
  type,
  songs,
  matchedSongs,
  fallbackUsed,
  artworkSource,
  finalArtworkUrl,
}: {
  label: unknown;
  type: CatalogResolverType;
  songs: T[];
  matchedSongs: T[];
  fallbackUsed?: boolean;
  artworkSource?: string;
  finalArtworkUrl?: string | null;
}) {
  return {
    clickedLabel: String(label || ""),
    resolverType: type,
    normalizedKey: normalizeCatalogKey(label),
    aliasesChecked: getCatalogMatchAliases(label, type),
    sourceSongCount: songs.length,
    matchedSongCount: matchedSongs.length,
    fallbackUsed: Boolean(fallbackUsed),
    artworkSelectedSource: artworkSource || "unknown",
    finalArtworkUrlPresent: Boolean(finalArtworkUrl),
  };
}

export function logCatalogResolverDebug<T extends CatalogSongLike>(
  message: string,
  info: ReturnType<typeof getCatalogResolverDebugInfo<T>>
) {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.log(`[HiddenTunesCatalogResolver] ${message}`, info);
  }
}

export type CatalogTarget = {
  type: CatalogResolverType;
  id: string;
  title: string;
  query: string;
  labels: string[];
  cacheKey: string;
};

export type CatalogEmptyStateReason =
  | "content_available"
  | "awaiting_cache_and_api"
  | "cache_api_and_resolver_empty";

export function buildCatalogTarget(input: {
  type?: CatalogResolverType;
  id?: string;
  title?: string;
  query?: string;
}): CatalogTarget {
  const type = input.type || "genre";
  const rawTitle = String(input.title || input.query || input.id || "").trim();
  const canonical = type === "genre" ? resolveCanonicalGenre(rawTitle) : null;
  const title = canonical?.title || rawTitle || "Catalog";
  const query = String(input.query || canonical?.query || title).trim();
  const id = String(input.id || canonical?.id || normalizeCatalogKey(title)).trim();
  const labels = Array.from(
    new Set(
      [
        title,
        query,
        id,
        rawTitle,
        ...(type === "genre" ? getGenreAliases(title) : canonical?.aliases || []),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  return {
    type,
    id,
    title,
    query,
    labels,
    cacheKey: `${type}:${normalizeCatalogKey(labels.join("|"))}`,
  };
}

export function matchSongsForCatalogTarget<T extends CatalogSongLike>(
  songs: T[],
  target: CatalogTarget
): T[] {
  const seen = new Set<string>();
  const matches: T[] = [];

  if (target.type === "genre") {
    songs.forEach((song) => {
      const genreValues = [
        song.genre,
        song.mood,
        ...(Array.isArray(song.tags) ? song.tags : []),
      ];

      if (!genreListMatches(genreValues, target.title)) return;

      const key = String((song as { id?: unknown }).id || "")
        .toLowerCase()
        .trim();

      if (!key || seen.has(key)) return;

      seen.add(key);
      matches.push(song);
    });

    return matches;
  }

  target.labels.forEach((label) => {
    filterSongsByCatalogLabel(songs, label, target.type).forEach((song) => {
      const key = String((song as { id?: unknown }).id || "")
        .toLowerCase()
        .trim();

      if (!key || seen.has(key)) return;

      seen.add(key);
      matches.push(song);
    });
  });

  return matches;
}

export function resolveCatalogEmptyState(input: {
  hasCheckedFallbacks: boolean;
  isLoading: boolean;
  isRefreshing?: boolean;
  resolvedCount: number;
}) {
  if (input.resolvedCount > 0) {
    return {
      showEmpty: false,
      reason: "content_available" as CatalogEmptyStateReason,
    };
  }

  if (input.isRefreshing || !input.hasCheckedFallbacks || input.isLoading) {
    return {
      showEmpty: false,
      reason: "awaiting_cache_and_api" as CatalogEmptyStateReason,
    };
  }

  return {
    showEmpty: true,
    reason: "cache_api_and_resolver_empty" as CatalogEmptyStateReason,
  };
}

export {
  genreMatches,
  genreListMatches,
  getCanonicalGenres,
  getGenreAliases,
  getVisibleCoreGenres,
} from "./genreAliases";
