import type { SportsMatchCard } from "../../../types/sports";
const STATUS_LABELS: Record<string, string> = {
  live: "LIVE",
  starting_soon: "STARTING SOON",
  scheduled: "UPCOMING",
  half_time: "HALF TIME",
  intermission: "INTERMISSION",
  extra_time: "EXTRA TIME",
  penalties: "PENALTIES",
  delayed: "DELAYED",
  postponed: "POSTPONED",
  cancelled: "CANCELLED",
  finished: "FINAL",
  replay_available: "REPLAY",
  highlights_available: "HIGHLIGHTS",
  unavailable: "UNAVAILABLE",
};
export type SportsStatusTone =
  | "live"
  | "soon"
  | "neutral"
  | "finished"
  | "warn"
  | "danger"
  | "replay";
export function normalizeStatusCode(code: string | null | undefined): string {
  return String(code || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}
export function formatStatusLabel(
  code: string | null | undefined,
  fallback?: string | null
): string {
  const normalized = normalizeStatusCode(code);
  if (STATUS_LABELS[normalized]) return STATUS_LABELS[normalized];
  if (fallback && fallback.trim()) return fallback.trim().toUpperCase();
  if (!normalized) return "";
  return normalized.replace(/_/g, " ").toUpperCase();
}
export function statusTone(code: string | null | undefined): SportsStatusTone {
  const normalized = normalizeStatusCode(code);
  if (
    normalized === "live" ||
    normalized === "half_time" ||
    normalized === "extra_time" ||
    normalized === "penalties" ||
    normalized === "intermission"
  ) {
    return "live";
  }
  if (normalized === "starting_soon") return "soon";
  if (normalized === "postponed" || normalized === "delayed") return "warn";
  if (normalized === "cancelled" || normalized === "unavailable") return "danger";
  if (
    normalized === "finished" ||
    normalized === "replay_available" ||
    normalized === "highlights_available"
  ) {
    return normalized === "finished" ? "finished" : "replay";
  }
  return "neutral";
}
export function canShowWatchAction(card: SportsMatchCard): boolean {
  const code = normalizeStatusCode(card.status?.code);
  if (code === "cancelled" || code === "postponed" || code === "unavailable") {
    return false;
  }
  if (card.watchability?.playable) return true;
  const state = String(card.watchability?.state || "").toLowerCase();
  return state === "watch" || state === "replay" || state === "highlights";
}
export function primaryActionLabel(card: SportsMatchCard): string | null {
  const code = normalizeStatusCode(card.status?.code);
  if (code === "cancelled" || code === "postponed") return null;
  if (code === "unavailable") return null;
  const state = String(card.watchability?.state || "").toLowerCase();
  if (state === "replay" || code === "replay_available") return "Replay";
  if (state === "highlights" || code === "highlights_available") {
    return "Highlights";
  }
  if (card.watchability?.playable || state === "watch" || code === "live") {
    if (card.resume?.stillLive) return "Resume live";
    if (card.resume?.label) return card.resume.label;
    return "Watch";
  }
  if (code === "starting_soon" || code === "scheduled" || state === "starting_soon") {
    return "Remind me";
  }
  if (code === "finished") return null;
  return null;
}
export function formatMatchMinute(card: SportsMatchCard): string | null {
  const minute = card.timing?.minute;
  if (typeof minute === "number" && Number.isFinite(minute) && minute >= 0) {
    return `${minute}'`;
  }
  const period = card.timing?.period;
  if (period && String(period).trim()) return String(period).trim();
  return null;
}
