import type { ApiSong } from './api'
import type { QueueContext } from './desktopPlayback/types'
import {
  resolvePlayerArtist,
  resolvePlayerTitle,
  resolvePlayerTrackArtwork,
} from './playerDisplayMetadata'

export const QUEUE_CONTEXT_LABELS: Record<QueueContext, string> = {
  home: 'Home Queue',
  discover: 'Discover Queue',
  album: 'Album Queue',
  artist: 'Artist Queue',
  mood: 'Mood Queue',
  manual: 'Manual Queue',
  radio: 'Radio Queue',
  scene: 'Scene Queue',
  smart: 'Smart Queue',
}

export const PLAYER_QUEUE_EMPTY_TITLE = 'Nothing queued next'
export const PLAYER_QUEUE_EMPTY_DETAIL =
  'Upcoming tracks from your current queue will appear here.'

export const PLAYER_QUEUE_PANEL_EMPTY_TITLE = 'Queue is empty'
export const PLAYER_QUEUE_PANEL_EMPTY_DETAIL =
  'Play a song to populate your queue.'

export type PlayerUpNextRow = {
  key: string
  track: ApiSong
  title: string
  artist: string
  artwork: string | null
  duration: string
  queueIndex: number
  isNext: boolean
}

export type PlayerQueueRowStatus = 'played' | 'current' | 'upcoming'

export type PlayerQueueRow = {
  key: string
  track: ApiSong
  title: string
  artist: string
  artwork: string | null
  duration: string
  queueIndex: number
  isCurrent: boolean
  isPrevious: boolean
  isNext: boolean
  status: PlayerQueueRowStatus
}

export type PlayerQueueStats = {
  songCount: number
  durationLabel: string
  remainingCount: number
  remainingDurationLabel: string
}

function formatSongDurationLabel(
  song: { durationSeconds: number | null } | null | undefined,
) {
  if (!song?.durationSeconds || song.durationSeconds <= 0) return '—'
  const total = Math.floor(song.durationSeconds)
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function formatDurationCollectionLabel(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return '—'
  const total = Math.floor(totalSeconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function sumDurationSeconds(songs: ApiSong[]) {
  return songs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)
}

export function buildPlayerUpNextRows(
  upcomingTracks: ApiSong[],
  currentIndex: number,
  maxRows = 5,
): PlayerUpNextRow[] {
  return upcomingTracks.slice(0, maxRows).map((track, offset) => ({
    key: `${track.id}-${currentIndex + 1 + offset}`,
    track,
    title: resolvePlayerTitle(track),
    artist: resolvePlayerArtist(track),
    artwork: resolvePlayerTrackArtwork(track),
    duration: formatSongDurationLabel(track),
    queueIndex: currentIndex + 1 + offset,
    isNext: offset === 0,
  }))
}

export function buildPlayerQueueRows(
  currentQueue: ApiSong[],
  currentIndex: number,
): PlayerQueueRow[] {
  if (currentQueue.length === 0 || currentIndex < 0) return []

  return currentQueue.map((track, queueIndex) => {
    const isCurrent = queueIndex === currentIndex
    const isPrevious = queueIndex === currentIndex - 1
    const isNext = queueIndex === currentIndex + 1
    const status: PlayerQueueRowStatus =
      queueIndex < currentIndex
        ? 'played'
        : isCurrent
          ? 'current'
          : 'upcoming'

    return {
      key: `${track.id}-${queueIndex}`,
      track,
      title: resolvePlayerTitle(track),
      artist: resolvePlayerArtist(track),
      artwork: resolvePlayerTrackArtwork(track),
      duration: formatSongDurationLabel(track),
      queueIndex,
      isCurrent,
      isPrevious,
      isNext,
      status,
    }
  })
}

export function buildPlayerQueueStats(
  currentQueue: ApiSong[],
  currentIndex: number,
): PlayerQueueStats {
  const songCount = currentQueue.length
  const durationLabel = formatDurationCollectionLabel(sumDurationSeconds(currentQueue))
  const remainingTracks =
    currentIndex >= 0 ? currentQueue.slice(currentIndex + 1) : []
  const remainingCount = remainingTracks.length
  const remainingDurationLabel = formatDurationCollectionLabel(
    sumDurationSeconds(remainingTracks),
  )

  return {
    songCount,
    durationLabel,
    remainingCount,
    remainingDurationLabel,
  }
}
