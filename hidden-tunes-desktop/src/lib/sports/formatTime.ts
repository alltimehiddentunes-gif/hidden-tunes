/** Safe Sports kickoff / schedule display — local TZ, no silent hour shifts. */

export type SportsParsedInstant = {
  /** Valid Date when parse succeeded. */
  date: Date | null
  /** True when original string had Z or ±offset. */
  hasExplicitOffset: boolean
  /** Original trimmed input. */
  raw: string | null
}

const HAS_OFFSET_RE = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Parse ISO-ish timestamps carefully.
 * If no Z/offset is present, treat the wall clock as UTC and keep that honesty
 * in display (append UTC label when formatting).
 */
export function parseSportsInstant(value: string | null | undefined): SportsParsedInstant {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return { date: null, hasExplicitOffset: false, raw: null }

  const hasExplicitOffset = HAS_OFFSET_RE.test(raw)
  let candidate = raw
  if (!hasExplicitOffset) {
    // Treat naive wall time as UTC rather than local — avoids silent local shift.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
      candidate = raw.endsWith('Z') ? raw : `${raw}Z`
    }
  }

  const ms = Date.parse(candidate)
  if (!Number.isFinite(ms)) {
    return { date: null, hasExplicitOffset: false, raw }
  }
  return { date: new Date(ms), hasExplicitOffset, raw }
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatLocalTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatLocalDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatLocalDateTime(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/**
 * Localized kickoff label.
 * Uses Today / Tomorrow only when correct in the user's local timezone.
 * Naive (no-offset) timestamps are shown with a UTC hint.
 */
export function formatSportsStartTime(
  value: string | null | undefined,
  now: Date = new Date(),
): string | null {
  const parsed = parseSportsInstant(value)
  if (!parsed.date) return null

  const date = parsed.date
  const today = startOfLocalDay(now)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const day = startOfLocalDay(date)

  let label: string
  if (day.getTime() === today.getTime()) {
    label = `Today · ${formatLocalTime(date)}`
  } else if (day.getTime() === tomorrow.getTime()) {
    label = `Tomorrow · ${formatLocalTime(date)}`
  } else {
    label = formatLocalDateTime(date)
  }

  if (!parsed.hasExplicitOffset) {
    return `${label} UTC`
  }
  return label
}

export function formatSportsDateOnly(value: string | null | undefined): string | null {
  const parsed = parseSportsInstant(value)
  if (!parsed.date) return null
  const label = formatLocalDate(parsed.date)
  return parsed.hasExplicitOffset ? label : `${label} UTC`
}
