/**
 * Olympics official YouTube pilot — types.
 * Classification: OFFICIAL_EMBED_ALLOWED (never extract HLS).
 */

export const OLYMPICS_PROVIDER_SLUG = "olympics" as const;

/** Official Olympics YouTube channel handle. Resolved via Data API when key present. */
export const OLYMPICS_YOUTUBE_HANDLE = "Olympics";

/**
 * Well-known channel ID for @Olympics (IOC).
 * Verified against YouTube public channel pages; client also resolves via forHandle.
 */
export const OLYMPICS_YOUTUBE_CHANNEL_ID = "UCTlEHD8kJ0FqkJ7s2gH0qJw";

export const OLYMPICS_ALLOWED_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "i.ytimg.com",
  "i9.ytimg.com",
  "www.googleapis.com",
] as const;

export type OlympicsRightsClassification =
  | "verified_allowed"
  | "official_embed_only"
  | "metadata_only"
  | "partnership_required"
  | "unknown"
  | "blocked"
  | "expired";

export type OlympicsPlaybackMode =
  | "official_embed"
  | "external_only";

export type OlympicsVideoRecord = {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  durationIso: string | null;
  embeddable: boolean;
  privacyStatus: string;
  liveBroadcastContent: "none" | "upcoming" | "live" | string;
  tags: string[];
};

export type OlympicsDiscoverResult =
  | { supported: true; items: OlympicsVideoRecord[] }
  | { supported: false; reason: string };

export type OlympicsUnsupported = {
  supported: false;
  reason: string;
};
