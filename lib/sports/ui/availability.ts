/**
 * Sports event availability — drives Watch button visibility.
 * Only live_in_app may show "Watch Live".
 */
import type { SportsMatchCard } from "../../../types/sports";

export const SPORTS_AVAILABILITY_STATES = [
  "live_in_app",
  "live_external",
  "live_subscription",
  "live_unavailable",
  "upcoming",
  "finished",
  "replay_available",
  "highlights_available",
] as const;

export type SportsAvailabilityState = (typeof SPORTS_AVAILABILITY_STATES)[number];

export type SportsWatchAction =
  | { kind: "watch_live"; label: "Watch Live" }
  | { kind: "watch_external"; label: "Watch on Official Provider" }
  | { kind: "subscription"; label: "Subscription Required" }
  | { kind: "remind"; label: "Remind Me" }
  | { kind: "replay"; label: "Watch Replay" }
  | { kind: "highlights"; label: "Watch Highlights" }
  | { kind: "none"; label: null; meta?: string };

function normalizeStatusCode(code: string | null | undefined): string {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function isLiveCode(code: string): boolean {
  return (
    code === "live" ||
    code === "half_time" ||
    code === "intermission" ||
    code === "extra_time" ||
    code === "penalties"
  );
}

/**
 * Derive availability from match card fields.
 * Never invents live_in_app from metadata-only live status.
 */
export function deriveSportsAvailability(
  card: SportsMatchCard
): SportsAvailabilityState {
  if (card.availabilityState) return card.availabilityState;

  const code = normalizeStatusCode(card.status?.code);
  const state = String(card.watchability?.state || "").toLowerCase();
  const playable = card.watchability?.playable === true;
  const access = String(card.watchability?.access || "").toLowerCase();

  if (code === "cancelled" || code === "postponed") return "live_unavailable";
  if (code === "replay_available" || state === "replay") return "replay_available";
  if (code === "highlights_available" || state === "highlights") {
    return "highlights_available";
  }
  if (code === "finished" || card.status?.finished) return "finished";

  if (
    code === "starting_soon" ||
    code === "scheduled" ||
    code === "delayed" ||
    state === "starting_soon"
  ) {
    return "upcoming";
  }

  if (isLiveCode(code) || card.status?.live) {
    if (
      playable &&
      (state === "watch" || state === "live_in_app" || state === "live" || !state)
    ) {
      if (access === "subscription" || state === "live_subscription") {
        return "live_subscription";
      }
      if (access === "external" || state === "live_external") {
        return "live_external";
      }
      return "live_in_app";
    }
    if (access === "subscription" || state === "live_subscription") {
      return "live_subscription";
    }
    if (access === "external" || state === "live_external") {
      return "live_external";
    }
    return "live_unavailable";
  }

  if (code === "unavailable") return "live_unavailable";
  return "upcoming";
}

export function isLiveInAppPlayable(card: SportsMatchCard): boolean {
  return deriveSportsAvailability(card) === "live_in_app";
}

export function getSportsWatchAction(card: SportsMatchCard): SportsWatchAction {
  const availability = deriveSportsAvailability(card);
  switch (availability) {
    case "live_in_app":
      return { kind: "watch_live", label: "Watch Live" };
    case "live_external":
      return { kind: "watch_external", label: "Watch on Official Provider" };
    case "live_subscription":
      return { kind: "subscription", label: "Subscription Required" };
    case "upcoming":
      return { kind: "remind", label: "Remind Me" };
    case "replay_available":
      return { kind: "replay", label: "Watch Replay" };
    case "highlights_available":
      return { kind: "highlights", label: "Watch Highlights" };
    case "finished":
      return { kind: "none", label: null };
    case "live_unavailable":
    default:
      return {
        kind: "none",
        label: null,
        meta: card.status?.live ? "Live score · No stream available" : undefined,
      };
  }
}

export function canShowWatchAction(card: SportsMatchCard): boolean {
  const action = getSportsWatchAction(card);
  return (
    action.kind === "watch_live" ||
    action.kind === "replay" ||
    action.kind === "highlights" ||
    action.kind === "watch_external" ||
    action.kind === "subscription"
  );
}

export function primaryActionLabel(card: SportsMatchCard): string | null {
  return getSportsWatchAction(card).label;
}

export function shouldOpenSportsPlayer(card: SportsMatchCard): boolean {
  const kind = getSportsWatchAction(card).kind;
  return kind === "watch_live" || kind === "replay" || kind === "highlights";
}
