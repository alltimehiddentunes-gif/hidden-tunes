/**
 * Sports domain types — Phase 1 foundation.
 * Isolated from TV/music playback domains.
 */

export const SPORTS_LIFECYCLE_STATUSES = [
  "discovered",
  "rights_pending",
  "rights_approved",
  "technical_pending",
  "verified",
  "scheduled",
  "live",
  "degraded",
  "external_only",
  "geo_blocked",
  "expired",
  "offline",
  "quarantined",
  "rights_revoked",
  "removed",
] as const;

export type SportsLifecycleStatus = (typeof SPORTS_LIFECYCLE_STATUSES)[number];

export const SPORTS_BROADCAST_TYPES = [
  "live_match",
  "live_event",
  "pre_match",
  "post_match",
  "live_channel",
  "radio_commentary",
  "replay",
  "highlights",
  "press_conference",
  "interview",
  "documentary",
  "external_watch",
] as const;

export type SportsBroadcastType = (typeof SPORTS_BROADCAST_TYPES)[number];

export const SPORTS_PLATFORMS = [
  "ios",
  "android",
  "desktop",
  "web",
  "smart_tv",
] as const;

export type SportsPlatform = (typeof SPORTS_PLATFORMS)[number];

export const SPORTS_PLAYBACK_MODES = ["native", "embedded", "external"] as const;
export type SportsPlaybackMode = (typeof SPORTS_PLAYBACK_MODES)[number];

export const SPORTS_ACCESS_TYPES = [
  "free",
  "registration",
  "subscription",
  "external",
] as const;
export type SportsAccessType = (typeof SPORTS_ACCESS_TYPES)[number];

export const SPORTS_TERRITORY_AVAILABILITY = [
  "available",
  "unavailable",
  "geo_blocked",
  "external_only",
  "subscription_only",
  "registration_required",
  "metadata_only",
] as const;
export type SportsTerritoryAvailability =
  (typeof SPORTS_TERRITORY_AVAILABILITY)[number];

export const SPORTS_RESOLVER_ERROR_CODES = [
  "NOT_STARTED",
  "EVENT_ENDED",
  "GEO_BLOCKED",
  "RIGHTS_EXPIRED",
  "PLATFORM_NOT_ALLOWED",
  "EXTERNAL_ONLY",
  "SUBSCRIPTION_REQUIRED",
  "REGISTRATION_REQUIRED",
  "STREAM_OFFLINE",
  "STREAM_QUARANTINED",
  "PROVIDER_UNAVAILABLE",
  "NO_AUTHORIZED_SOURCE",
  "FEATURE_DISABLED",
  "NOT_PUBLISHED",
  "RIGHTS_REVOKED",
  "INVALID_REQUEST",
] as const;
export type SportsResolverErrorCode =
  (typeof SPORTS_RESOLVER_ERROR_CODES)[number];

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
  accessType?: SportsAccessType | string | null;
  watchAction?: "none" | "native" | "embedded" | "external" | "reminder" | "unavailable";
  watchLabel?: string | null;
  regionMessage?: string | null;
};

export type SportsHomeSections = {
  liveNow: SportsBrowseItem[];
  startingSoon: SportsBrowseItem[];
  freeToWatch: SportsBrowseItem[];
  football: SportsBrowseItem[];
  basketball: SportsBrowseItem[];
  otherLiveSports: SportsBrowseItem[];
  sportsChannels: SportsBrowseItem[];
  highlights: SportsBrowseItem[];
  replays: SportsBrowseItem[];
  recommended: SportsBrowseItem[];
  continueWatching: SportsBrowseItem[];
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

export type SportsPlayRequest = {
  platform: SportsPlatform;
  country: string;
  deviceId?: string;
  appVersion?: string;
};

export type SportsRightsGrant = {
  id: string;
  evidence_status: string;
  valid_from: string;
  valid_until: string | null;
  commercial_use_allowed: boolean;
  aggregation_allowed: boolean;
  embedding_allowed: boolean;
  native_playback_allowed: boolean;
  external_linking_allowed: boolean;
  mobile_allowed: boolean;
  desktop_allowed: boolean;
  web_allowed: boolean;
  smart_tv_allowed: boolean;
};

export type SportsTerritoryRule = {
  country_code: string;
  availability: SportsTerritoryAvailability | string;
  access_type: string;
};

export type SportsStreamSource = {
  id: string;
  broadcast_id: string | null;
  channel_id: string | null;
  provider_id: string | null;
  source_type: string;
  source_url_encrypted: string | null;
  resolver_reference: string | null;
  external_deep_link: string | null;
  web_fallback_url: string | null;
  expires_at: string | null;
  is_direct_play_allowed: boolean;
  is_embed_allowed: boolean;
  is_external_only: boolean;
  priority: number;
  status: string;
};

export type SportsBroadcastRow = {
  id: string;
  fixture_id: string | null;
  channel_id: string | null;
  provider_id: string | null;
  broadcast_type: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  availability_status: string;
  access_type: string;
  registration_required: boolean;
  subscription_required: boolean;
  rights_grant_id: string | null;
  territory_mode: string;
  official_status: string;
  verification_status: string;
  last_verified_at: string | null;
  published_at: string | null;
  unpublished_at: string | null;
  quarantined_at: string | null;
  metadata: Record<string, unknown>;
};

export type SportsPagination = {
  page: number;
  limit: number;
  hasMore: boolean;
};
