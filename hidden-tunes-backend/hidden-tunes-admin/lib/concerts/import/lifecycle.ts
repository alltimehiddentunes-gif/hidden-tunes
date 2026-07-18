/**
 * Scheduled → live → replay lifecycle linking.
 * Prefer updating the same provider content ID; otherwise link replay to canonical.
 */

import type { ConcertSoftMatchResult } from "./dedupe";

export type ConcertLifecycleStatus =
  | "discovered"
  | "scheduled"
  | "upcoming_verified"
  | "live_candidate"
  | "live_validated"
  | "ended"
  | "replay_pending"
  | "replay_validated"
  | "offline"
  | "superseded";

export type ConcertLifecycleHint = "scheduled" | "live" | "replay" | "unknown";

const ALLOWED: Record<ConcertLifecycleStatus, ConcertLifecycleStatus[]> = {
  discovered: ["scheduled", "upcoming_verified", "live_candidate", "replay_pending", "offline"],
  scheduled: ["upcoming_verified", "live_candidate", "ended", "offline", "superseded"],
  upcoming_verified: ["live_candidate", "live_validated", "ended", "offline", "superseded"],
  live_candidate: ["live_validated", "ended", "offline", "superseded"],
  live_validated: ["ended", "replay_pending", "offline", "superseded"],
  ended: ["replay_pending", "replay_validated", "offline", "superseded"],
  replay_pending: ["replay_validated", "offline", "superseded"],
  replay_validated: ["offline", "superseded"],
  offline: ["replay_pending", "superseded"],
  superseded: [],
};

export function inferLifecycleHint(input: {
  liveBroadcastContent?: string | null;
  isLive?: boolean;
  isUpcoming?: boolean;
  isReplay?: boolean;
}): ConcertLifecycleHint {
  if (input.isLive || input.liveBroadcastContent === "live") return "live";
  if (input.isUpcoming || input.liveBroadcastContent === "upcoming") return "scheduled";
  if (input.isReplay || input.liveBroadcastContent === "none") return "replay";
  return "unknown";
}

export function lifecycleStatusFromHint(
  hint: ConcertLifecycleHint,
  validated = false
): ConcertLifecycleStatus {
  if (hint === "scheduled") return validated ? "upcoming_verified" : "scheduled";
  if (hint === "live") return validated ? "live_validated" : "live_candidate";
  if (hint === "replay") return validated ? "replay_validated" : "replay_pending";
  return "discovered";
}

export function canTransitionConcertLifecycle(
  from: ConcertLifecycleStatus,
  to: ConcertLifecycleStatus
): boolean {
  if (from === to) return true;
  return (ALLOWED[from] || []).includes(to);
}

export function nextConcertLifecycleStatus(
  current: ConcertLifecycleStatus,
  desired: ConcertLifecycleStatus
): ConcertLifecycleStatus {
  if (canTransitionConcertLifecycle(current, desired)) return desired;
  return current;
}

export type ConcertLifecycleLinkPlan = {
  action: "update_same_content" | "link_replay" | "create_alias" | "flag_probable" | "keep_separate";
  canonicalId?: string;
  aliasId?: string;
  relationType?: string;
  reasons: string[];
};

/**
 * Decide how a newly discovered item relates to an existing performance.
 */
export function planConcertLifecycleLink(input: {
  existingContentId: string | null;
  incomingContentId: string;
  existingLifecycle: ConcertLifecycleStatus;
  incomingHint: ConcertLifecycleHint;
  softMatch: ConcertSoftMatchResult;
  existingId: string;
  incomingId?: string;
}): ConcertLifecycleLinkPlan {
  const reasons = [...input.softMatch.reasons];

  if (
    input.existingContentId &&
    input.existingContentId === input.incomingContentId
  ) {
    return {
      action: "update_same_content",
      canonicalId: input.existingId,
      reasons: [...reasons, "same_provider_content_id"],
    };
  }

  if (
    input.softMatch.autoMerge &&
    input.softMatch.kind === "scheduled_to_replay"
  ) {
    return {
      action: "link_replay",
      canonicalId: input.existingId,
      aliasId: input.incomingId,
      relationType: "scheduled_to_replay",
      reasons: [...reasons, "scheduled_to_replay_auto_merge"],
    };
  }

  if (input.softMatch.autoMerge) {
    return {
      action: "create_alias",
      canonicalId: input.existingId,
      aliasId: input.incomingId,
      relationType: input.softMatch.kind,
      reasons,
    };
  }

  if (input.softMatch.kind === "probable_duplicate" || input.softMatch.score >= 0.75) {
    return {
      action: "flag_probable",
      canonicalId: input.existingId,
      aliasId: input.incomingId,
      relationType: "probable_duplicate",
      reasons,
    };
  }

  return { action: "keep_separate", reasons };
}
