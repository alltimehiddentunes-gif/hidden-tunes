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

export const CANONICAL_GENRES: CanonicalGenre[] = [
  {
    id: "afrobeats",
    title: "Afrobeats",
    query: "Afrobeats",
    emoji: "🔥",
    aliases: [
      "Afrobeat",
      "Afrobeats",
      "Afro Beat",
      "Afro Beats",
      "Afropop",
      "Afro-pop",
    ],
  },
  {
    id: "amapiano",
    title: "Amapiano",
    query: "Amapiano",
    emoji: "🎹",
    aliases: ["Amapiano", "Ama Piano"],
  },
  {
    id: "gospel-worship",
    title: "Gospel / Worship",
    query: "Gospel Worship",
    emoji: "🙏",
    aliases: ["Gospel", "Worship", "Christian"],
  },
  {
    id: "hip-hop-rap",
    title: "Hip-Hop / Rap",
    query: "Hip-Hop Rap",
    emoji: "🎤",
    aliases: ["Hip Hop", "Hiphop", "Hip-Hop", "Rap"],
  },
  {
    id: "rnb-soul",
    title: "R&B / Soul",
    query: "R&B Soul",
    emoji: "💜",
    aliases: ["R&B", "RnB", "R and B", "Rhythm and Blues"],
  },
  {
    id: "reggae-dancehall",
    title: "Reggae / Dancehall",
    query: "Reggae Dancehall",
    emoji: "🟢",
    aliases: ["Reggae", "Roots Reggae", "Dancehall", "Dance Hall"],
  },
  {
    id: "highlife",
    title: "Highlife",
    query: "Highlife",
    emoji: "🌞",
    aliases: ["Highlife", "Hi-Life"],
  },
  {
    id: "soul-blues",
    title: "Soul Blues",
    query: "Soul Blues",
    emoji: "🎺",
    aliases: ["Soul Blues", "Soul-Blues", "Blues"],
  },
  {
    id: "lo-fi",
    title: "Lo-fi",
    query: "Lo-fi",
    emoji: "🌃",
    aliases: ["Lo-fi", "Lofi", "Lo Fi"],
  },
  {
    id: "jazz",
    title: "Jazz",
    query: "Jazz",
    emoji: "🎷",
    aliases: ["Jazz"],
  },
  {
    id: "pop",
    title: "Pop",
    query: "Pop",
    emoji: "🌟",
    aliases: ["Pop"],
  },
  {
    id: "rock",
    title: "Rock",
    query: "Rock",
    emoji: "🎸",
    aliases: ["Rock"],
  },
  {
    id: "country",
    title: "Country",
    query: "Country",
    emoji: "🤠",
    aliases: ["Country"],
  },
  {
    id: "instrumental",
    title: "Instrumental",
    query: "Instrumental",
    emoji: "🎧",
    aliases: ["Instrumental"],
  },
  {
    id: "electronic",
    title: "Electronic",
    query: "Electronic",
    emoji: "🪩",
    aliases: ["Electronic", "EDM", "House", "Techno", "Dance"],
  },
  {
    id: "afro-house",
    title: "Afro House",
    query: "Afro House",
    emoji: "🌍",
    aliases: ["Afro House", "Afrohouse"],
  },
  {
    id: "traditional-folk",
    title: "Traditional / Folk",
    query: "Traditional Folk",
    emoji: "🪕",
    aliases: ["Traditional", "Folk", "World"],
  },
];

const GENRE_LOOKUP = new Map<string, CanonicalGenre>();

CANONICAL_GENRES.forEach((genre) => {
  [genre.id, genre.title, genre.query, ...genre.aliases].forEach((value) => {
    getComparableKeys(value).forEach((key) => GENRE_LOOKUP.set(key, genre));
  });
});

export function normalizeCatalogText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCatalogKey(value: unknown) {
  return normalizeCatalogText(value).replace(/\s+/g, "");
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
  const keys = getComparableKeys(value);
  for (const key of keys) {
    const match = GENRE_LOOKUP.get(key);
    if (match) return match;
  }
  return null;
}

export function getCanonicalGenreTitle(value: unknown) {
  return resolveCanonicalGenre(value)?.title || String(value || "").trim();
}

export function getCatalogMatchAliases(label: unknown, type: CatalogResolverType) {
  const raw = String(label || "").trim();
  const canonical = type === "genre" ? resolveCanonicalGenre(raw) : null;
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
  return Array.from(new Set(getComparableKeys(song.genre))).filter(Boolean);
}

export function songMatchesCatalogLabel(
  song: CatalogSongLike,
  label: unknown,
  type: CatalogResolverType = "category"
) {
  const aliases = getCatalogMatchAliases(label, type);
  if (!aliases.length) return false;

  if (type === "genre") {
    const genreKeys = buildSongGenreKeys(song);
    return aliases.some((alias) => genreKeys.includes(alias));
  }

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
