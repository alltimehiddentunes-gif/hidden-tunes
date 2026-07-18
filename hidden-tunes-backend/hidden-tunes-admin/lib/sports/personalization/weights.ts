/**
 * Centralized Sports personalization weights and thresholds.
 * Internal defaults — not a public contract.
 */

export const SPORTS_EXPLICIT_WEIGHTS = {
  followedTeam: 120,
  followedAthlete: 120,
  reminderFixture: 110,
  followedCompetition: 95,
  followedSport: 75,
  favoriteFixture: 70,
  preferredCountry: 25,
  preferredLanguage: 20,
} as const;

export const SPORTS_IMPLICIT_WEIGHTS = {
  continueWatchingSameFixture: 140,
  completedMeaningfulSession: 60,
  meaningfulWatchSession: 45,
  repeatedParticipantViewing: 35,
  repeatedCompetitionViewing: 30,
  repeatedSportViewing: 20,
  recentSportsSearch: 15,
  singleFixtureOpen: 4,
} as const;

/** Reuses Sports watch-history semantics: completed flag + progress ratio. */
export const SPORTS_MEANINGFUL_WATCH = {
  /** Absolute floor — matches short-form meaningful engagement. */
  minPositionMs: 60_000,
  /** Progress ratio used alongside `completed` on sports_watch_history. */
  minProgressRatio: 0.25,
  /** Mobile continue-watching completion threshold (sportsWatchHistory). */
  continueWatchingCompleteRatio: 0.95,
} as const;

export const SPORTS_DECAY_BUCKETS = [
  { maxAgeDays: 7, factor: 1 },
  { maxAgeDays: 30, factor: 0.75 },
  { maxAgeDays: 90, factor: 0.45 },
  { maxAgeDays: 180, factor: 0.2 },
  { maxAgeDays: Number.POSITIVE_INFINITY, factor: 0.05 },
] as const;

export const SPORTS_PERSONALIZATION_BOUNDS = {
  maxHistoryRows: 200,
  maxLookbackDays: 180,
  maxCandidatesPerSection: 150,
  profileCacheTtlMs: 60_000,
  maxFollows: 200,
  maxFavorites: 100,
  maxReminders: 100,
} as const;

export const SPORTS_SECTION_DISCOVERY: Record<
  string,
  { preferencePerTen: number; discoveryPerTen: number } | "none" | "editorial" | "trend"
> = {
  live_now: { preferencePerTen: 7, discoveryPerTen: 3 },
  starting_soon: { preferencePerTen: 7, discoveryPerTen: 3 },
  featured: "editorial",
  because_you_follow: { preferencePerTen: 9, discoveryPerTen: 1 },
  continue_watching: "none",
  popular_competitions: { preferencePerTen: 7.5, discoveryPerTen: 2.5 },
  browse_sports: "none",
  browse_countries: "none",
  todays_schedule: { preferencePerTen: 7, discoveryPerTen: 3 },
  trending: "trend",
  recently_finished: { preferencePerTen: 7, discoveryPerTen: 3 },
  highlights: { preferencePerTen: 7, discoveryPerTen: 3 },
  replays: { preferencePerTen: 7, discoveryPerTen: 3 },
};

export const SPORTS_LIVE_PRIORITY = 40;
export const SPORTS_FRESHNESS_MAX = 25;
export const SPORTS_EDITORIAL_MAX = 50;
export const SPORTS_GLOBAL_IMPORTANCE_MAX = 30;
