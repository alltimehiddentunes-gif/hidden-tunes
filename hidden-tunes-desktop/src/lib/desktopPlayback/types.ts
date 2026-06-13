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

export type QueueSeedType =
  | 'artist'
  | 'album'
  | 'mood'
  | 'discover'
  | 'home'
  | 'manual'

export type QueueCandidatePools = {
  songsByGenre?: Map<string, ApiSong[]>
  songsByArtistId?: Map<string, ApiSong[]>
  songsByAlbumName?: Map<string, ApiSong[]>
}

export type QueueSeedMetadata = {
  seedType?: QueueSeedType
  seedId?: string
  seedTracks?: ApiSong[]
  candidatePools?: QueueCandidatePools
}

export type DesktopPlaybackState = {
  currentTrack: ApiSong | null
  currentQueue: ApiSong[]
  currentIndex: number
  queueContext: QueueContext
  queueSeedType: QueueSeedType
  queueSeedId?: string
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
    seedMetadata?: QueueSeedMetadata,
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
