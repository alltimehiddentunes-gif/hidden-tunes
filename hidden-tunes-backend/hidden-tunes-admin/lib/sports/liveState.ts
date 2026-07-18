/**
 * Canonical Sports live-window calculation.
 * All browse and playability paths must use this — never trust a stale provider
 * `status=live` after the event window has ended.
 */

export type SportsLiveStateInput = {
  fixtureStatus?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sportSlug?: string | null;
  now?: Date;
  /** Extra minutes after endsAt (or after estimated end) still treated as live. */
  allowedOverrunMinutes?: number;
};

export type SportsEffectiveLiveState = {
  /** Event is genuinely inside the live time window. */
  effectiveLive: boolean;
  /** Event is finished (past window or explicit finished status). */
  isFinished: boolean;
  /** Event is cancelled / postponed. */
  isCancelled: boolean;
  /** Event has not started yet. */
  isUpcoming: boolean;
  /** Resolved end instant used for the window (endsAt or estimated). */
  effectiveEndsAt: Date | null;
  reason:
    | "live_window"
    | "finished_status"
    | "past_end"
    | "cancelled"
    | "upcoming"
    | "no_start"
    | "stale_provider_live";
};

/** Conservative fallback durations (minutes) when endsAt is missing. */
export const SPORTS_DEFAULT_DURATION_MINUTES: Record<string, number> = {
  football: 120,
  soccer: 120,
  basketball: 150,
  "australian-football": 150,
  rugby: 120,
  cricket: 480,
  tennis: 180,
  surfing: 240,
  athletics: 180,
  motorsport: 240,
  combat: 180,
  swimming: 180,
  cycling: 300,
  winter: 180,
  esports: 180,
  default: 150,
};

const FINISHED_STATUSES = new Set([
  "completed",
  "expired",
  "removed",
  "offline",
]);

const CANCELLED_STATUSES = new Set(["cancelled", "postponed"]);

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function resolveSportsFallbackDurationMinutes(
  sportSlug?: string | null
): number {
  const key = String(sportSlug || "")
    .trim()
    .toLowerCase();
  if (key && SPORTS_DEFAULT_DURATION_MINUTES[key]) {
    return SPORTS_DEFAULT_DURATION_MINUTES[key];
  }
  return SPORTS_DEFAULT_DURATION_MINUTES.default;
}

/**
 * Single authoritative live-window function for Sports.
 *
 * effectiveLive =
 *   startsAt <= now &&
 *   now <= endsAt + overrun &&
 *   !finishedStatus &&
 *   !cancelled
 *
 * A stale provider `live` status past the window is never effectiveLive.
 */
export function computeSportsEffectiveLiveState(
  input: SportsLiveStateInput
): SportsEffectiveLiveState {
  const now = input.now ?? new Date();
  const status = String(input.fixtureStatus || "")
    .trim()
    .toLowerCase();
  const starts = parseDate(input.startsAt);
  const ends = parseDate(input.endsAt);
  const overrunMs =
    Math.max(0, input.allowedOverrunMinutes ?? 15) * 60_000;

  if (CANCELLED_STATUSES.has(status)) {
    return {
      effectiveLive: false,
      isFinished: false,
      isCancelled: true,
      isUpcoming: false,
      effectiveEndsAt: ends,
      reason: "cancelled",
    };
  }

  if (FINISHED_STATUSES.has(status)) {
    return {
      effectiveLive: false,
      isFinished: true,
      isCancelled: false,
      isUpcoming: false,
      effectiveEndsAt: ends,
      reason: "finished_status",
    };
  }

  if (!starts) {
    return {
      effectiveLive: false,
      isFinished: false,
      isCancelled: false,
      isUpcoming: false,
      effectiveEndsAt: ends,
      reason: "no_start",
    };
  }

  const estimatedEnd =
    ends ||
    new Date(
      starts.getTime() +
        resolveSportsFallbackDurationMinutes(input.sportSlug) * 60_000
    );
  const liveUntil = new Date(estimatedEnd.getTime() + overrunMs);

  if (now.getTime() > liveUntil.getTime()) {
    return {
      effectiveLive: false,
      isFinished: true,
      isCancelled: false,
      isUpcoming: false,
      effectiveEndsAt: estimatedEnd,
      reason: status === "live" ? "stale_provider_live" : "past_end",
    };
  }

  if (now.getTime() < starts.getTime()) {
    return {
      effectiveLive: false,
      isFinished: false,
      isCancelled: false,
      isUpcoming: true,
      effectiveEndsAt: estimatedEnd,
      reason: "upcoming",
    };
  }

  return {
    effectiveLive: true,
    isFinished: false,
    isCancelled: false,
    isUpcoming: false,
    effectiveEndsAt: estimatedEnd,
    reason: "live_window",
  };
}

/** Fixture status that should be persisted when the live window has ended. */
export function finishedFixtureStatusForPersist(
  input: SportsLiveStateInput
): "completed" | null {
  const state = computeSportsEffectiveLiveState(input);
  if (!state.isFinished) return null;
  const status = String(input.fixtureStatus || "")
    .trim()
    .toLowerCase();
  if (FINISHED_STATUSES.has(status) || CANCELLED_STATUSES.has(status)) {
    return null;
  }
  return "completed";
}
