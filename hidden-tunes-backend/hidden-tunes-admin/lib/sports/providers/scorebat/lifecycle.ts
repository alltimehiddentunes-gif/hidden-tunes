/**
 * ScoreBat lifecycle classification and hibernation rules.
 */

import type { ScoreBatLifecycleState, ScoreBatVideoClass } from "./types";

export type LifecycleInput = {
  startsAt: string;
  videoTitles: string[];
  now?: Date;
  /** Expected match duration for post-finish window. */
  expectedDurationMs?: number;
};

export function classifyScoreBatVideoTitle(title: string): ScoreBatVideoClass {
  const t = String(title || "").toLowerCase();
  if (/\blive\b|livestream|live stream/.test(t)) return "live";
  if (/extended highlight|highlight/.test(t)) return "highlights";
  if (/replay|full match|full game/.test(t)) return "replay";
  return "other";
}

export function classifyScoreBatLifecycle(
  input: LifecycleInput
): ScoreBatLifecycleState {
  const now = input.now ?? new Date();
  const start = Date.parse(input.startsAt);
  if (!Number.isFinite(start)) return "discovered";

  const duration = input.expectedDurationMs ?? 2.5 * 60 * 60_000;
  const end = start + duration;
  const minsToKick = (start - now.getTime()) / 60_000;
  const titles = input.videoTitles.map((t) => t.toLowerCase());
  const hasLive = titles.some((t) => /\blive\b|livestream/.test(t));
  const hasHighlights = titles.some((t) => /highlight/.test(t));
  const hasReplay = titles.some((t) => /replay|full match/.test(t));

  if (now.getTime() > end + 30 * 60_000) {
    if (hasReplay) return "replay";
    if (hasHighlights) return "highlights";
    return "hibernating";
  }

  if (now.getTime() >= start && now.getTime() <= end + 30 * 60_000) {
    if (hasLive) return "live";
    if (now.getTime() > end) {
      if (hasReplay) return "replay";
      if (hasHighlights) return "highlights";
      return "finished";
    }
    return hasLive ? "live" : "playable";
  }

  if (minsToKick <= 15 && minsToKick >= 0) {
    return hasLive || true ? "starting_soon" : "scheduled";
  }
  if (minsToKick <= 120 && minsToKick > 15) return "scheduled";
  if (minsToKick > 120) return "discovered";

  return "finished";
}

/**
 * Suggested poll interval (seconds) for a lifecycle state.
 * Workers only — never from API routes.
 */
export function scoreBatPollIntervalSeconds(
  state: ScoreBatLifecycleState
): number | null {
  switch (state) {
    case "discovered":
      return null; // no active polling
    case "scheduled":
      return 15 * 60;
    case "starting_soon":
    case "playable":
    case "live":
      return 90;
    case "finished":
      return 5 * 60;
    case "highlights":
    case "replay":
      return 60 * 60;
    case "hibernating":
    case "expired":
      return null;
    default:
      return null;
  }
}

export function shouldHibernateScoreBat(state: ScoreBatLifecycleState): boolean {
  return state === "hibernating" || state === "expired";
}
