/** Desktop Sports fixture / playback contracts — stream_only, no Downloads. */

export type SportsFixtureStatus =
  | 'live'
  | 'upcoming'
  | 'completed'
  | 'postponed'
  | 'cancelled'
  | 'unknown'

export type DesktopSportsFixture = {
  id: string
  sport: string | null
  sportSlug: string | null
  league: string | null
  homeTeam: string | null
  awayTeam: string | null
  title: string | null
  status: SportsFixtureStatus
  backendStatusCode: string | null
  startTime: string | null
  endTime: string | null
  /** Never invent 0-0 when scores are missing. */
  score: string | null
  country: string | null
  venue: string | null
  /** Browse hint only — play resolver is authoritative. */
  isPlayable: boolean
  provider: string | null
  artwork: string | null
  availabilityState: string | null
  metadata: Record<string, unknown> | null
}

export type SportsBrowseFilter = 'live' | 'upcoming' | 'completed' | 'all'

export type SportsPlaySessionStatus =
  | 'ready'
  | 'external'
  | 'subscription_required'
  | 'unavailable'

export type SportsPlaybackKind = 'hls' | 'dash' | 'direct' | 'embed' | 'webview' | 'iframe'

export type SportsUnavailableReason =
  | 'expired'
  | 'geo_blocked'
  | 'provider_disabled'
  | 'not_started'
  | 'finished'
  | 'validation_failed'
  | 'no_broadcast'

/** Provider-neutral play session — HLS/DASH/direct only for in-app video. */
export type SportsPlaySession =
  | {
      status: 'ready'
      fixtureId: string
      playbackKind: SportsPlaybackKind
      playbackToken: string
      expiresAt: string
      title: string
      providerLabel?: string | null
      embedUrl?: string | null
      manifestUrl?: string | null
      streamUrl?: string | null
      mediaUrl?: string | null
    }
  | {
      status: 'external'
      fixtureId: string
      officialUrl: string
      providerLabel: string
    }
  | {
      status: 'subscription_required'
      fixtureId: string
      providerLabel: string
      officialUrl?: string
    }
  | {
      status: 'unavailable'
      fixtureId: string
      reason: SportsUnavailableReason
      message?: string
    }

export type ResolvedSportsPlayableStream = {
  streamUrl: string
  protocol: 'hls' | 'dash' | 'direct'
  title: string
  providerLabel: string | null
  expiresAt: string | null
  hostname: string | null
}

export type SportsFixturesPage = {
  success: boolean
  enabled: boolean
  fixtures: DesktopSportsFixture[]
  pagination: {
    page: number
    limit: number
    hasMore: boolean
    total?: number
  }
  message?: string | null
}

export type SportsFixtureDetailResult = {
  success: boolean
  enabled: boolean
  fixture: DesktopSportsFixture | null
  message?: string | null
}

export type SportsSearchFixtureResult = {
  success: boolean
  enabled: boolean
  query: string
  fixtures: DesktopSportsFixture[]
  hasMore: boolean
  message?: string | null
}

export type SportsPlaybackDispatchResult =
  | { status: 'success'; fixtureId: string }
  | { status: 'unavailable'; fixtureId: string; userMessage: string }
  | { status: 'unsupported'; fixtureId: string; userMessage: string }
  | { status: 'cancelled'; fixtureId: string }
  | { status: 'error'; fixtureId: string; userMessage: string }

export const SPORTS_PAGE_SIZE = 24
export const SPORTS_LIVE_REFRESH_MS = 45_000
export const SPORTS_REQUEST_TIMEOUT_MS = 20_000
