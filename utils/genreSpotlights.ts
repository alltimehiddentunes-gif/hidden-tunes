/**
 * Bounded local Genre Spotlight ranking for Home.
 * Pure scoring — no network, no ML, stable for the same signals.
 */

export const HOME_GENRE_SPOTLIGHT_DEFAULT = 4;
export const HOME_GENRE_SPOTLIGHT_MAX = 6;

export type GenreSpotlightCandidate = {
  id: string;
  title: string;
  artwork?: string;
  songs: Array<{
    id?: unknown;
    genre?: unknown;
    artwork?: unknown;
    cover?: unknown;
    thumbnail?: unknown;
  }>;
};

export type GenreSpotlightSignals = {
  onboardingGenres: string[];
  /** Genre labels derived from recently played catalogue joins. */
  recentPlayGenres: Array<{ genre: string; weight: number }>;
  /** Genre labels derived from liked/favourited songs. */
  favoriteGenres: Array<{ genre: string; weight: number }>;
  /** Recent search queries (memory cache only — no Search behaviour change). */
  searchQueries: string[];
  /** Genre pages opened recently (bounded local engagement). */
  openedGenres: Array<{ genre: string; openedAt: number }>;
  /** Weak boost from Mood Room opens that contained these genres. */
  moodEngagementGenres: Array<{ genre: string; weight: number }>;
};

export type RankedGenreSpotlight<T extends GenreSpotlightCandidate> = T & {
  spotlightScore: number;
  spotlightReasons: string[];
};

const WEIGHTS = {
  onboarding: 120,
  frequentPlay: 90,
  recentSearch: 75,
  favorite: 55,
  recentPlay: 45,
  opened: 35,
  moodEngagement: 20,
  editorial: 10,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeLabel(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function labelsMatch(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function decayFactor(openedAt: number, now: number) {
  const ageDays = Math.max(0, (now - openedAt) / DAY_MS);
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.7;
  if (ageDays <= 30) return 0.4;
  return 0.2;
}

function accumulate(
  score: number,
  reasons: string[],
  amount: number,
  reason: string
) {
  if (amount <= 0) return score;
  reasons.push(reason);
  return score + amount;
}

export function scoreGenreSpotlight(
  genre: GenreSpotlightCandidate,
  signals: GenreSpotlightSignals,
  now = Date.now()
): { score: number; reasons: string[] } {
  const title = normalizeLabel(genre.title);
  const reasons: string[] = [];
  let score = 0;

  const onboardingHit = signals.onboardingGenres.some((item) =>
    labelsMatch(title, normalizeLabel(item))
  );
  if (onboardingHit) {
    score = accumulate(score, reasons, WEIGHTS.onboarding, "onboarding");
  }

  for (const entry of signals.recentPlayGenres) {
    if (!labelsMatch(title, normalizeLabel(entry.genre))) continue;
    const weight = Math.min(3, Math.max(0, entry.weight));
    // Repeated plays outweigh a single accidental play.
    const amount =
      weight >= 2
        ? WEIGHTS.frequentPlay * Math.min(1, weight / 3)
        : WEIGHTS.recentPlay * Math.min(1, Math.max(0.35, weight));
    score = accumulate(
      score,
      reasons,
      amount,
      weight >= 2 ? "frequent_play" : "recent_play"
    );
  }

  for (const query of signals.searchQueries) {
    const q = normalizeLabel(query);
    if (!q || q.length < 2) continue;
    if (labelsMatch(title, q)) {
      score = accumulate(score, reasons, WEIGHTS.recentSearch, "search");
      break;
    }
  }

  for (const entry of signals.favoriteGenres) {
    if (!labelsMatch(title, normalizeLabel(entry.genre))) continue;
    const weight = Math.min(3, Math.max(0, entry.weight));
    score = accumulate(
      score,
      reasons,
      WEIGHTS.favorite * Math.min(1, weight / 2),
      "favorite"
    );
  }

  for (const entry of signals.openedGenres) {
    if (!labelsMatch(title, normalizeLabel(entry.genre))) continue;
    const amount = WEIGHTS.opened * decayFactor(entry.openedAt, now);
    score = accumulate(score, reasons, amount, "opened");
  }

  for (const entry of signals.moodEngagementGenres) {
    if (!labelsMatch(title, normalizeLabel(entry.genre))) continue;
    score = accumulate(
      score,
      reasons,
      WEIGHTS.moodEngagement * Math.min(1, entry.weight),
      "mood_room"
    );
  }

  // Stable editorial fallback from catalogue depth (never dominant alone).
  const songCount = Array.isArray(genre.songs) ? genre.songs.length : 0;
  if (songCount > 0) {
    // Keep relative depth (Pop > niche) without flattening mid-tier catalogues.
    const editorial = Math.min(
      WEIGHTS.editorial,
      Math.log2(songCount + 1) * 1.7
    );
    score = accumulate(score, reasons, editorial, "editorial");
  }

  return { score, reasons };
}

export function buildGenreSpotlightSignalHash(signals: GenreSpotlightSignals) {
  const parts = [
    signals.onboardingGenres.map(normalizeLabel).sort().join(","),
    signals.recentPlayGenres
      .map((item) => `${normalizeLabel(item.genre)}:${item.weight.toFixed(2)}`)
      .sort()
      .join(","),
    signals.favoriteGenres
      .map((item) => `${normalizeLabel(item.genre)}:${item.weight.toFixed(2)}`)
      .sort()
      .join(","),
    signals.searchQueries.map(normalizeLabel).sort().join(","),
    signals.openedGenres
      .map((item) => `${normalizeLabel(item.genre)}:${item.openedAt}`)
      .sort()
      .join(","),
    signals.moodEngagementGenres
      .map((item) => `${normalizeLabel(item.genre)}:${item.weight.toFixed(2)}`)
      .sort()
      .join(","),
  ];
  return parts.join("|");
}

export function hasPersonalGenreSpotlightSignals(signals: GenreSpotlightSignals) {
  return (
    signals.onboardingGenres.length > 0 ||
    signals.recentPlayGenres.length > 0 ||
    signals.favoriteGenres.length > 0 ||
    signals.searchQueries.length > 0 ||
    signals.openedGenres.length > 0 ||
    signals.moodEngagementGenres.length > 0
  );
}

export function resolveGenreSpotlightLimit(windowWidth: number) {
  if (windowWidth >= 680) return HOME_GENRE_SPOTLIGHT_MAX;
  return HOME_GENRE_SPOTLIGHT_DEFAULT;
}

/**
 * Rank genres for Home. Never returns more than `limit` (4–6).
 * Stable sort: score desc, then title asc, then id asc.
 */
export function rankGenreSpotlights<T extends GenreSpotlightCandidate>(
  genres: T[],
  signals: GenreSpotlightSignals,
  limit = HOME_GENRE_SPOTLIGHT_DEFAULT,
  now = Date.now()
): RankedGenreSpotlight<T>[] {
  const capped = Math.max(
    1,
    Math.min(HOME_GENRE_SPOTLIGHT_MAX, Math.floor(limit) || HOME_GENRE_SPOTLIGHT_DEFAULT)
  );

  const ranked = genres.map((genre) => {
    const { score, reasons } = scoreGenreSpotlight(genre, signals, now);
    return {
      ...genre,
      spotlightScore: score,
      spotlightReasons: reasons,
    };
  });

  ranked.sort((left, right) => {
    if (right.spotlightScore !== left.spotlightScore) {
      return right.spotlightScore - left.spotlightScore;
    }
    const titleCmp = String(left.title || "").localeCompare(String(right.title || ""));
    if (titleCmp !== 0) return titleCmp;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });

  return ranked.slice(0, capped);
}

export function collectGenreWeightsFromSongs(
  items: Array<{ id?: unknown; genre?: unknown; playCount?: unknown }>,
  catalogById: Map<string, { genre?: unknown }>
) {
  const weights = new Map<string, number>();

  for (const item of items) {
    const id = String(item?.id || "").trim();
    const catalogGenre = id ? catalogById.get(id)?.genre : undefined;
    const genre = normalizeLabel(item?.genre || catalogGenre);
    if (!genre) continue;
    const playBoost =
      typeof item.playCount === "number" && Number.isFinite(item.playCount)
        ? Math.min(3, Math.max(1, item.playCount))
        : 1;
    weights.set(genre, (weights.get(genre) || 0) + playBoost);
  }

  return Array.from(weights.entries()).map(([genre, weight]) => ({ genre, weight }));
}

export function emptyGenreSpotlightSignals(): GenreSpotlightSignals {
  return {
    onboardingGenres: [],
    recentPlayGenres: [],
    favoriteGenres: [],
    searchQueries: [],
    openedGenres: [],
    moodEngagementGenres: [],
  };
}
