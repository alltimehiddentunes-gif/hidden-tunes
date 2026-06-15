export type {
  PlayerLyricsAvailability,
  PlayerLyricsResolveOptions,
  PlayerLyricsSource,
  PlayerLyricsTrackInput,
  PlayerLyricsViewState,
  SyncedLyricLine,
} from './types'
export {
  findActiveSyncedLineIndex,
  fromApiSong,
  normalizeSyncedLyricLines,
  parsePlainLyricLines,
  resolvePlayerLyrics,
  syncedLineDisplayClass,
} from './resolvePlayerLyrics'
export { usePlayerLyrics, type UsePlayerLyricsResult } from './usePlayerLyrics'
