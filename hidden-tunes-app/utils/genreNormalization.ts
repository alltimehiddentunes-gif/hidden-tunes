import { getCanonicalGenre } from "./genreAliases";

function collapseSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function cleanGenreToken(value: string) {
  return collapseSpaces(
    value
      .replace(/[_]+/g, " ")
      .replace(/\s*[-–—]\s*/g, " ")
      .replace(/[^\w\s&']/gi, " ")
  );
}

function titleCaseUnknownGenre(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && word !== "r&b") {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function collectRawGenreTokens(value: unknown): string[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRawGenreTokens(item));
  }

  const raw = String(value).trim();
  if (!raw) return [];

  if (raw.includes(",")) {
    return raw.split(",").flatMap((part) => collectRawGenreTokens(part));
  }

  if (raw.includes("|")) {
    return raw.split("|").flatMap((part) => collectRawGenreTokens(part));
  }

  if (raw.includes("/")) {
    return raw.split("/").flatMap((part) => collectRawGenreTokens(part));
  }

  return [raw];
}

/** Canonical display name for a single genre label (Afrobeat → Afrobeats, etc.). */
export function normalizeGenreName(value: string | null | undefined): string {
  const cleaned = cleanGenreToken(String(value || ""));
  if (!cleaned) return "";

  const canonical = getCanonicalGenre(cleaned);
  if (canonical) return canonical;

  return titleCaseUnknownGenre(cleaned);
}

type GenreFieldSong = {
  genre?: unknown;
  genres?: unknown;
  primaryGenre?: unknown;
  primary_genre?: unknown;
  moodGenre?: unknown;
  tags?: unknown;
};

/** Unique normalized genre display names from genre metadata only (not mood). */
export function getSongNormalizedGenres(song: GenreFieldSong | null | undefined): string[] {
  if (!song) return [];

  const rawValues = [
    ...collectRawGenreTokens(song.genre),
    ...collectRawGenreTokens(song.genres),
    ...collectRawGenreTokens(song.primaryGenre),
    ...collectRawGenreTokens(song.primary_genre),
    ...collectRawGenreTokens(song.moodGenre),
  ];

  const seen = new Set<string>();
  const normalized: string[] = [];

  rawValues.forEach((value) => {
    const name = normalizeGenreName(value);
    if (!name || seen.has(name)) return;
    seen.add(name);
    normalized.push(name);
  });

  return normalized;
}

export function songHasNormalizedGenre(
  song: GenreFieldSong | null | undefined,
  genre: string | null | undefined
): boolean {
  const target = normalizeGenreName(genre);
  if (!target) return false;
  return getSongNormalizedGenres(song).includes(target);
}
