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
  sections?: Partial<Record<string, SportsBrowseItem[]>>;
  sectionErrors?: Array<{ section: string; error: string }>;
};
