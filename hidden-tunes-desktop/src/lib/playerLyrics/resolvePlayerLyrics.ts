import type { ApiSong } from '../api'
import type {
  PlayerLyricsResolveOptions,
  PlayerLyricsTrackInput,
  PlayerLyricsViewState,
  SyncedLyricLine,
} from './types'

const UNAVAILABLE_TITLE = 'Lyrics unavailable.'
const UNAVAILABLE_DETAIL = ''

const LOADING_TITLE = 'Loading lyrics'
const LOADING_DETAIL = 'Checking for lyrics on this track…'

const NO_TRACK_TITLE = 'No track selected'
const NO_TRACK_DETAIL = 'Play a song to view lyrics for the current track.'

const SOURCE_LABELS: Record<string, string> = {
  catalog: 'Catalog lyrics',
  lrclib: 'LRCLIB',
  musixmatch: 'Musixmatch',
  manual: 'Editorial lyrics',
}

export function fromApiSong(track: ApiSong): PlayerLyricsTrackInput {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    lyrics: track.lyrics ?? null,
    syncedLyrics: track.syncedLyrics ?? null,
    lyricLines: track.lyricLines ?? null,
    lyricsSource: track.lyricsSource ?? null,
  }
}

export function parsePlainLyricLines(
  lyrics: string | null | undefined,
  lyricLines?: string[] | null,
): string[] {
  if (lyricLines && lyricLines.length > 0) {
    return lyricLines.map((line) => line.trim()).filter(Boolean)
  }
  if (!lyrics) return []
  return lyrics
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function normalizeSyncedLyricLines(
  lines: SyncedLyricLine[] | null | undefined,
): SyncedLyricLine[] {
  if (!lines || lines.length === 0) return []
  return lines
    .map((line) => ({
      text: line.text.trim(),
      timestampMs: Number.isFinite(line.timestampMs) ? Math.max(0, line.timestampMs) : 0,
    }))
    .filter((line) => line.text.length > 0)
    .sort((left, right) => left.timestampMs - right.timestampMs)
}

export function findActiveSyncedLineIndex(
  lines: SyncedLyricLine[],
  positionMs: number,
): number {
  if (lines.length === 0 || !Number.isFinite(positionMs) || positionMs < 0) return -1

  let activeIndex = -1
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].timestampMs <= positionMs) {
      activeIndex = index
      continue
    }
    break
  }
  return activeIndex
}

function resolveSourceLabel(source: PlayerLyricsTrackInput['lyricsSource']): string | null {
  if (!source) return null
  return SOURCE_LABELS[source] ?? String(source)
}

function buildUnavailableState(track: PlayerLyricsTrackInput | null): PlayerLyricsViewState {
  const artist = track?.artist ?? null
  return {
    availability: 'unavailable',
    hasLyrics: false,
    hasSyncedLyrics: false,
    isLoading: false,
    plainLines: [],
    syncedLines: [],
    source: track?.lyricsSource ?? null,
    sourceLabel: resolveSourceLabel(track?.lyricsSource ?? null),
    emptyTitle: track ? UNAVAILABLE_TITLE : NO_TRACK_TITLE,
    emptyDetail: track ? UNAVAILABLE_DETAIL : NO_TRACK_DETAIL,
    credit: null,
    trackTitle: track?.title ?? null,
    trackArtist: artist,
  }
}

function buildLoadingState(track: PlayerLyricsTrackInput | null): PlayerLyricsViewState {
  return {
    availability: 'loading',
    hasLyrics: false,
    hasSyncedLyrics: false,
    isLoading: true,
    plainLines: [],
    syncedLines: [],
    source: track?.lyricsSource ?? null,
    sourceLabel: resolveSourceLabel(track?.lyricsSource ?? null),
    emptyTitle: LOADING_TITLE,
    emptyDetail: LOADING_DETAIL,
    credit: null,
    trackTitle: track?.title ?? null,
    trackArtist: track?.artist ?? null,
  }
}

export function resolvePlayerLyrics(
  track: PlayerLyricsTrackInput | null,
  options: PlayerLyricsResolveOptions = {},
): PlayerLyricsViewState {
  if (options.isLoading) {
    return buildLoadingState(track)
  }

  if (!track) {
    return buildUnavailableState(null)
  }

  const syncedLines = normalizeSyncedLyricLines(track.syncedLyrics)
  if (syncedLines.length > 0) {
    return {
      availability: 'synced',
      hasLyrics: true,
      hasSyncedLyrics: true,
      isLoading: false,
      plainLines: [],
      syncedLines,
      source: track.lyricsSource ?? null,
      sourceLabel: resolveSourceLabel(track.lyricsSource ?? null),
      emptyTitle: UNAVAILABLE_TITLE,
      emptyDetail: UNAVAILABLE_DETAIL,
      credit: null,
      trackTitle: track.title,
      trackArtist: track.artist,
    }
  }

  const plainLines = parsePlainLyricLines(track.lyrics, track.lyricLines)
  if (plainLines.length > 0) {
    return {
      availability: 'plain',
      hasLyrics: true,
      hasSyncedLyrics: false,
      isLoading: false,
      plainLines,
      syncedLines: [],
      source: track.lyricsSource ?? null,
      sourceLabel: resolveSourceLabel(track.lyricsSource ?? null),
      emptyTitle: UNAVAILABLE_TITLE,
      emptyDetail: UNAVAILABLE_DETAIL,
      credit: null,
      trackTitle: track.title,
      trackArtist: track.artist,
    }
  }

  return buildUnavailableState(track)
}

export function syncedLineDisplayClass(index: number, activeIndex: number): string {
  if (activeIndex < 0) {
    return 'psd-lyrics-line psd-lyrics-line--next'
  }

  const offset = index - activeIndex
  if (offset === 0) return 'psd-lyrics-line psd-lyrics-line--active-white'
  if (offset === 1) return 'psd-lyrics-line psd-lyrics-line--active-purple'
  if (offset >= 2 && offset <= 4) return 'psd-lyrics-line psd-lyrics-line--next'
  if (offset >= 5 && offset <= 8) return 'psd-lyrics-line psd-lyrics-line--dimmed'
  return 'psd-lyrics-line psd-lyrics-line--distant'
}
