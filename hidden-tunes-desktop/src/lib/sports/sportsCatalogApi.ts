import { requestCatalogJsonWithFallbackRequest } from '../desktopCatalogBridge'
import { emitSportsDiagnostic } from './diagnostics'
import {
  formatSportsScore,
  normalizeSportsParticipants,
  normalizeSportsFixtureStatus,
  participantsToTeams,
} from './status'
import type {
  DesktopSportsFixture,
  SportsBrowseFilter,
  SportsFixtureDetailResult,
  SportsFixturesPage,
  SportsPlaySession,
  SportsSearchFixtureResult,
  SportsUnavailableReason,
} from './types'
import { SPORTS_PAGE_SIZE, SPORTS_REQUEST_TIMEOUT_MS } from './types'

/**
 * Public Sports catalog API (Next.js admin) — same host as Radio/TV.
 * Browse never requests playback. Play resolves only on user tap.
 */
export const SPORTS_CATALOG_BASE_URL =
  import.meta.env.VITE_CATALOG_ADMIN_API_URL?.trim().replace(/\/+$/, '')
  || 'https://admin.hiddentunes.com'

const inflightGets = new Map<string, Promise<unknown>>()

function clampPage(page: number | undefined) {
  const value = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1
  return Math.max(1, value)
}

function clampLimit(limit: number | undefined) {
  const value = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : SPORTS_PAGE_SIZE
  return Math.min(40, Math.max(1, value))
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }
  return query
}

function isAbortError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = String((error as { name?: string }).name || '')
  if (name === 'AbortError') return true
  const message = String((error as { message?: string }).message || '')
  return /aborted|AbortError|The operation was aborted/i.test(message)
}

function friendlySportsError(error: unknown, status?: number): Error {
  if (isAbortError(error)) {
    return error instanceof Error ? error : new DOMException('The operation was aborted.', 'AbortError')
  }
  const message = error instanceof Error ? error.message : String(error || '')
  if (/timed out|timeout/i.test(message)) {
    return new Error('The Sports service took too long to respond.')
  }
  if (status === 404) {
    return new Error('This Sports content was not found.')
  }
  if (status && status >= 500) {
    return new Error('Sports could not be loaded.')
  }
  if (/failed to fetch|network|unreachable|Unable to reach/i.test(message)) {
    return new Error('Sports could not be loaded.')
  }
  return new Error('Sports could not be loaded.')
}

function dedupeGet<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = inflightGets.get(key)
  if (existing) return existing as Promise<T>
  const promise = factory().finally(() => {
    inflightGets.delete(key)
  })
  inflightGets.set(key, promise)
  return promise
}

async function sportsRequest(
  path: string,
  options?: {
    method?: 'GET' | 'POST'
    body?: Record<string, unknown> | null
    signal?: AbortSignal
  },
): Promise<{ payload: unknown; status: number }> {
  if (options?.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }

  const method = options?.method || 'GET'
  const run = async () => {
    try {
      return await requestCatalogJsonWithFallbackRequest(SPORTS_CATALOG_BASE_URL, {
        path,
        method,
        body: options?.body ?? null,
        timeoutMs: SPORTS_REQUEST_TIMEOUT_MS,
        signal: options?.signal,
      })
    } catch (error) {
      throw friendlySportsError(error)
    }
  }

  if (method === 'GET') {
    return dedupeGet(`GET:${path}`, run)
  }
  return run()
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readHttpUrl(value: unknown): string | null {
  const text = readString(value)
  if (!text) return null
  return /^https?:\/\//i.test(text) ? text : null
}

/**
 * Normalize API match cards → DesktopSportsFixture centrally.
 * Titles containing "LIVE" do not force live status.
 */
export function normalizeSportsMatchCard(row: unknown): DesktopSportsFixture | null {
  const record = asRecord(row)
  if (!record) return null

  const id = readString(record.id)
  if (!id) return null

  const sportObj = asRecord(record.sport)
  const competition = asRecord(record.competition)
  const statusObj = asRecord(record.status)
  const timing = asRecord(record.timing)
  const venueObj = asRecord(record.venue)
  const artworkObj = asRecord(record.artwork)
  const watchability = asRecord(record.watchability)

  const teams = participantsToTeams(record.participants)
  const participants = normalizeSportsParticipants(record.participants)
  const startTime =
    readString(timing?.startsAt)
    || readString(record.startTime)
    || readString(record.starts_at)
    || readString(record.kickoff)
  const endTime =
    readString(timing?.endsAt)
    || readString(record.endTime)
    || readString(record.ends_at)

  const normalized = normalizeSportsFixtureStatus({
    code: readString(statusObj?.code) || readString(record.status),
    label: readString(statusObj?.label),
    live: statusObj?.live === true,
    finished: statusObj?.finished === true,
    startTime,
    endTime,
    status: statusObj
      ? {
          code: readString(statusObj.code),
          label: readString(statusObj.label),
          live: statusObj.live === true,
          finished: statusObj.finished === true,
        }
      : null,
  })

  for (const diagnostic of normalized.diagnostics) {
    if (
      diagnostic === 'sports_status_conflict'
      || diagnostic === 'sports_missing_start_time'
      || diagnostic === 'sports_unknown_status'
    ) {
      emitSportsDiagnostic(diagnostic, { fixtureId: id, code: statusObj?.code ?? null })
    }
  }

  const scoreFromParticipants = formatSportsScore(teams.homeScore, teams.awayScore)
  const scoreDirect = readString(record.score)
  // Prefer participant scores; accept explicit score field from backend (including real 0–0).
  const score = scoreFromParticipants || scoreDirect

  const playableHint =
    watchability?.playable === true
    || String(watchability?.state || '').toLowerCase() === 'watch'

  const availabilityState = readString(record.availabilityState) || readString(record.availability_state)

  const homeTeam = teams.homeTeam || readString(record.homeTeam) || readString(record.home_team)
  const awayTeam = teams.awayTeam || readString(record.awayTeam) || readString(record.away_team)
  const title =
    readString(record.title)
    || (homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : null)

  const artwork =
    readHttpUrl(artworkObj?.posterUrl)
    || readHttpUrl(artworkObj?.thumbnailUrl)
    || readHttpUrl(record.artwork)
    || readHttpUrl(record.artworkUrl)
    || readHttpUrl(record.thumbnail_url)

  const venueName = readString(venueObj?.name) || readString(record.venue)
  const country =
    readString(venueObj?.countryCode)
    || readString(competition?.countryCode)
    || readString(record.country)

  return {
    id,
    sport: readString(sportObj?.name) || readString(record.sport),
    sportSlug: readString(sportObj?.slug) || readString(record.sportSlug) || readString(record.sport_slug),
    league: readString(competition?.name) || readString(record.league) || readString(record.competition),
    homeTeam,
    awayTeam,
    title,
    participants,
    status: normalized.status,
    backendStatusCode: readString(statusObj?.code) || readString(record.status),
    startTime,
    endTime,
    score,
    country,
    venue: venueName,
    isPlayable: playableHint,
    provider: readString(record.provider) || readString(record.providerLabel) || null,
    artwork,
    availabilityState,
    metadata: asRecord(record.metadata),
  }
}

function normalizeFixturesList(rows: unknown): DesktopSportsFixture[] {
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const fixtures: DesktopSportsFixture[] = []
  for (const row of rows) {
    const fixture = normalizeSportsMatchCard(row)
    if (!fixture || seen.has(fixture.id)) continue
    seen.add(fixture.id)
    fixtures.push(fixture)
  }
  return fixtures
}

function emptyPage(page: number, limit: number, enabled = true, message?: string | null): SportsFixturesPage {
  return {
    success: true,
    enabled,
    fixtures: [],
    pagination: { page, limit, hasMore: false },
    message: message ?? null,
  }
}

function filterQueryParam(filter: SportsBrowseFilter | undefined) {
  switch (filter) {
    case 'live':
      return { live: 1 }
    case 'upcoming':
      return { upcoming: 1 }
    case 'results':
      return { finished: 1 }
    default:
      return {}
  }
}

export async function fetchSportsFixtures(options: {
  filter?: SportsBrowseFilter
  page?: number
  limit?: number
  sport?: string | null
  date?: string | null
  status?: string | null
  country?: string | null
  competition?: string | null
  signal?: AbortSignal
} = {}): Promise<SportsFixturesPage> {
  const page = clampPage(options.page)
  const limit = clampLimit(options.limit ?? SPORTS_PAGE_SIZE)
  const filter = options.filter || 'all'
  const sport = options.sport?.trim() || undefined
  const date = options.date?.trim() || (filter === 'today' ? new Date().toISOString().slice(0, 10) : undefined)

  emitSportsDiagnostic('sports_browse_started', { filter, page, limit, sport: sport || null })

  const query = buildQuery({
    page,
    limit,
    sport,
    date,
    status: options.status?.trim() || undefined,
    countryCode: options.country?.trim() || undefined,
    competition: options.competition?.trim() || undefined,
    ...filterQueryParam(filter),
  })

  try {
    const { payload, status } = await sportsRequest(`/api/sports/fixtures?${query.toString()}`, {
      signal: options.signal,
    })

    if (options.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    const record = asRecord(payload)
    if (!record) {
      throw friendlySportsError(new Error('invalid payload'), status)
    }

    if (record.enabled === false) {
      emitSportsDiagnostic('sports_browse_completed', { filter, enabled: false, count: 0 })
      return emptyPage(page, limit, false, readString(record.message) || 'Sports is not available right now.')
    }

    if (status < 200 || status >= 300) {
      throw friendlySportsError(new Error(readString(record.error) || 'failed'), status)
    }

    const fixtures = normalizeFixturesList(record.items ?? record.fixtures ?? record.matches)
    const pagination = asRecord(record.pagination)
    const hasMore = Boolean(pagination?.hasMore ?? record.nextCursor)

    emitSportsDiagnostic('sports_browse_completed', {
      filter,
      enabled: true,
      count: fixtures.length,
      hasMore,
      page,
    })

    return {
      success: record.success !== false,
      enabled: true,
      fixtures,
      pagination: {
        page: Number(pagination?.page || page),
        limit: Number(pagination?.limit || limit),
        hasMore,
        total: Number.isFinite(Number(pagination?.total)) ? Number(pagination?.total) : undefined,
      },
      message: readString(record.message),
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    emitSportsDiagnostic('sports_browse_failed', {
      filter,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw friendlySportsError(error)
  }
}

export async function fetchSportsFixtureDetail(
  id: string,
  signal?: AbortSignal,
): Promise<SportsFixtureDetailResult> {
  const cleanId = String(id || '').trim()
  if (!cleanId) {
    return { success: false, enabled: true, fixture: null, message: 'Fixture not found.' }
  }

  emitSportsDiagnostic('sports_fixture_opened', { fixtureId: cleanId })

  try {
    const { payload, status } = await sportsRequest(
      `/api/sports/fixtures/${encodeURIComponent(cleanId)}`,
      { signal },
    )
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    const record = asRecord(payload)
    if (!record) {
      throw friendlySportsError(new Error('invalid payload'), status)
    }

    if (record.enabled === false) {
      return {
        success: true,
        enabled: false,
        fixture: null,
        message: readString(record.message) || 'Sports is not available right now.',
      }
    }

    if (status === 404) {
      return {
        success: false,
        enabled: true,
        fixture: null,
        message: 'This event was not found.',
      }
    }

    if (status < 200 || status >= 300) {
      throw friendlySportsError(new Error(readString(record.error) || 'failed'), status)
    }

    const fixture = normalizeSportsMatchCard(record.fixture ?? record.item ?? record)
    return {
      success: record.success !== false,
      enabled: true,
      fixture,
      message: fixture ? null : readString(record.message) || 'This event was not found.',
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw friendlySportsError(error)
  }
}

function normalizeUnavailableReason(value: unknown): SportsUnavailableReason {
  const code = String(value || '').trim().toLowerCase()
  switch (code) {
    case 'expired':
    case 'geo_blocked':
    case 'provider_disabled':
    case 'not_started':
    case 'finished':
    case 'validation_failed':
    case 'no_broadcast':
      return code
    default:
      return 'validation_failed'
  }
}

function normalizePlaySession(raw: unknown, fallbackFixtureId: string): SportsPlaySession | null {
  const record = asRecord(raw)
  if (!record) return null
  const fixtureId = readString(record.fixtureId) || fallbackFixtureId
  const status = String(record.status || '').trim().toLowerCase()

  if (status === 'ready') {
    const playbackKindRaw = String(record.playbackKind || '').trim().toLowerCase()
    const playbackKind =
      playbackKindRaw === 'hls'
        || playbackKindRaw === 'dash'
        || playbackKindRaw === 'direct'
        || playbackKindRaw === 'embed'
        || playbackKindRaw === 'webview'
        || playbackKindRaw === 'iframe'
        ? playbackKindRaw
        : 'embed'
    return {
      status: 'ready',
      fixtureId,
      playbackKind,
      playbackToken: readString(record.playbackToken) || '',
      expiresAt: readString(record.expiresAt) || new Date().toISOString(),
      title: readString(record.title) || 'Match',
      providerLabel: readString(record.providerLabel),
      embedUrl: readString(record.embedUrl),
      manifestUrl: readString(record.manifestUrl),
      streamUrl: readString(record.streamUrl) || readString(record.stream_url),
      mediaUrl: readString(record.mediaUrl) || readString(record.media_url),
    }
  }

  if (status === 'external') {
    return {
      status: 'external',
      fixtureId,
      officialUrl: readString(record.officialUrl) || '',
      providerLabel: readString(record.providerLabel) || 'Official provider',
    }
  }

  if (status === 'subscription_required') {
    return {
      status: 'subscription_required',
      fixtureId,
      providerLabel: readString(record.providerLabel) || 'Official broadcaster',
      officialUrl: readString(record.officialUrl) || undefined,
    }
  }

  if (status === 'unavailable') {
    return {
      status: 'unavailable',
      fixtureId,
      reason: normalizeUnavailableReason(record.reason),
      message: readString(record.message) || undefined,
    }
  }

  return null
}

/**
 * POST play — parse session even on 409 (finished / not started).
 */
export async function resolveSportsPlay(
  fixtureId: string,
  signal?: AbortSignal,
): Promise<SportsPlaySession> {
  const cleanId = String(fixtureId || '').trim()
  if (!cleanId) {
    return {
      status: 'unavailable',
      fixtureId: '',
      reason: 'validation_failed',
      message: 'This event is not currently available to play.',
    }
  }

  emitSportsDiagnostic('sports_play_resolution_started', { fixtureId: cleanId })

  try {
    const { payload, status } = await sportsRequest(
      `/api/sports/fixtures/${encodeURIComponent(cleanId)}/play`,
      {
        method: 'POST',
        body: {
          platform: 'desktop',
          country: 'ZZ',
        },
        signal,
      },
    )

    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    const record = asRecord(payload)
    const session = normalizePlaySession(record?.session, cleanId)
    if (session) {
      emitSportsDiagnostic('sports_play_resolution_succeeded', {
        fixtureId: cleanId,
        status: session.status,
        httpStatus: status,
      })
      return session
    }

    emitSportsDiagnostic('sports_play_resolution_failed', {
      fixtureId: cleanId,
      httpStatus: status,
    })
    return {
      status: 'unavailable',
      fixtureId: cleanId,
      reason: status === 403 ? 'geo_blocked' : 'validation_failed',
      message: readString(record?.error) || 'This event is not currently available to play.',
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    emitSportsDiagnostic('sports_play_resolution_failed', {
      fixtureId: cleanId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return {
      status: 'unavailable',
      fixtureId: cleanId,
      reason: 'validation_failed',
      message: 'This event is not currently available to play.',
    }
  }
}

/** GET short-lived playback session (hydrate token → media fields). */
export async function hydrateSportsPlaybackSession(
  token: string,
  signal?: AbortSignal,
): Promise<{
  embedUrl: string | null
  manifestUrl: string | null
  streamUrl: string | null
  mediaUrl: string | null
  playbackKind: string | null
  title: string | null
  providerLabel: string | null
  expiresAt: string | null
} | null> {
  const clean = String(token || '').trim()
  if (!clean || clean.startsWith('dev-') || clean.startsWith('legacy-')) return null

  try {
    const { payload, status } = await sportsRequest(
      `/api/sports/playback-sessions/${encodeURIComponent(clean)}`,
      { signal },
    )
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    if (status < 200 || status >= 300) return null
    const record = asRecord(payload)
    if (!record) return null
    return {
      embedUrl: readString(record.embedUrl),
      manifestUrl: readString(record.manifestUrl),
      streamUrl: readString(record.streamUrl) || readString(record.stream_url),
      mediaUrl: readString(record.mediaUrl) || readString(record.media_url),
      playbackKind: readString(record.playbackKind),
      title: readString(record.title),
      providerLabel: readString(record.providerLabel),
      expiresAt: readString(record.expiresAt),
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    return null
  }
}

/**
 * Bounded Sports search — fixture group only.
 */
export async function searchSportsFixtures(
  q: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<SportsSearchFixtureResult> {
  const query = String(q || '').trim()
  const limit = clampLimit(options?.limit ?? 12)

  if (query.length < 2) {
    return { success: true, enabled: true, query, fixtures: [], hasMore: false }
  }

  const params = buildQuery({ q: query, page: 1, limit })

  try {
    const { payload, status } = await sportsRequest(`/api/sports/search?${params.toString()}`, {
      signal: options?.signal,
    })
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError')
    }

    const record = asRecord(payload)
    if (!record) {
      throw friendlySportsError(new Error('invalid payload'), status)
    }

    if (record.enabled === false) {
      return {
        success: true,
        enabled: false,
        query,
        fixtures: [],
        hasMore: false,
        message: readString(record.message) || 'Sports is not available right now.',
      }
    }

    if (status < 200 || status >= 300) {
      throw friendlySportsError(new Error(readString(record.error) || 'failed'), status)
    }

    const groups = Array.isArray(record.groups) ? record.groups : []
    const fixtureGroup = groups.find((group) => {
      const entry = asRecord(group)
      if (!entry) return false
      const type = String(entry.type || '').toLowerCase()
      const title = String(entry.title || '').toLowerCase()
      return type === 'fixtures' || type === 'fixture' || type === 'matches' || title.includes('fixture') || title.includes('match')
    })

    const groupRecord = asRecord(fixtureGroup)
    const fixtures = normalizeFixturesList(groupRecord?.items).slice(0, limit)
    const pagination = asRecord(record.pagination)

    return {
      success: record.success !== false,
      enabled: true,
      query,
      fixtures,
      hasMore: Boolean(pagination?.hasMore),
      message: readString(record.message),
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    throw friendlySportsError(error)
  }
}
