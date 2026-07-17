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
  watchAction?: "none" | "native" | "embedded" | "external" | "reminder" | "unavailable";
  watchLabel?: string | null;
  regionMessage?: string | null;
};

export type SportsMatchCard = {
  id: string;
  sport?: { id: string; slug: string; name: string };
  competition?: { id: string; name: string; shortName?: string | null } | null;
  participants?: Array<{ id: string; name: string; side?: string | null }>;
  status?: {
    code: string;
    label: string;
    live: boolean;
    finished: boolean;
  };
  timing?: { startsAt: string | null; endsAt?: string | null };
  watchability?: {
    state: string;
    playable: boolean;
  };
  artwork?: { thumbnailUrl?: string | null } | null;
  recommendationReason?: { code: string; label: string } | null;
};

export type SportsHomeSection = {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  rank: number;
  items: unknown[];
  nextCursor?: string | null;
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

export type SportsPlaybackResult =
  | SportsNativePlayback
  | SportsEmbeddedPlayback
  | SportsExternalPlayback;

export type SportsHomeResponse = {
  success: boolean;
  enabled?: boolean;
  homeIaEnabled?: boolean;
  personalizationEnabled?: boolean;
  personalizationApplied?: boolean;
  generatedAt?: string;
  /** Phase 2B ordered sections. */
  sections?: SportsHomeSection[] | Partial<Record<string, SportsBrowseItem[]>>;
  sectionErrors?: Array<{ section: string; error: string }>;
  message?: string;
};
