import type { ApiSong } from '../api'

export type DesktopPlaybackState = {
  currentTrack: ApiSong | null
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  positionSeconds: number
  durationSeconds: number
}

export type DesktopPlaybackActions = {
  playTrack: (song: ApiSong) => void
  pause: () => void
  resume: () => void
}

export type DesktopPlaybackContextValue = DesktopPlaybackState & DesktopPlaybackActions
