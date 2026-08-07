import type { ApiSong } from '../api'
import type { AudioQualityMode, AudiobookPlaybackRate } from '../localPreferences'

export type QueueContext =
  | 'home'
  | 'discover'
  | 'album'
  | 'artist'
  | 'mood'
  | 'genre'
  | 'emotional-world'
  | 'playlist'
  | 'search'
  | 'library'
  | 'favorites'
  | 'history'
  | 'downloads'
  | 'recommendation'
  | 'manual-queue'
  | 'manual'
  | 'radio'
  | 'podcast'
  | 'audiobook'
  | 'motivational'
  | 'lecture'
  | 'tv'
  | 'sports'
  | 'scene'
  | 'smart'

export type QueueSeedType =
  | 'artist'
  | 'album'
  | 'mood'
  | 'genre'
  | 'emotional-world'
  | 'playlist'
  | 'search'
  | 'library'
  | 'favorites'
  | 'history'
  | 'downloads'
  | 'recommendation'
  | 'discover'
  | 'home'
  | 'manual'

export type QueueCandidatePools = {
  songsByGenre?: Map<string, ApiSong[]>
  songsByArtistId?: Map<string, ApiSong[]>
  songsByAlbumName?: Map<string, ApiSong[]>
}

export type RepeatMode = 'off' | 'all' | 'one'

export type QueueSeedMetadata = {
  seedType?: QueueSeedType
  seedId?: string
  seedTracks?: ApiSong[]
  candidatePools?: QueueCandidatePools
  /**
   * Mobile parity (`isBoundedPlaybackContext`).
   * When true (default for section/album/artist/search), stop at queue end.
   * When false (full-catalog / hero-style plays), allow smart continuation append
   * into the same Queue at exhaustion.
   */
  bounded?: boolean
}

export type DesktopPlaybackProgressState = {
  positionSeconds: number
  durationSeconds: number
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
  volume: number
  audioQualityMode: AudioQualityMode
  autoNextEnabled: boolean
  shuffleEnabled: boolean
  repeatMode: RepeatMode
  audiobookPlaybackRate: AudiobookPlaybackRate
}

export type DesktopPlaybackActions = {
  startMediaSession: (input: {
    queue: ApiSong[]
    startIndex: number
    context: QueueContext
    queueTitle?: string
    seedMetadata?: QueueSeedMetadata
  }) => void
  playTrack: (song: ApiSong) => void
  playQueue: (
    queue: ApiSong[],
    startIndex: number,
    context: QueueContext,
    queueTitle?: string,
    seedMetadata?: QueueSeedMetadata,
  ) => void
  /** Activate existing queue identity or replace with a single-item play. */
  playNow: (song: ApiSong) => void
  /** Append without interrupting playback (typed identity de-duped). */
  enqueue: (song: ApiSong, opts?: { allowDuplicate?: boolean }) => { added: boolean; index: number }
  /** Insert after active item without interrupting. */
  playNext: (song: ApiSong, opts?: { allowDuplicate?: boolean }) => { added: boolean; index: number }
  removeQueueItem: (queueIndex: number) => void
  moveQueueItem: (fromIndex: number, toIndex: number) => void
  /** Stop playback and clear the entire queue. */
  clearQueue: () => void
  next: () => void
  previous: () => void
  getUpcomingTracks: () => ApiSong[]
  playQueueAtIndex: (index: number) => void
  clearUpcomingQueue: () => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  pause: () => void
  resume: () => void
  seekTo: (seconds: number) => void
  skipRelative: (deltaSeconds: number) => void
  setVolume: (volume: number) => void
  setAudioQualityMode: (mode: AudioQualityMode) => void
  setAutoNextEnabled: (enabled: boolean) => void
  setAudiobookPlaybackRate: (rate: AudiobookPlaybackRate) => void
  stopPlayback: () => void
  mountTvVideo: (container: HTMLElement | null) => void
}

export type DesktopPlaybackContextValue = DesktopPlaybackState & DesktopPlaybackActions
