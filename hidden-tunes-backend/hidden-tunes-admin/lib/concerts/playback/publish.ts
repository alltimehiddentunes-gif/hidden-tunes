/**
 * Automatic catalogue publish / hide based on latest playback validation.
 * No endless manual approval for every item.
 */

export type ConcertPublishDecision = {
  isPublic: boolean;
  visibilityStatus:
    | "verified_upcoming"
    | "live"
    | "replay_available"
    | "failed"
    | "offline"
    | "unavailable"
    | "quarantined"
    | "validation_pending";
  playbackStatus: "playable" | "failed" | "unavailable" | "quarantined" | "validation_pending";
  rightsStatus: "authorized" | "pending_review" | "denied";
  publishedAt: string | null;
  reason: string;
};

export function decideConcertCatalogueVisibility(input: {
  playable: boolean;
  isLive?: boolean;
  isUpcoming?: boolean;
  isReplay?: boolean;
  fakeLive?: boolean;
  privateOrRemoved?: boolean;
  now?: Date;
}): ConcertPublishDecision {
  const nowIso = (input.now || new Date()).toISOString();

  if (input.privateOrRemoved) {
    return {
      isPublic: false,
      visibilityStatus: "unavailable",
      playbackStatus: "unavailable",
      rightsStatus: "pending_review",
      publishedAt: null,
      reason: "removed_or_private",
    };
  }

  if (input.fakeLive) {
    return {
      isPublic: false,
      visibilityStatus: "quarantined",
      playbackStatus: "quarantined",
      rightsStatus: "pending_review",
      publishedAt: null,
      reason: "fake_live",
    };
  }

  if (!input.playable) {
    return {
      isPublic: false,
      visibilityStatus: "failed",
      playbackStatus: "failed",
      rightsStatus: "pending_review",
      publishedAt: null,
      reason: "playback_failed",
    };
  }

  if (input.isLive) {
    return {
      isPublic: true,
      visibilityStatus: "live",
      playbackStatus: "playable",
      rightsStatus: "authorized",
      publishedAt: nowIso,
      reason: "playable_live",
    };
  }

  if (input.isUpcoming) {
    return {
      isPublic: true,
      visibilityStatus: "verified_upcoming",
      playbackStatus: "playable",
      rightsStatus: "authorized",
      publishedAt: nowIso,
      reason: "playable_upcoming",
    };
  }

  return {
    isPublic: true,
    visibilityStatus: "replay_available",
    playbackStatus: "playable",
    rightsStatus: "authorized",
    publishedAt: nowIso,
    reason: "playable_replay",
  };
}
