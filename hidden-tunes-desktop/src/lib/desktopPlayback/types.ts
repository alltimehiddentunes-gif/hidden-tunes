import type { ApiSong } from '../api'

export type DesktopPlaybackState = {
  currentTrack: ApiSong | null
  isPlaying: boolean
  isLoading: boolean
  error: string | null
  positionSeconds: number
  durationSeconds: number
  volume: number
}

export type DesktopPlaybackActions = {
  playTrack: (song: ApiSong) => void
  pause: () => void
  resume: () => void
  seekTo: (seconds: number) => void
  setVolume: (volume: number) => void
}

export type DesktopPlaybackContextValue = DesktopPlaybackState & DesktopPlaybackActions
