/** Sports public event statuses â€” aligned with backend home IA contract. */
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
export type SportsPlaybackMode = "native" | "embedded" | "external";
export type SportsBrowseItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  sportSlug?: string | null;
  competitionName?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  status: string;
  artworkUrl?: string | null;
  accessType?: string | null;
  watchAction?:
    | "none"
    | "native"
    | "embedded"
    | "external"
    | "reminder"
    | "unavailable";
  watchLabel?: string | null;
  regionMessage?: string | null;
};
export type SportsMatchParticipant = {
  id: string;
  type?: "team" | "athlete" | "other";
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  side?: "home" | "away" | string | null;
  score?: string | number | null;
  winner?: boolean | null;
};
export type SportsMatchCard = {
  id: string;
  slug?: string | null;
  /** Official broadcast/event title when participants are unknown. */
  title?: string | null;
  sport?: {
    id: string;
    slug: string;
    name: string;
    icon?: string | null;
  };
  competition?: {
    id: string;
    slug?: string | null;
    name: string;
    shortName?: string | null;
    logoUrl?: string | null;
    countryCode?: string | null;
  } | null;
  participants?: SportsMatchParticipant[];
  status?: {
    code: string;
    label: string;
    live: boolean;
    finished: boolean;
  };
  timing?: {
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
  watchability?: {
    state: string;
    playable: boolean;
    playbackModeHint?: "embed" | "native" | "webview" | null;
    /** access: in_app | external | subscription */
    access?: "in_app" | "external" | "subscription" | null;
  };
  /** Explicit availability — preferred over inferred watchability. */
  availabilityState?:
    | "live_in_app"
    | "live_external"
    | "live_subscription"
    | "live_unavailable"
    | "upcoming"
    | "finished"
    | "replay_available"
    | "highlights_available";
  badges?: string[];
  recommendationReason?: { code: string; label: string } | null;
  /** Resume metadata for continue-watching shelves. */
  resume?: {
    label?: string | null;
    progressRatio?: number | null;
    lastWatchedAt?: string | null;
    stillLive?: boolean;
  } | null;
  /** Development-only editorial marker — never from production API. */
  featured?: boolean;
  fixtureOnly?: boolean;
};
export type SportsCompetitionCard = {
  id: string;
  slug?: string | null;
  name: string;
  shortName?: string | null;
  sportSlug?: string | null;
  sportName?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  logoUrl?: string | null;
  competitionType?: string | null;
  liveCount?: number | null;
  upcomingCount?: number | null;
  followed?: boolean;
};
export type SportsWorldCard = {
  id: string;
  slug: string;
  name: string;
  icon?: string | null;
  artworkUrl?: string | null;
  sortOrder?: number | null;
  liveCount?: number | null;
  upcomingCount?: number | null;
  followed?: boolean;
};
export type SportsCountryCard = {
  code: string;
  name: string;
  region?: string | null;
  artworkUrl?: string | null;
  competitionCount?: number | null;
  liveCount?: number | null;
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
  thumbnailUrl?: string | null;
  fixtureId?: string | null;
  competitionName?: string | null;
  durationSeconds?: number | null;
  publishedAt?: string | null;
};
export type SportsHomeSection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  rank: number;
  items: unknown[];
  nextCursor?: string | null;
  error?: string | null;
};
export type SportsNativePlayback = {
  mode: "native";
  manifestUrl: string;
  expiresAt: string;
  headers: Record<string, string>;
  drm: null | Record<string, unknown>;
  heartbeatInterval: number;
};
export type SportsEmbeddedPlayback = {
  mode: "embedded";
  provider: string;
  embedUrl: string;
  expiresAt: string;
};
export type SportsExternalPlayback = {
  mode: "external";
  provider: string;
  deepLink: string | null;
  fallbackUrl: string;
  accessType: "free" | "registration" | "subscription";
};

/** Legacy mode-based playback (SportsPlaybackContext). */
export type SportsPlaybackResult =
  | SportsNativePlayback
  | SportsEmbeddedPlayback
  | SportsExternalPlayback;

/** Provider-neutral tap-to-watch session DTO. */
export type SportsPlaybackSession =
  | {
      status: "ready";
      fixtureId: string;
      playbackKind: "embed" | "webview" | "hls" | "dash";
      playbackToken: string;
      expiresAt: string;
      title: string;
      providerLabel?: string;
      /** Short-lived embed URL — never from browse APIs. */
      embedUrl?: string | null;
      /** Controlled HTML only for __DEV__ fixtures — never production. */
      fixtureHtml?: string | null;
      manifestUrl?: string | null;
    }
  | {
      status: "external";
      fixtureId: string;
      officialUrl: string;
      providerLabel: string;
    }
  | {
      status: "subscription_required";
      fixtureId: string;
      providerLabel: string;
      officialUrl?: string;
    }
  | {
      status: "unavailable";
      fixtureId: string;
      reason:
        | "expired"
        | "geo_blocked"
        | "provider_disabled"
        | "not_started"
        | "finished"
        | "validation_failed"
        | "no_broadcast";
      message?: string;
    };
export type SportsHomeResponse = {
  success: boolean;
  enabled?: boolean;
  homeIaEnabled?: boolean;
  personalizationEnabled?: boolean;
  personalizationApplied?: boolean;
  generatedAt?: string;
  sections?: SportsHomeSection[] | Partial<Record<string, SportsBrowseItem[]>>;
  sectionErrors?: { section: string; error: string }[];
  message?: string;
  fixtureMode?: boolean;
};
export type SportsSearchGroup = {
  type: string;
  title: string;
  items: unknown[];
};
export type SportsSearchResponse = {
  success: boolean;
  enabled?: boolean;
  query?: string;
  groups?: SportsSearchGroup[];
  pagination?: { page: number; limit: number; hasMore: boolean };
  message?: string;
};
export type SportsFixtureDetail = SportsMatchCard & {
  relatedFixtures?: SportsMatchCard[];
  highlights?: SportsVideoCard[];
  replays?: SportsVideoCard[];
  timeline?: {
    id: string;
    minute?: number | null;
    label: string;
    detail?: string | null;
  }[];
  broadcasts?: {
    id: string;
    title: string;
    broadcastType?: string | null;
    status?: string | null;
  }[];
};
export type SportsFollowEntityType =
  | "sport"
  | "competition"
  | "team"
  | "athlete";
export type SportsFollowEntity = {
  id: string;
  type: SportsFollowEntityType;
  name: string;
  subtitle?: string | null;
  artworkUrl?: string | null;
  sportSlug?: string | null;
};
export type SportsReminder = {
  fixtureId: string;
  title: string;
  startsAt: string | null;
  createdAt: string;
};
export type SportsFavorite = {
  id: string;
  kind: "fixture" | "video" | "competition";
  title: string;
  savedAt: string;
};
export const SPORTS_HOME_SECTION_RANK: Record<string, number> = {
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
export const SPORTS_HOME_SECTION_TITLES: Record<string, string> = {
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
export const SPORTS_VISIBLE_SPORTS = [
  "football",
  "basketball",
  "tennis",
  "cricket",
  "rugby",
  "baseball",
  "ice-hockey",
  "volleyball",
  "handball",
  "badminton",
  "table-tennis",
  "golf",
  "motorsport",
  "cycling",
  "athletics",
  "swimming",
  "boxing",
  "mma",
  "wrestling",
  "esports",
  "olympics",
  "winter-sports",
] as const;
