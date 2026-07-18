/**
 * Maps internal fixture / broadcast lifecycle to public event status.
 * Does not replace internal statuses — browse-layer only.
 */

import type { SportsPublicEventStatus } from "./types";

export type PublicStatusInput = {
  fixtureStatus?: string | null;
  broadcastStatus?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  now?: Date;
  startingSoonWindowMs?: number;
  metadata?: Record<string, unknown> | null;
  hasReplay?: boolean;
  hasHighlights?: boolean;
};

const STATUS_LABELS: Record<SportsPublicEventStatus, string> = {
  scheduled: "Scheduled",
  starting_soon: "Starting Soon",
  live: "Live",
  half_time: "Half Time",
  intermission: "Intermission",
  extra_time: "Extra Time",
  penalties: "Penalties",
  delayed: "Delayed",
  postponed: "Postponed",
  cancelled: "Cancelled",
  finished: "Finished",
  replay_available: "Replay Available",
  highlights_available: "Highlights Available",
  unavailable: "Unavailable",
};

const LIVE_CODES = new Set<SportsPublicEventStatus>([
  "live",
  "half_time",
  "intermission",
  "extra_time",
  "penalties",
]);

const FINISHED_CODES = new Set<SportsPublicEventStatus>([
  "finished",
  "replay_available",
  "highlights_available",
]);

function metaPeriod(metadata?: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const period = metadata.period ?? metadata.stage ?? metadata.round;
  return typeof period === "string" ? period.toLowerCase() : null;
}

function metaPublicHint(
  metadata?: Record<string, unknown> | null
): SportsPublicEventStatus | null {
  if (!metadata || typeof metadata !== "object") return null;
  const hint = metadata.public_status ?? metadata.event_status;
  if (typeof hint !== "string") return null;
  const normalized = hint.trim().toLowerCase().replace(/\s+/g, "_");
  if (
    [
      "scheduled",
      "starting_soon",
      "live",
      "half_time",
      "intermission",
      "extra_time",
      "penalties",
      "delayed",
      "postponed",
      "cancelled",
      "finished",
      "replay_available",
      "highlights_available",
      "unavailable",
    ].includes(normalized)
  ) {
    return normalized as SportsPublicEventStatus;
  }
  return null;
}

export function mapSportsPublicEventStatus(
  input: PublicStatusInput
): SportsPublicEventStatus {
  const now = input.now ?? new Date();
  const windowMs = input.startingSoonWindowMs ?? 120 * 60_000;
  const fixture = String(input.fixtureStatus || "").toLowerCase();
  const broadcast = String(input.broadcastStatus || "").toLowerCase();
  const period = metaPeriod(input.metadata);
  const hint = metaPublicHint(input.metadata);

  if (hint) return hint;

  if (fixture === "cancelled" || broadcast === "removed") return "cancelled";
  if (fixture === "postponed") return "postponed";
  if (fixture === "delayed" || period === "delayed") return "delayed";

  if (
    fixture === "completed" ||
    fixture === "expired" ||
    broadcast === "expired"
  ) {
    if (input.hasReplay) return "replay_available";
    if (input.hasHighlights) return "highlights_available";
    return "finished";
  }

  if (
    fixture === "quarantined" ||
    fixture === "rights_revoked" ||
    fixture === "removed" ||
    broadcast === "quarantined" ||
    broadcast === "offline" ||
    broadcast === "rights_revoked"
  ) {
    return "unavailable";
  }

  if (period === "half_time" || period === "ht") return "half_time";
  if (period === "intermission" || period === "break") return "intermission";
  if (period === "extra_time" || period === "et" || period === "aet") {
    return "extra_time";
  }
  if (period === "penalties" || period === "pens" || period === "pso") {
    return "penalties";
  }

  if (fixture === "live" || broadcast === "live" || broadcast === "degraded") {
    return "live";
  }

  const startsAt = input.startsAt ? Date.parse(input.startsAt) : NaN;
  if (
    Number.isFinite(startsAt) &&
    startsAt > now.getTime() &&
    startsAt - now.getTime() <= windowMs &&
    (fixture === "scheduled" ||
      fixture === "verified" ||
      broadcast === "scheduled" ||
      broadcast === "verified" ||
      !fixture)
  ) {
    return "starting_soon";
  }

  if (
    fixture === "scheduled" ||
    fixture === "verified" ||
    broadcast === "scheduled" ||
    broadcast === "verified"
  ) {
    return "scheduled";
  }

  if (input.hasReplay) return "replay_available";
  if (input.hasHighlights) return "highlights_available";

  if (!fixture && !broadcast) return "unavailable";
  return "scheduled";
}

export function describeSportsPublicEventStatus(code: SportsPublicEventStatus): {
  code: SportsPublicEventStatus;
  label: string;
  live: boolean;
  finished: boolean;
} {
  return {
    code,
    label: STATUS_LABELS[code],
    live: LIVE_CODES.has(code),
    finished: FINISHED_CODES.has(code),
  };
}

export function watchabilityFromPublicStatus(
  code: SportsPublicEventStatus,
  opts: {
    hasPlayableBroadcast?: boolean;
    hasReplay?: boolean;
    hasHighlights?: boolean;
  } = {}
): {
  state: import("./types").SportsWatchabilityState;
  playable: boolean;
  playbackModeHint?: "embed" | "native" | "webview" | null;
} {
  if (opts.hasPlayableBroadcast && (code === "live" || LIVE_CODES.has(code))) {
    return { state: "watch", playable: true, playbackModeHint: null };
  }
  if (code === "starting_soon" || code === "scheduled" || code === "delayed") {
    return {
      state: "starting_soon",
      playable: false,
      playbackModeHint: null,
    };
  }
  if (code === "replay_available" || opts.hasReplay) {
    return { state: "replay", playable: false, playbackModeHint: null };
  }
  if (code === "highlights_available" || opts.hasHighlights) {
    return { state: "highlights", playable: false, playbackModeHint: null };
  }
  if (FINISHED_CODES.has(code) || code === "finished") {
    return { state: "unavailable", playable: false, playbackModeHint: null };
  }
  return { state: "unavailable", playable: false, playbackModeHint: null };
}
