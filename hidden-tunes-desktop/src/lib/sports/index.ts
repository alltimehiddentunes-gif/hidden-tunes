export type {
  DesktopSportsFixture,
  ResolvedSportsPlayableStream,
  SportsBrowseFilter,
  SportsFixtureDetailResult,
  SportsFixtureStatus,
  SportsFixturesPage,
  SportsPlaybackDispatchResult,
  SportsPlaySession,
  SportsPlaySessionStatus,
  SportsSearchFixtureResult,
} from './types'
export {
  SPORTS_LIVE_REFRESH_MS,
  SPORTS_PAGE_SIZE,
  SPORTS_REQUEST_TIMEOUT_MS,
} from './types'

export {
  extractSportsFixtureIdFromIdentity,
  extractSportsFixtureIdFromSongId,
  isSportsFixtureIdentity,
  isSportsSongId,
  SPORTS_IDENTITY_PREFIX,
  SPORTS_SONG_ID_PREFIX,
  sportsFixtureIdentity,
  sportsFixtureSongId,
} from './identity'

export {
  formatSportsScore,
  normalizeSportsFixtureStatus,
  participantsToTeams,
} from './status'
export type { NormalizeSportsStatusInput, NormalizeSportsStatusResult } from './status'

export {
  formatSportsDateOnly,
  formatSportsStartTime,
  parseSportsInstant,
} from './formatTime'

export { emitSportsDiagnostic } from './diagnostics'
export type { SportsDiagnosticEvent } from './diagnostics'

export {
  fetchSportsFixtureDetail,
  fetchSportsFixtures,
  hydrateSportsPlaybackSession,
  normalizeSportsMatchCard,
  resolveSportsPlay,
  searchSportsFixtures,
  SPORTS_CATALOG_BASE_URL,
} from './sportsCatalogApi'

export {
  extractSportsFixtureId,
  isSportsQueueSong,
  sportsFixtureToApiSong,
} from './sportsPlaybackAdapter'

export { resolvePlayableStream } from './resolvePlayableStream'
export type { ResolvePlayableStreamResult } from './resolvePlayableStream'

export { dispatchSportsPlayback } from './dispatchSportsPlayback'

export { useDesktopSports } from './useDesktopSports'
export type { UseDesktopSportsOptions } from './useDesktopSports'
