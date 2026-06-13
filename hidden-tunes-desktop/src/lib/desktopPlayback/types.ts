import type { ApiSong } from '../api'

export type QueueContext =
  | 'home'
  | 'discover'
  | 'album'
  | 'artist'
  | 'mood'
  | 'manual'
  | 'radio'
  | 'scene'
  | 'smart'

export type DesktopPlaybackState = {
  currentTrack: ApiSong | null
  currentQueue: ApiSong[]
  currentIndex: number
  queueContext: QueueContext
  queueTitle?: string
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  positionSeconds: number
  durationSeconds: number
  volume: number
}

export type DesktopPlaybackActions = {
  playTrack: (song: ApiSong) => void
  playQueue: (
    queue: ApiSong[],
    startIndex: number,
    context: QueueContext,
    queueTitle?: string,
  ) => void
  next: () => void
  previous: () => void
  getUpcomingTracks: () => ApiSong[]
  pause: () => void
  resume: () => void
  seekTo: (seconds: number) => void
  setVolume: (volume: number) => void
}

export type DesktopPlaybackContextValue = DesktopPlaybackState & DesktopPlaybackActions
