export const CONTENT_ENGINE_TYPES = [
  "podcast",
  "radio",
  "tv",
  "audiobook",
] as const;

export const CONTENT_LIFECYCLE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "blocked",
] as const;

export const CONTENT_HEALTH_STATUSES = [
  "unchecked",
  "active",
  "degraded",
  "failed",
  "dead",
] as const;

export const CONTENT_PLAYBACK_STATUSES = [
  "unchecked",
  "playable",
  "failed",
  "blocked",
] as const;

export type ContentEngineType = (typeof CONTENT_ENGINE_TYPES)[number];
export type ContentLifecycleStatus = (typeof CONTENT_LIFECYCLE_STATUSES)[number];
export type ContentHealthStatus = (typeof CONTENT_HEALTH_STATUSES)[number];
export type ContentPlaybackStatus = (typeof CONTENT_PLAYBACK_STATUSES)[number];

export type ContentHealthCheckResult = {
  statusCode: number | null;
  contentType: string | null;
  responseTimeMs: number | null;
  checkedAt: string;
  error: string | null;
  healthStatus: ContentHealthStatus;
};

export type ContentMetadataFields = {
  title?: unknown;
  description?: unknown;
  author?: unknown;
  publisher?: unknown;
  artworkUrl?: unknown;
  language?: unknown;
  primaryCategory?: unknown;
  categories?: unknown;
};

export type ContentPlayableItem = {
  title?: unknown;
  mediaUrl?: unknown;
};

export type ContentCursorPayload = {
  v: 1;
  scope: string;
  sortValue: string;
  id: string;
};

export type ContentCursorPage<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};

export function isContentEngineType(value: unknown): value is ContentEngineType {
  return (
    value === "podcast" ||
    value === "radio" ||
    value === "tv" ||
    value === "audiobook"
  );
}

export function isContentLifecycleStatus(
  value: unknown
): value is ContentLifecycleStatus {
  return (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "blocked"
  );
}

export function isContentHealthStatus(
  value: unknown
): value is ContentHealthStatus {
  return (
    value === "unchecked" ||
    value === "active" ||
    value === "degraded" ||
    value === "failed" ||
    value === "dead"
  );
}

export function isContentPlaybackStatus(
  value: unknown
): value is ContentPlaybackStatus {
  return (
    value === "unchecked" ||
    value === "playable" ||
    value === "failed" ||
    value === "blocked"
  );
}

export function isPubliclyVisibleContent(input: {
  lifecycleStatus: ContentLifecycleStatus;
  isActive: boolean;
  healthStatus: ContentHealthStatus;
  playbackStatus?: ContentPlaybackStatus;
}) {
  const healthOk =
    input.healthStatus === "active" || input.healthStatus === "degraded";

  if (
    input.lifecycleStatus !== "approved" ||
    !input.isActive ||
    !healthOk
  ) {
    return false;
  }

  if (input.playbackStatus !== undefined) {
    return input.playbackStatus === "playable";
  }

  return true;
}
