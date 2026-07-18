/**
 * Sports home IA public contract — Phase 2B.
 * Browse responses never include provider playback URLs or embed HTML.
 */

export const SPORTS_PUBLIC_EVENT_STATUSES = [
  "scheduled",
  "starting_soon",
  "live",
  "half_time",
  "intermission",
  "extra_time",
  "penalties",
  "delayed",
  "postponed",
  "cancelled",
  "finished",
  "replay_available",
  "highlights_available",
  "unavailable",
] as const;

export type SportsPublicEventStatus =
  (typeof SPORTS_PUBLIC_EVENT_STATUSES)[number];

export type SportsWatchabilityState =
  | "watch"
  | "starting_soon"
  | "replay"
  | "highlights"
  | "unavailable";

export type SportsMatchCard = {
  id: string;
  slug?: string | null;
  sport: {
    id: string;
    slug: string;
    name: string;
    icon?: string | null;
  };
  competition: {
    id: string;
    slug?: string | null;
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
    countryCode?: string | null;
  } | null;
  participants: Array<{
    id: string;
    type: "team" | "athlete" | "other";
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
    side?: "home" | "away" | null;
    score?: string | number | null;
    winner?: boolean | null;
  }>;
  status: {
    code: SportsPublicEventStatus;
    label: string;
    live: boolean;
    finished: boolean;
  };
  timing: {
    startsAt: string | null;
    endsAt?: string | null;
    minute?: number | null;
    period?: string | null;
  };
  venue?: {
    name?: string | null;
    city?: string | null;
    countryCode?: string | null;
  } | null;
  artwork?: {
    thumbnailUrl?: string | null;
    posterUrl?: string | null;
  } | null;
  watchability: {
    state: SportsWatchabilityState;
    playable: boolean;
    playbackModeHint?: "embed" | "native" | "webview" | null;
  };
  badges?: string[];
  /** Safe, non-private reason — only when personalization is enabled. */
  recommendationReason?: {
    code: string;
    label: string;
  } | null;
};

export type SportsCompetitionCard = {
  id: string;
  slug?: string | null;
  name: string;
  shortName?: string | null;
  sportSlug?: string | null;
  countryCode?: string | null;
  logoUrl?: string | null;
  competitionType?: string | null;
};

export type SportsWorldCard = {
  id: string;
  slug: string;
  name: string;
  icon?: string | null;
  artworkUrl?: string | null;
  sortOrder?: number | null;
};

export type SportsCountryCard = {
  code: string;
  name: string;
  region?: string | null;
  artworkUrl?: string | null;
};

export type SportsChannelCard = {
  id: string;
  name: string;
  slug?: string | null;
  artworkUrl?: string | null;
  status: string;
};

export type SportsVideoCard = {
  id: string;
  title: string;
  videoType: string;
  status: string;
  artworkUrl?: string | null;
  fixtureId?: string | null;
  publishedAt?: string | null;
};

export type SportsHomeSectionBase = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  rank: number;
  items: unknown[];
  nextCursor?: string | null;
};

export type SportsLiveSection = SportsHomeSectionBase & {
  id: "live_now";
  type: "live";
  items: SportsMatchCard[];
};

export type SportsFixtureSection = SportsHomeSectionBase & {
  type: "fixtures";
  items: SportsMatchCard[];
};

export type SportsCompetitionSection = SportsHomeSectionBase & {
  id: "popular_competitions";
  type: "competitions";
  items: SportsCompetitionCard[];
};

export type SportsWorldSection = SportsHomeSectionBase & {
  id: "browse_sports";
  type: "sports";
  items: SportsWorldCard[];
};

export type SportsCountrySection = SportsHomeSectionBase & {
  id: "browse_countries";
  type: "countries";
  items: SportsCountryCard[];
};

export type SportsChannelSection = SportsHomeSectionBase & {
  type: "channels";
  items: SportsChannelCard[];
};

export type SportsVideoSection = SportsHomeSectionBase & {
  type: "videos";
  items: SportsVideoCard[];
};

export type SportsHomeSection =
  | SportsLiveSection
  | SportsFixtureSection
  | SportsCompetitionSection
  | SportsWorldSection
  | SportsCountrySection
  | SportsChannelSection
  | SportsVideoSection;

export type SportsHomeResponse = {
  generatedAt: string;
  sections: SportsHomeSection[];
};

export type SportsHomeSectionId =
  | "live_now"
  | "starting_soon"
  | "featured"
  | "because_you_follow"
  | "continue_watching"
  | "popular_competitions"
  | "browse_sports"
  | "browse_countries"
  | "todays_schedule"
  | "trending"
  | "recently_finished"
  | "highlights"
  | "replays";

export const SPORTS_HOME_SECTION_RANK: Record<SportsHomeSectionId, number> = {
  live_now: 10,
  starting_soon: 20,
  featured: 30,
  because_you_follow: 40,
  continue_watching: 50,
  popular_competitions: 60,
  browse_sports: 70,
  browse_countries: 80,
  todays_schedule: 90,
  trending: 100,
  recently_finished: 110,
  highlights: 120,
  replays: 130,
};

export const SPORTS_HOME_SECTION_TITLES: Record<SportsHomeSectionId, string> = {
  live_now: "Live Now",
  starting_soon: "Starting Soon",
  featured: "Featured",
  because_you_follow: "Because You Follow",
  continue_watching: "Continue Watching",
  popular_competitions: "Popular Competitions",
  browse_sports: "Browse Sports",
  browse_countries: "Browse Countries",
  todays_schedule: "Today's Schedule",
  trending: "Trending",
  recently_finished: "Recently Finished",
  highlights: "Highlights",
  replays: "Replays",
};
