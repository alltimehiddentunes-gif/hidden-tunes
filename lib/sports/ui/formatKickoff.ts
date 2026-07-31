/**
 * Shared kickoff / countdown / finished-time formatting for Sports cards.
 */

export function formatKickoff(
  startsAt: string | null | undefined,
  nowMs: number = Date.now()
): string {
  if (!startsAt) return "";
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const now = new Date(nowMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today · ${time}`;
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${time}`;
}

/**
 * Countdown using a shared page clock.
 * Short-horizon for "starting soon"; still useful up to a week for shelves.
 */
export function formatCountdown(
  startsAt: string | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!startsAt) return null;
  const ms = Date.parse(startsAt);
  if (!Number.isFinite(ms)) return null;
  const delta = ms - nowMs;
  if (delta <= 0 || delta > 7 * 24 * 60 * 60 * 1000) return null;
  const totalMinutes = Math.floor(delta / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    if (hours > 0) return `Starts in ${days}d ${hours}h`;
    return `Starts in ${days}d`;
  }
  if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
  return `Starts in ${minutes}m`;
}

export function formatFinishedTime(
  endsAt: string | null | undefined,
  startsAt?: string | null,
  nowMs: number = Date.now()
): string {
  const raw = endsAt || startsAt;
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const now = new Date(nowMs);
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (sameDay) return `Today · ${time}`;
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${day} · ${time}`;
}
