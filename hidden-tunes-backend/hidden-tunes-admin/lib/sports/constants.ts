import type { SportsLifecycleStatus, SportsPlatform } from "./types";

export const SPORTS_PUBLIC_CATALOG_STATUSES: SportsLifecycleStatus[] = [
  "verified",
  "scheduled",
  "live",
  "external_only",
  "degraded",
];

export const SPORTS_PLAYABLE_STATUSES: SportsLifecycleStatus[] = [
  "verified",
  "scheduled",
  "live",
  "degraded",
];

export const SPORTS_DEFAULT_PAGE_LIMIT = 20;
export const SPORTS_MAX_PAGE_LIMIT = 50;
export const SPORTS_HOME_SECTION_LIMIT = 16;
export const SPORTS_LIVE_CACHE_TTL_MS = 20_000;
export const SPORTS_TAXONOMY_CACHE_TTL_MS = 5 * 60_000;
export const SPORTS_VIDEO_CACHE_TTL_MS = 2 * 60_000;

export const SPORTS_QUARANTINE_THRESHOLDS = {
  consecutiveTechnicalFailures: 5,
  minPlaySuccessRate: 70,
} as const;

export const SPORTS_VERIFICATION_CADENCE = {
  beforeEventMinutes: [30, 5],
  atStart: true,
  whileLiveSeconds: 45,
  afterEnd: true,
} as const;

export const SPORTS_SAFE_FALLBACK_COUNTRY = "ZZ";

export const SPORTS_FEATURE_FLAG_KEYS = [
  "sports_enabled",
  "sports_admin_enabled",
  "sports_native_playback_enabled",
  "sports_embedded_playback_enabled",
  "sports_external_watch_enabled",
  "sports_live_scores_enabled",
  "sports_notifications_enabled",
  "sports_provider_imports_enabled",
  "sports_home_ia_enabled",
  "sports_mobile_pilot_enabled",
  "sports_personalization_enabled",
  "sports_scorebat_enabled",
  "sports_scorebat_discovery_enabled",
  "sports_scorebat_playback_enabled",
] as const;

export type SportsFeatureFlagKey = (typeof SPORTS_FEATURE_FLAG_KEYS)[number];

/** Compile-time defaults — unfinished public Sports stays off. */
export const SPORTS_FEATURE_FLAG_DEFAULTS: Record<SportsFeatureFlagKey, boolean> =
  {
    sports_enabled: false,
    sports_admin_enabled: true,
    sports_native_playback_enabled: false,
    sports_embedded_playback_enabled: false,
    sports_external_watch_enabled: true,
    sports_live_scores_enabled: false,
    sports_notifications_enabled: false,
    sports_provider_imports_enabled: false,
    sports_home_ia_enabled: false,
    sports_mobile_pilot_enabled: false,
    sports_personalization_enabled: false,
    sports_scorebat_enabled: false,
    sports_scorebat_discovery_enabled: false,
    sports_scorebat_playback_enabled: false,
  };

export const SPORTS_PLATFORM_RIGHTS_FIELD: Record<
  SportsPlatform,
  | "mobile_allowed"
  | "desktop_allowed"
  | "web_allowed"
  | "smart_tv_allowed"
> = {
  ios: "mobile_allowed",
  android: "mobile_allowed",
  desktop: "desktop_allowed",
  web: "web_allowed",
  smart_tv: "smart_tv_allowed",
};

export const SPORTS_WORKER_KEYS = [
  "sports-fixture-sync",
  "sports-live-score-sync",
  "sports-broadcast-discovery",
  "sports-rights-evaluator",
  "sports-stream-precheck",
  "sports-live-stream-monitor",
  "sports-channel-health-check",
  "sports-video-import",
  "sports-artwork-sync",
  "sports-expiry-cleanup",
  "sports-notification-dispatch",
  "sports-provider-health-check",
  "sports-quarantine-recovery",
] as const;

export type SportsWorkerKey = (typeof SPORTS_WORKER_KEYS)[number];

export const REGION_UNAVAILABLE_MESSAGE =
  "No authorized free stream is available in your region.";
