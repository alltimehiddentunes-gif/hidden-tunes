import { SPORTS_QUARANTINE_THRESHOLDS } from "../constants";

export type StreamStatusTransition = {
  from: string;
  to: string;
  reason: string;
};

export const ALLOWED_STREAM_STATUS_TRANSITIONS: Record<string, string[]> = {
  discovered: ["rights_pending", "removed"],
  rights_pending: ["rights_approved", "rights_revoked", "removed"],
  rights_approved: ["technical_pending", "rights_revoked", "removed"],
  technical_pending: ["verified", "offline", "quarantined", "removed"],
  verified: [
    "scheduled",
    "live",
    "degraded",
    "external_only",
    "offline",
    "expired",
    "quarantined",
    "rights_revoked",
    "removed",
  ],
  scheduled: ["live", "verified", "expired", "offline", "quarantined", "removed"],
  live: ["degraded", "verified", "expired", "offline", "quarantined", "removed"],
  degraded: ["verified", "live", "offline", "quarantined", "removed"],
  external_only: ["verified", "expired", "quarantined", "rights_revoked", "removed"],
  geo_blocked: ["verified", "external_only", "removed"],
  expired: ["removed"],
  offline: ["technical_pending", "verified", "quarantined", "removed"],
  quarantined: ["technical_pending", "rights_revoked", "removed"],
  rights_revoked: ["removed"],
  removed: [],
};

export function canTransitionStreamStatus(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_STREAM_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function shouldQuarantine(input: {
  consecutiveFailures: number;
  playSuccessRate: number;
  rightsExpired: boolean;
  rightsRevoked: boolean;
  providerDisabled: boolean;
  manifestIdentityChanged: boolean;
  ownershipChanged: boolean;
  removalRequested: boolean;
  territoryConflict: boolean;
}): { quarantine: boolean; reason: string; autoRecoverable: boolean } {
  if (input.rightsRevoked) {
    return {
      quarantine: true,
      reason: "rights_revoked",
      autoRecoverable: false,
    };
  }
  if (input.removalRequested) {
    return {
      quarantine: true,
      reason: "removal_request",
      autoRecoverable: false,
    };
  }
  if (input.rightsExpired) {
    return {
      quarantine: true,
      reason: "rights_expired",
      autoRecoverable: false,
    };
  }
  if (input.providerDisabled) {
    return {
      quarantine: true,
      reason: "provider_disabled",
      autoRecoverable: true,
    };
  }
  if (input.manifestIdentityChanged) {
    return {
      quarantine: true,
      reason: "manifest_identity_changed",
      autoRecoverable: false,
    };
  }
  if (input.ownershipChanged) {
    return {
      quarantine: true,
      reason: "stream_ownership_changed",
      autoRecoverable: false,
    };
  }
  if (input.territoryConflict) {
    return {
      quarantine: true,
      reason: "territory_rights_conflict",
      autoRecoverable: false,
    };
  }
  if (
    input.consecutiveFailures >=
    SPORTS_QUARANTINE_THRESHOLDS.consecutiveTechnicalFailures
  ) {
    return {
      quarantine: true,
      reason: "consecutive_technical_failures",
      autoRecoverable: true,
    };
  }
  if (
    input.playSuccessRate < SPORTS_QUARANTINE_THRESHOLDS.minPlaySuccessRate
  ) {
    return {
      quarantine: true,
      reason: "play_success_rate_below_threshold",
      autoRecoverable: true,
    };
  }
  return { quarantine: false, reason: "", autoRecoverable: false };
}

export function canAutoRestoreQuarantine(input: {
  reason: string;
  successfulChecks: number;
  requiredSuccessfulChecks?: number;
}): boolean {
  const required = input.requiredSuccessfulChecks ?? 3;
  const technicalReasons = new Set([
    "consecutive_technical_failures",
    "play_success_rate_below_threshold",
    "provider_disabled",
  ]);
  if (!technicalReasons.has(input.reason)) return false;
  return input.successfulChecks >= required;
}
