import type { SportsFixtureStatus } from './types'

export type NormalizeSportsStatusInput = {
  code?: string | null
  label?: string | null
  live?: boolean | null
  finished?: boolean | null
  startTime?: string | null
  endTime?: string | null
  status?: {
    code?: string | null
    label?: string | null
    live?: boolean | null
    finished?: boolean | null
  } | null
}

export type NormalizeSportsStatusResult = {
  status: SportsFixtureStatus
  diagnostics: string[]
}

const TERMINAL_CANCELLED = new Set(['cancelled', 'canceled'])
const TERMINAL_ABANDONED = new Set(['abandoned', 'abandoned_match'])
const TERMINAL_SUSPENDED = new Set(['suspended'])
const TERMINAL_POSTPONED = new Set(['postponed'])
const TERMINAL_COMPLETED = new Set([
  'finished',
  'completed',
  'ended',
  'final',
  'replay_available',
  'highlights_available',
])
const LIVE_FAMILY = new Set([
  'live',
  'half_time',
  'halftime',
  'ht',
  'intermission',
  'extra_time',
  'et',
  'aet',
  'penalties',
  'pens',
  'pso',
])
const UPCOMING_FAMILY = new Set([
  'scheduled',
  'starting_soon',
  'delayed',
  'verified',
  'upcoming',
  'not_started',
])

function normalizeCode(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * ONE status normalizer for desktop Sports.
 * Titles containing "LIVE" must NEVER force a live badge — code/flags only.
 * NEVER mark live solely because startTime has passed.
 */
export function normalizeSportsFixtureStatus(
  input: NormalizeSportsStatusInput | null | undefined,
): NormalizeSportsStatusResult {
  const diagnostics: string[] = []
  const nested = input?.status && typeof input.status === 'object' ? input.status : null
  const code = normalizeCode(input?.code ?? nested?.code ?? input?.label ?? nested?.label)
  const liveFlag = input?.live === true || nested?.live === true
  const finishedFlag = input?.finished === true || nested?.finished === true
  const startTime = input?.startTime ?? null

  if (!code && !liveFlag && !finishedFlag) {
    if (!startTime) diagnostics.push('sports_missing_start_time')
    diagnostics.push('sports_unknown_status')
    return { status: 'unknown', diagnostics }
  }

  // Prefer explicit backend terminal states.
  if (TERMINAL_CANCELLED.has(code)) {
    if (liveFlag) diagnostics.push('sports_status_conflict')
    return { status: 'cancelled', diagnostics }
  }
  if (TERMINAL_POSTPONED.has(code)) {
    if (liveFlag) diagnostics.push('sports_status_conflict')
    return { status: 'postponed', diagnostics }
  }
  if (TERMINAL_COMPLETED.has(code) || finishedFlag) {
    if (liveFlag || LIVE_FAMILY.has(code)) {
      // finished flag / completed family wins over live noise
      if (liveFlag && !TERMINAL_COMPLETED.has(code)) {
        diagnostics.push('sports_status_conflict')
      }
    }
    return { status: 'finished', diagnostics }
  }

  // Live family — only via live flag OR code in live family (never startTime alone).
  if (LIVE_FAMILY.has(code) || liveFlag) {
    if (liveFlag && code && !LIVE_FAMILY.has(code) && !UPCOMING_FAMILY.has(code) && code !== 'unavailable') {
      // live=true with an unexpected non-live code — still trust live flag but note conflict
      if (TERMINAL_CANCELLED.has(code) || TERMINAL_POSTPONED.has(code) || TERMINAL_COMPLETED.has(code)) {
        diagnostics.push('sports_status_conflict')
      }
    }
    return { status: code === 'half_time' || code === 'halftime' || code === 'ht' || code === 'intermission' ? 'paused' : 'live', diagnostics }
  }

  if (UPCOMING_FAMILY.has(code)) {
    if (!startTime) diagnostics.push('sports_missing_start_time')
    return { status: 'scheduled', diagnostics }
  }

  if (TERMINAL_SUSPENDED.has(code)) return { status: 'suspended', diagnostics }
  if (TERMINAL_ABANDONED.has(code)) return { status: 'abandoned', diagnostics }

  if (code === 'unavailable' || code === 'unknown') {
    diagnostics.push('sports_unknown_status')
    return { status: 'unknown', diagnostics }
  }

  if (code) {
    diagnostics.push('sports_unknown_status')
  } else {
    diagnostics.push('sports_unknown_status')
  }

  // Intentionally ignore elapsed startTime — never invent live.
  if (!startTime) diagnostics.push('sports_missing_start_time')
  return { status: 'unknown', diagnostics }
}

/**
 * Format a score only when both sides are present.
 * Never invent "0-0" / "0–0" from missing values.
 */
export function formatSportsScore(
  home: string | number | null | undefined,
  away: string | number | null | undefined,
): string | null {
  if (home == null || away == null) return null
  const homeText = String(home).trim()
  const awayText = String(away).trim()
  if (!homeText || !awayText) return null
  return `${homeText}–${awayText}`
}

export type SportsParticipantLike = {
  name?: string | null
  side?: string | null
  score?: string | number | null
}

export function participantsToTeams(participants: unknown): {
  homeTeam: string | null
  awayTeam: string | null
  homeScore: string | number | null
  awayScore: string | number | null
} {
  const rows = Array.isArray(participants) ? participants : []
  const normalized = rows
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const record = row as SportsParticipantLike
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      if (!name) return null
      const side = typeof record.side === 'string' ? record.side.trim().toLowerCase() : ''
      return {
        name,
        side,
        score: record.score ?? null,
      }
    })
    .filter((entry): entry is { name: string; side: string; score: string | number | null } => Boolean(entry))

  const homeExact = normalized.find((entry) => entry.side === 'home')
  const awayExact = normalized.find((entry) => entry.side === 'away')
  const home = homeExact || normalized[0] || null
  const away = awayExact || (homeExact ? normalized.find((entry) => entry !== homeExact) : normalized[1]) || null

  return {
    homeTeam: home?.name ?? null,
    awayTeam: away?.name ?? null,
    homeScore: home?.score ?? null,
    awayScore: away?.score ?? null,
  }
}

export function normalizeSportsParticipants(participants: unknown) {
  if (!Array.isArray(participants)) return []
  return participants.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const record = row as SportsParticipantLike
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) return []
    const side = typeof record.side === 'string' ? record.side.trim().toLowerCase() : null
    return [{ name, side: side || null, score: record.score ?? null }]
  })
}
