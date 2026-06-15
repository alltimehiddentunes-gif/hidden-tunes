/**
 * Premium player lyrics foundation — display types only.
 * Catalog/API integration can populate these fields when lyrics become available.
 */

export type PlayerLyricsSource =
  | 'catalog'
  | 'lrclib'
  | 'musixmatch'
  | 'manual'
  | string

export type SyncedLyricLine = {
  text: string
  timestampMs: number
}

export type PlayerLyricsAvailability =
  | 'synced'
  | 'plain'
  | 'unavailable'
  | 'loading'

export type PlayerLyricsTrackInput = {
  id: string
  title: string
  artist: string
  album?: string | null
  /** Plain-text lyrics body */
  lyrics?: string | null
  /** Timestamped lyric lines */
  syncedLyrics?: SyncedLyricLine[] | null
  /** Pre-split plain lines when provided separately from `lyrics` */
  lyricLines?: string[] | null
  lyricsSource?: PlayerLyricsSource | null
}

export type PlayerLyricsViewState = {
  availability: PlayerLyricsAvailability
  hasLyrics: boolean
  hasSyncedLyrics: boolean
  isLoading: boolean
  plainLines: string[]
  syncedLines: SyncedLyricLine[]
  source: PlayerLyricsSource | null
  sourceLabel: string | null
  emptyTitle: string
  emptyDetail: string
  credit: string | null
  trackTitle: string | null
  trackArtist: string | null
}

export type PlayerLyricsResolveOptions = {
  isLoading?: boolean
}
