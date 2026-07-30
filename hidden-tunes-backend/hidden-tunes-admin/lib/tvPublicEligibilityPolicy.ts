/**
 * Canonical evidence-based TV public eligibility.
 *
 * Core rule: a previously verified playable channel remains publicly eligible
 * until there is positive evidence it is dead, restricted, unsupported, or
 * legally ineligible. Health-check age drives revalidation priority only —
 * never automatic visibility.
 *
 * All TV public catalogue routes must use applyTvPublicCatalogFilters /
 * isTvStationEligibleForPlatform from tvPlatformPolicy (which delegates here).
 */

/**
 * Keep in sync with TV_RELIABILITY_THRESHOLD in tvStationHealth.
 * Inlined here to avoid a circular import:
 * eligibility → health → platformPolicy → eligibility.
 */
const TV_PUBLIC_RELIABILITY_FLOOR = 60;

/** Interval used only to mark needs_revalidation / queue priority — NOT visibility. */
export const TV_REVALIDATION_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Soft-failure escalation (health worker guidance; not a visibility timestamp gate).
 * Independent failures must be separated across runs and calendar time.
 */
export const TV_SOFT_FAILURE_HIDE_THRESHOLD = 4;
export const TV_SOFT_FAILURE_MIN_SPAN_MS = 24 * 60 * 60 * 1000;
export const TV_SOFT_FAILURE_MIN_HEALTH_RUNS = 2;

/** Hard / permanent playback statuses that must not be public. */
export const TV_HARD_FAILURE_PLAYBACK_STATUSES = new Set([
  "failed",
  "blocked",
  "deleted",
  "private",
  "embed_blocked",
  "dead",
  "offline",
  "unplayable",
  "disabled",
]);

export type TvAvailabilityState =
  | "verified"
  | "due_for_recheck"
  | "degraded"
  | "temporarily_unavailable"
  | "confirmed_dead"
  | "legally_blocked"
  | "never_verified";

export type TvEvidenceEligibilityRow = {
  status?: string | null;
  is_active?: boolean | null;
  playback_status?: string | null;
  reliability_score?: number | null;
  consecutive_failures?: number | null;
  disabled_at?: string | null;
  quarantined_at?: string | null;
  ios_playable?: boolean | null;
  android_playable?: boolean | null;
  stream_is_https?: boolean | null;
  last_health_checked_at?: string | null;
  last_health_error?: string | null;
  last_validation_result?: string | null;
  is_mature?: boolean | null;
  mature_source_approved?: boolean | null;
};

export function hasSuccessfulVerification(row: TvEvidenceEligibilityRow): boolean {
  return (
    String(row.playback_status || "").toLowerCase() === "playable" &&
    Boolean(row.last_health_checked_at)
  );
}

export function isHardFailurePlaybackStatus(playbackStatus: string | null | undefined): boolean {
  const status = String(playbackStatus || "").trim().toLowerCase();
  return Boolean(status) && TV_HARD_FAILURE_PLAYBACK_STATUSES.has(status);
}

/**
 * Age of last successful check → revalidation queue only.
 * Must never be used as `publicly_eligible = false`.
 */
export function needsTvRevalidation(
  lastHealthCheckedAt: string | null | undefined,
  now = new Date(),
  intervalMs = TV_REVALIDATION_INTERVAL_MS
): boolean {
  if (!lastHealthCheckedAt) return true;
  const checkedAt = new Date(lastHealthCheckedAt).getTime();
  if (!Number.isFinite(checkedAt)) return true;
  return now.getTime() - checkedAt > intervalMs;
}

/**
 * Soft-failure / degraded signal from existing columns.
 * Does not hide by itself while playback_status remains playable.
 */
export function hasSoftFailureEvidence(row: TvEvidenceEligibilityRow): boolean {
  const failures = Math.max(0, Number(row.consecutive_failures ?? 0));
  if (failures > 0 && String(row.playback_status || "").toLowerCase() === "playable") {
    return true;
  }
  return Boolean(row.last_health_error) && String(row.playback_status || "").toLowerCase() === "playable";
}

/**
 * Derive a logical availability state from existing fields (no new columns).
 */
export function deriveTvAvailabilityState(
  row: TvEvidenceEligibilityRow,
  now = new Date()
): TvAvailabilityState {
  if (row.quarantined_at || row.disabled_at) {
    if (isHardFailurePlaybackStatus(row.playback_status)) return "confirmed_dead";
    return "legally_blocked";
  }

  if (!row.last_health_checked_at) {
    return "never_verified";
  }

  const playback = String(row.playback_status || "").toLowerCase();
  if (isHardFailurePlaybackStatus(playback) || playback === "failed") {
    return "confirmed_dead";
  }

  if (playback !== "playable") {
    return "temporarily_unavailable";
  }

  if (row.is_active === false || row.status !== "approved") {
    return "temporarily_unavailable";
  }

  if (hasSoftFailureEvidence(row)) {
    return "degraded";
  }

  if (needsTvRevalidation(row.last_health_checked_at, now)) {
    return "due_for_recheck";
  }

  return "verified";
}

export function isTvAvailabilityStatePubliclyVisible(state: TvAvailabilityState): boolean {
  return state === "verified" || state === "due_for_recheck" || state === "degraded";
}

/**
 * Evidence-based public eligibility (row-level). No freshness cutoff.
 */
export function isTvPubliclyEligibleByEvidence(row: TvEvidenceEligibilityRow): boolean {
  if (row.status !== "approved") return false;
  if (row.is_active !== true) return false;
  if (row.disabled_at) return false;
  if (row.quarantined_at) return false;
  if (!hasSuccessfulVerification(row)) return false;
  if (Number(row.reliability_score ?? 0) < TV_PUBLIC_RELIABILITY_FLOOR) return false;
  if (isHardFailurePlaybackStatus(row.playback_status)) return false;

  const state = deriveTvAvailabilityState(row);
  return isTvAvailabilityStatePubliclyVisible(state);
}

/**
 * Catastrophic catalogue-reduction guard (deploy-time check).
 * Legal/confirmed-dead actions may be exempt when separately reported.
 */
export function assertCatalogueContinuityGuard(input: {
  previousVisible: number;
  projectedVisible: number;
  maxTotalReductionPct?: number;
}): { ok: boolean; reductionPct: number; newlyHidden: number; newlyRestored: number } {
  const maxPct = input.maxTotalReductionPct ?? 5;
  const newlyHidden = Math.max(0, input.previousVisible - input.projectedVisible);
  const newlyRestored = Math.max(0, input.projectedVisible - input.previousVisible);
  const reductionPct =
    input.previousVisible > 0
      ? Number(((newlyHidden / input.previousVisible) * 100).toFixed(2))
      : 0;
  return {
    ok: reductionPct <= maxPct,
    reductionPct,
    newlyHidden,
    newlyRestored,
  };
}
