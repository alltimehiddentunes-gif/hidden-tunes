/**
 * Sports personalization types — Phase 2C.
 * Preference profiles are internal only; never returned on public APIs.
 */

export type SportsRecommendationReasonCode =
  | "continue_watching"
  | "followed_team"
  | "followed_athlete"
  | "followed_competition"
  | "favorite_sport"
  | "reminder"
  | "popular"
  | "trending";

export type SportsRecommendationReason = {
  code: SportsRecommendationReasonCode;
  label: string;
};

/** Serializable profile for cache boundaries. */
export type SportsPreferenceProfileData = {
  userId: string;
  explicit: {
    sportIds: string[];
    competitionIds: string[];
    teamIds: string[];
    athleteIds: string[];
    countryCodes: string[];
    languageCodes: string[];
    favoriteFixtureIds: string[];
  };
  implicit: {
    sportAffinity: Record<string, number>;
    competitionAffinity: Record<string, number>;
    teamAffinity: Record<string, number>;
    athleteAffinity: Record<string, number>;
  };
  reminders: string[];
  continueWatchingFixtureIds: string[];
  /** Fixture open counts (weak). */
  fixtureOpenCounts: Record<string, number>;
  generatedAt: string;
};

export type SportsPreferenceProfile = {
  userId: string;
  explicit: {
    sportIds: Set<string>;
    competitionIds: Set<string>;
    teamIds: Set<string>;
    athleteIds: Set<string>;
    countryCodes: Set<string>;
    languageCodes: Set<string>;
    favoriteFixtureIds: Set<string>;
  };
  implicit: {
    sportAffinity: Map<string, number>;
    competitionAffinity: Map<string, number>;
    teamAffinity: Map<string, number>;
    athleteAffinity: Map<string, number>;
  };
  reminders: Set<string>;
  continueWatchingFixtureIds: Set<string>;
  fixtureOpenCounts: Map<string, number>;
  generatedAt: string;
};

export type SportsMatchScore = {
  continueWatching: number;
  reminder: number;
  followedTeam: number;
  followedAthlete: number;
  followedCompetition: number;
  preferredSport: number;
  preferredCountry: number;
  preferredLanguage: number;
  implicitAffinity: number;
  livePriority: number;
  freshness: number;
  editorialPriority: number;
  globalImportance: number;
  discoveryAdjustment: number;
  total: number;
};

export type ScoredItem<T> = {
  item: T;
  score: number;
  breakdown?: SportsMatchScore;
  reason?: SportsRecommendationReason | null;
  /** Stable tie-break key. */
  tieKey: string;
  /** Discovery candidate (not top preference). */
  isDiscovery?: boolean;
  /** Editorial tier for Featured (lower = more important). */
  editorialTier?: number;
  /** Schedule group for Today's Schedule. */
  scheduleGroup?: number;
  /** Start time ms for Starting Soon / schedule. */
  startsAtMs?: number;
};

export type DiscoveryMixConfig = {
  /** Preference slots per 10. */
  preferencePerTen: number;
  /** Discovery slots per 10. */
  discoveryPerTen: number;
};

export type SectionRankMode =
  | "preference_discovery"
  | "editorial_led"
  | "follow_led"
  | "continue_watching"
  | "trend_led"
  | "browse_retain_all"
  | "schedule_groups";
