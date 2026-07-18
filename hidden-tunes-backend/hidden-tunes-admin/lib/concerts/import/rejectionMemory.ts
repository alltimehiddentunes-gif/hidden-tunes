/**
 * Rejection memory — avoid reprocessing unchanged rejected items.
 */

export type ConcertRejectionReasonCode =
  | "not_concert"
  | "studio_music_video"
  | "interview"
  | "trailer"
  | "promo"
  | "short_insufficient"
  | "private"
  | "members_only"
  | "paid_only"
  | "embed_disabled"
  | "region_unresolved"
  | "rights_unclear"
  | "dead"
  | "fake_live"
  | "duplicate_exact"
  | "duplicate_probable"
  | "metadata_insufficient"
  | "provider_error";

export type ConcertRejectionRecord = {
  provider: string;
  providerContentId: string;
  reasonCode: ConcertRejectionReasonCode;
  metadataHash?: string | null;
  embedStatus?: string | null;
  visibilityStatus?: string | null;
  scheduledStartAt?: string | null;
  cooldownUntil?: string | null;
  manualRetryRequested?: boolean;
  lastSeenAt?: string | null;
};

export const DEFAULT_REJECTION_COOLDOWN_HOURS: Record<
  ConcertRejectionReasonCode,
  number | null
> = {
  not_concert: 24 * 30,
  studio_music_video: 24 * 30,
  interview: 24 * 14,
  trailer: 24 * 7,
  promo: 24 * 7,
  short_insufficient: 24 * 14,
  private: 24 * 3,
  members_only: 24 * 30,
  paid_only: 24 * 30,
  embed_disabled: 24 * 7,
  region_unresolved: 24 * 3,
  rights_unclear: 24 * 14,
  dead: 24 * 7,
  fake_live: 24 * 3,
  duplicate_exact: 24 * 30,
  duplicate_probable: 24 * 7,
  metadata_insufficient: 24 * 3,
  provider_error: 6,
};

/** Scheduled streams must not be permanently rejected before start. */
export function shouldSkipRejectedConcert(input: {
  rejection: ConcertRejectionRecord;
  currentMetadataHash?: string | null;
  currentEmbedStatus?: string | null;
  currentVisibilityStatus?: string | null;
  now?: Date;
}): { skip: boolean; reason: string } {
  const now = input.now || new Date();
  const rejection = input.rejection;

  if (rejection.manualRetryRequested) {
    return { skip: false, reason: "manual_retry_requested" };
  }

  // Do not permanently skip not-yet-started scheduled items.
  if (rejection.scheduledStartAt) {
    const start = new Date(rejection.scheduledStartAt);
    if (!Number.isNaN(start.getTime()) && start.getTime() > now.getTime()) {
      return { skip: false, reason: "scheduled_start_not_reached" };
    }
    if (!Number.isNaN(start.getTime()) && start.getTime() <= now.getTime()) {
      return { skip: false, reason: "scheduled_start_passed" };
    }
  }

  if (
    rejection.metadataHash &&
    input.currentMetadataHash &&
    rejection.metadataHash !== input.currentMetadataHash
  ) {
    return { skip: false, reason: "metadata_changed" };
  }

  if (
    rejection.embedStatus &&
    input.currentEmbedStatus &&
    rejection.embedStatus !== input.currentEmbedStatus
  ) {
    return { skip: false, reason: "embed_status_changed" };
  }

  if (
    rejection.visibilityStatus &&
    input.currentVisibilityStatus &&
    rejection.visibilityStatus !== input.currentVisibilityStatus
  ) {
    return { skip: false, reason: "visibility_changed" };
  }

  if (rejection.cooldownUntil) {
    const until = new Date(rejection.cooldownUntil);
    if (!Number.isNaN(until.getTime()) && until.getTime() > now.getTime()) {
      return { skip: true, reason: "cooldown_active" };
    }
    return { skip: false, reason: "cooldown_expired" };
  }

  const hours = DEFAULT_REJECTION_COOLDOWN_HOURS[rejection.reasonCode];
  if (hours == null) return { skip: false, reason: "no_cooldown" };

  const lastSeen = rejection.lastSeenAt ? new Date(rejection.lastSeenAt) : null;
  if (!lastSeen || Number.isNaN(lastSeen.getTime())) {
    return { skip: true, reason: "default_cooldown_without_timestamp" };
  }

  const elapsedHours = (now.getTime() - lastSeen.getTime()) / 3_600_000;
  if (elapsedHours < hours) {
    return { skip: true, reason: "default_cooldown_active" };
  }

  return { skip: false, reason: "default_cooldown_expired" };
}

export function computeRejectionCooldownUntil(
  reasonCode: ConcertRejectionReasonCode,
  now = new Date()
): string | null {
  const hours = DEFAULT_REJECTION_COOLDOWN_HOURS[reasonCode];
  if (hours == null) return null;
  return new Date(now.getTime() + hours * 3_600_000).toISOString();
}

export function mapClassificationToRejectionCode(
  decision: string,
  title = "",
  description = ""
): ConcertRejectionReasonCode {
  const blob = `${title}\n${description}`;
  if (/official music video|music video|lyric video/i.test(blob)) {
    return "studio_music_video";
  }
  if (/\binterview\b/i.test(blob)) return "interview";
  if (/\btrailer\b|\bteaser\b/i.test(blob)) return "trailer";
  if (/\bpromo\b|\badvertisement\b/i.test(blob)) return "promo";
  if (decision === "reject_embed_disabled") return "embed_disabled";
  if (decision === "reject_paid_or_members") {
    if (/members?/i.test(blob)) return "members_only";
    return "paid_only";
  }
  if (decision === "reject_unavailable") return "dead";
  if (/short_insufficient/i.test(decision)) return "short_insufficient";
  return "not_concert";
}
