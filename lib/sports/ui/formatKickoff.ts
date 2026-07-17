/** Shared kickoff / countdown formatting for Sports cards. */
export function formatKickoff(
  startsAt: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!startsAt) return "";
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const sameDay =
    date.getFullYear() === new Date(nowMs).getFullYear() &&
    date.getMonth() === new Date(nowMs).getMonth() &&
    date.getDate() === new Date(nowMs).getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${time}`;
}
/**
 * Lightweight countdown using a shared clock (pass nowMs from one page clock).
 * Returns null when not useful.
 */
export function formatCountdown(
  startsAt: string | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!startsAt) return null;
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return null;
  const delta = ms - nowMs;
  if (delta <= 0 || delta > 6 * 60 * 60 * 1000) return null;
  const totalMinutes = Math.floor(delta / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}
export function formatFinishedTime(
  endsAt: string | null | undefined,
  startsAt?: string | null
): string {
  const raw = endsAt || startsAt;
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
