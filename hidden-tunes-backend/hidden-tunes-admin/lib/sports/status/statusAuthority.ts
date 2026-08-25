/**
 * Provider-truth fixture status authority.
 *
 * Priority:
 * 1. Trusted provider event status
 * 2. Official league/federation status (metadata)
 * 3. Explicit verified manual override (metadata)
 * 4. Scheduled when no trustworthy live signal exists
 * 5. Completed only when provider/official confirms (or stale-live finalization)
 * 6. Unknown when evidence conflicts
 *
 * Time may identify candidates for refresh / stale-live cleanup.
 * Time alone must NEVER declare a fixture live.
 */

export type SportsCanonicalStatus =
  | "scheduled"
  | "pre_live"
  | "live"
  | "halftime"
  | "intermission"
  | "delayed"
  | "postponed"
  | "suspended"
  | "cancelled"
  | "abandoned"
  | "completed"
  | "after_extra_time"
  | "after_penalties"
  | "replay"
  | "ended_stream_unavailable"
  | "quarantined"
  | "unknown";

export type StatusAuthorityInput = {
  fixtureStatus?: string | null;
  providerStatus?: string | null;
  metadata?: Record<string, unknown> | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sportSlug?: string | null;
  /** Last successful authoritative provider refresh for this status. */
  providerStatusFreshAt?: string | null;
  /** Explicit admin override in metadata.manual_status */
  now?: Date;
};

export type StatusAuthorityResult = {
  canonical: SportsCanonicalStatus;
  /** True only when a trusted source says the event is in a live phase. */
  providerConfirmedLive: boolean;
  /** Provider says live but the event window is past — candidate for finalization. */
  staleLiveCandidate: boolean;
  /** Refresh candidate based on schedule proximity — not a live declaration. */
  refreshCandidate: boolean;
  reason: string;
};

/** Conservative max live duration (minutes) by sport — for stale detection only. */
export const SPORTS_MAX_LIVE_DURATION_MINUTES: Record<string, number> = {
  football: 180,
  soccer: 180,
  basketball: 210,
  tennis: 360,
  cricket: 600,
  rugby: 150,
  "australian-football": 180,
  "american-football": 240,
  hockey: 180,
  baseball: 300,
  combat: 240,
  motorsport: 480,
  golf: 720,
  surfing: 480,
  athletics: 360,
  esports: 360,
  "multi-sport": 360,
  // Unknown sports use the longest supported window so the safeguard cannot
  // prematurely remove a legitimate long-running event.
  default: 720,
};

export const SPORTS_PROVIDER_LIVE_FRESHNESS_MS = 15 * 60_000;

export function oldestPossibleSportsLiveStart(now: Date): string {
  const longestMinutes = Math.max(
    ...Object.values(SPORTS_MAX_LIVE_DURATION_MINUTES)
  );
  return new Date(now.getTime() - longestMinutes * 60_000).toISOString();
}

const LIVE_PHASE = new Set([
  "live",
  "halftime",
  "half_time",
  "ht",
  "intermission",
  "extra_time",
  "et",
  "aet",
  "penalties",
  "pens",
  "pso",
  "degraded",
]);

const COMPLETED = new Set([
  "completed",
  "finished",
  "expired",
  "after_extra_time",
  "after_penalties",
  "ended_stream_unavailable",
]);

const CANCELLED = new Set(["cancelled", "canceled", "abandoned"]);
const POSTPONED = new Set(["postponed", "suspended", "delayed"]);

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function normalizeToken(raw?: string | null): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function mapToken(token: string): SportsCanonicalStatus | null {
  if (!token) return null;
  if (token === "live" || token === "degraded") return "live";
  if (token === "halftime" || token === "half_time" || token === "ht") {
    return "halftime";
  }
  if (token === "intermission" || token === "break") return "intermission";
  if (token === "extra_time" || token === "et" || token === "aet") {
    return "after_extra_time";
  }
  if (token === "penalties" || token === "pens" || token === "pso") {
    return "after_penalties";
  }
  if (token === "scheduled" || token === "verified" || token === "pre_live") {
    return token === "pre_live" ? "pre_live" : "scheduled";
  }
  if (token === "delayed") return "delayed";
  if (token === "postponed") return "postponed";
  if (token === "suspended") return "suspended";
  if (token === "cancelled" || token === "canceled") return "cancelled";
  if (token === "abandoned") return "abandoned";
  if (COMPLETED.has(token)) return "completed";
  if (token === "quarantined" || token === "rights_revoked" || token === "removed") {
    return "quarantined";
  }
  if (token === "replay") return "replay";
  return null;
}

function maxLiveMs(sportSlug?: string | null): number {
  const key = normalizeToken(sportSlug);
  const minutes =
    SPORTS_MAX_LIVE_DURATION_MINUTES[key] ||
    SPORTS_MAX_LIVE_DURATION_MINUTES.default;
  return minutes * 60_000;
}

/**
 * Resolve canonical status without inventing live from the clock.
 */
export function resolveSportsStatusAuthority(
  input: StatusAuthorityInput
): StatusAuthorityResult {
  const now = input.now ?? new Date();
  const starts = parseDate(input.startsAt);
  const ends = parseDate(input.endsAt);
  const meta = input.metadata && typeof input.metadata === "object"
    ? input.metadata
    : null;

  const manual = mapToken(normalizeToken(meta?.manual_status as string));
  const federation = mapToken(
    normalizeToken(
      (meta?.federation_status as string) ||
        (meta?.official_status as string) ||
        (meta?.league_status as string)
    )
  );
  const provider = mapToken(
    normalizeToken(input.providerStatus || input.fixtureStatus)
  );

  let canonical: SportsCanonicalStatus = "unknown";
  let reason = "no_signal";

  if (manual) {
    canonical = manual;
    reason = "manual_override";
  } else if (federation) {
    canonical = federation;
    reason = "federation_or_league_status";
  } else if (provider) {
    canonical = provider;
    reason = "provider_status";
  } else {
    canonical = "scheduled";
    reason = "default_scheduled_no_trustworthy_live_signal";
  }

  const rawLiveSignal =
    LIVE_PHASE.has(normalizeToken(input.providerStatus)) ||
    LIVE_PHASE.has(normalizeToken(input.fixtureStatus)) ||
    LIVE_PHASE.has(normalizeToken(meta?.federation_status as string)) ||
    LIVE_PHASE.has(normalizeToken(meta?.manual_status as string));

  const providerFreshAt = parseDate(
    input.providerStatusFreshAt ||
      (meta?.provider_status_fresh_at as string) ||
      (meta?.last_synced_at as string)
  );
  const providerSignalFresh = Boolean(
    providerFreshAt &&
      now.getTime() >= providerFreshAt.getTime() &&
      now.getTime() - providerFreshAt.getTime() <= SPORTS_PROVIDER_LIVE_FRESHNESS_MS
  );

  let staleLiveCandidate = false;
  if (rawLiveSignal) {
    const durationEnd = starts
      ? new Date(starts.getTime() + maxLiveMs(input.sportSlug))
      : null;
    const hardEnd =
      ends && durationEnd
        ? new Date(Math.min(ends.getTime(), durationEnd.getTime()))
        : ends || durationEnd;
    if (!providerSignalFresh && hardEnd && now.getTime() > hardEnd.getTime()) {
      staleLiveCandidate = true;
      // Do not invent scores — finalize as completed / stream unavailable.
      if (canonical === "live" || canonical === "halftime" || canonical === "intermission") {
        canonical = "ended_stream_unavailable";
        reason = "stale_live_past_end_or_max_duration";
      }
    }
  }

  const providerConfirmedLive =
    !staleLiveCandidate &&
    (canonical === "live" ||
      canonical === "halftime" ||
      canonical === "intermission" ||
      canonical === "after_extra_time" ||
      canonical === "after_penalties");

  // Time only for refresh candidacy — never sets live.
  let refreshCandidate = false;
  if (starts) {
    const delta = starts.getTime() - now.getTime();
    if (delta <= 2 * 60 * 60_000 && delta >= -maxLiveMs(input.sportSlug)) {
      refreshCandidate = true;
    }
  }
  if (providerConfirmedLive || staleLiveCandidate) {
    refreshCandidate = true;
  }

  return {
    canonical,
    providerConfirmedLive,
    staleLiveCandidate,
    refreshCandidate,
    reason,
  };
}

export function isProviderConfirmedLiveStatus(status?: string | null): boolean {
  const token = normalizeToken(status);
  return LIVE_PHASE.has(token);
}

export function isTerminalFixtureStatus(status?: string | null): boolean {
  const token = normalizeToken(status);
  return (
    COMPLETED.has(token) ||
    CANCELLED.has(token) ||
    POSTPONED.has(token) ||
    token === "quarantined" ||
    token === "ended_stream_unavailable"
  );
}
