/**
 * Timezone helpers for Today's Schedule (user calendar day, not UTC midnight).
 */

export type DayBounds = {
  startIso: string;
  endIso: string;
  timeZone: string;
  localDate: string;
};

const DEFAULT_TZ = "UTC";

/**
 * Returns [start, end) of the calendar day for `now` in `timeZone`.
 * Uses Intl offset sampling — no external deps.
 */
export function getCalendarDayBounds(
  now: Date,
  timeZone?: string | null
): DayBounds {
  const tz = normalizeTimeZone(timeZone) || DEFAULT_TZ;
  const localDate = formatDateInTimeZone(now, tz);
  const startUtc = zonedLocalToUtc(`${localDate}T00:00:00`, tz);
  const endUtc = zonedLocalToUtc(`${localDate}T24:00:00`, tz);
  return {
    startIso: startUtc.toISOString(),
    endIso: endUtc.toISOString(),
    timeZone: tz,
    localDate,
  };
}

export function normalizeTimeZone(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: raw });
    return raw;
  } catch {
    return null;
  }
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/**
 * Interpret a local wall time in a zone as a UTC Date.
 * `localIso` like 2026-07-17T00:00:00 or 2026-07-17T24:00:00.
 */
function zonedLocalToUtc(localIso: string, timeZone: string): Date {
  const match = localIso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
  );
  if (!match) return new Date(NaN);
  let year = Number(match[1]);
  let month = Number(match[2]);
  let day = Number(match[3]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }

  // Binary-search UTC instant whose wall time in zone matches.
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 3; i += 1) {
    const asLocal = formatPartsInZone(new Date(guess), timeZone);
    const wanted = {
      year,
      month,
      day,
      hour,
      minute,
      second,
    };
    const deltaMs =
      Date.UTC(
        wanted.year,
        wanted.month - 1,
        wanted.day,
        wanted.hour,
        wanted.minute,
        wanted.second
      ) -
      Date.UTC(
        asLocal.year,
        asLocal.month - 1,
        asLocal.day,
        asLocal.hour,
        asLocal.minute,
        asLocal.second
      );
    guess += deltaMs;
    if (deltaMs === 0) break;
  }
  return new Date(guess);
}

function formatPartsInZone(
  date: Date,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}
