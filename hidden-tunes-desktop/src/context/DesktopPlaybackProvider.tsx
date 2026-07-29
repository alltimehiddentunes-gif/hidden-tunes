import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ApiSong } from '../lib/api'
import {
  DESKTOP_PREFERENCE_KEYS,
  parseStoredAudioQualityMode,
  parseStoredAudiobookPlaybackRate,
  usePersistedPreference,
  type AudioQualityMode,
  type AudiobookPlaybackRate,
} from '../lib/localPreferences'
import {
  audioVersionAvailability,
  resolveUpgradeTargetForQualityMode,
  selectPlayableUrlForQualityMode,
  type InstantPlayableSelection,
} from '../lib/audioVersions'
import { logAudioVersionSelection, logQueueExtension } from '../lib/catalogDiagnostics'
import {
  buildUpgradeDiagnosticsContext,
  logAudioUpgrade,
} from '../lib/desktopPlayback/audioUpgradeDiagnostics'
import { isPlayableMediaUrl } from '../lib/desktopPlayback/isPlayableMediaUrl'
import { HtmlAudioPlaybackService } from '../lib/desktopPlayback/HtmlAudioPlaybackService'
import { buildRelatedQueue } from '../lib/desktopPlayback/queueIntelligence'
import {
  AUTO_NEXT_INVALID_SKIP_LIMIT,
  ENDED_ADVANCE_DEBOUNCE_MS,
  isMusicItemMissingPlayableUrl,
} from '../lib/desktopPlayback/smartContinuation'
import { resolveRadioPlayUrl } from '../lib/radio/radioCatalogApi'
import {
  extractRadioStationId,
  isRadioQueueSong,
} from '../lib/radio/radioPlaybackAdapter'
import { resolvePodcastPlayUrl } from '../lib/podcasts/podcastCatalogApi'
import {
  consumePendingPodcastResumeSeconds,
} from '../lib/podcasts/podcastPlaybackSession'
import {
  extractPodcastEpisodeId,
  isPodcastQueueSong,
  patchPodcastEpisodeWithPlayUrl,
} from '../lib/podcasts/podcastPlaybackAdapter'
import {
  buildPodcastProgressEntryFromSong,
  isPodcastEpisodeCompleted,
  PODCAST_PROGRESS_THROTTLE_MS,
  PODCAST_MIN_CONTINUE_SECONDS,
  progressEntryToHistoryEntry,
  recordPodcastHistory,
  removePodcastProgress,
  upsertPodcastProgress,
} from '../lib/podcasts/podcastProgressStorage'
import { resolveAudiobookChapterPlay } from '../lib/audiobooks/audiobookCatalogApi'
import { consumePendingAudiobookResumeSeconds } from '../lib/audiobooks/audiobookPlaybackSession'
import {
  isAudiobookQueueSong,
  parseAudiobookSongId,
  patchAudiobookChapterWithPlayUrl,
  patchAudiobookQueueWithResolvedChapters,
} from '../lib/audiobooks/audiobookPlaybackAdapter'
import { isMusicCatalogSong } from '../lib/home/isMusicCatalogSong'
import { isMatureLibraryAccessEnabled } from '../lib/library/matureFilter'
import {
  buildMusicProgressEntryFromSong,
  isMusicTrackCompleted,
  MUSIC_MIN_CONTINUE_SECONDS,
  MUSIC_PROGRESS_THROTTLE_MS,
  progressEntryToHistoryEntry as musicProgressEntryToHistoryEntry,
  recordMusicHistory,
  removeMusicProgress,
  upsertMusicProgress,
} from '../lib/home/musicProgressStorage'
import { consumePendingMusicResumeSeconds } from '../lib/music/musicPlaybackSession'
import {
  bindMediaSessionActions,
  updateMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
} from '../lib/desktopPlayback/bindMediaSession'
import { resolveTvPlayUrl } from '../lib/tv/tvCatalogApi'
import { acquireTvVideoPlaybackService } from '../lib/tv/tvVideoPlayback'
import type { HtmlVideoPlaybackService } from '../lib/tv/HtmlVideoPlaybackService'
import { TV_CHANNEL_FAIL_SKIP_LIMIT } from '../lib/tv/tvChannelTransport'
import {
  extractTvChannelId,
  isTvQueueSong,
} from '../lib/tv/tvPlaybackAdapter'
import { isSportsQueueSong, extractSportsFixtureId } from '../lib/sports/sportsPlaybackAdapter'
import { recordTvHistory } from '../lib/tv/tvLocalState'
import { mirrorRadioHistoryEntry, mirrorSportsHistoryEntry } from '../lib/history/mirrorFamilyHistory'
import {
  QUEUE_PREVIOUS_RESTART_SECONDS,
  clearPersistedQueue,
  emitQueueDiagnostic,
  enqueueSong,
  findSongIndexById,
  insertPlayNext,
  isPersistableQueueSong,
  moveIndex,
  persistQueueSnapshot,
  removeAtIndex,
  resolvePlaybackCapabilities,
  restoreQueueSongs,
} from '../lib/queue'
import {
  AUDIOBOOK_PROGRESS_THROTTLE_MS,
  AUDIOBOOK_MIN_CONTINUE_SECONDS,
  buildAudiobookProgressEntryFromSong,
  isAudiobookChapterCompleted,
  progressEntryToHistoryEntry as audiobookProgressEntryToHistoryEntry,
  recordAudiobookHistory,
  removeAudiobookProgress,
  upsertAudiobookProgress,
} from '../lib/audiobooks/audiobookProgressStorage'
import { resolveMotivationalPlay } from '../lib/motivationals/motivationalCatalogApi'
import { consumePendingMotivationalResumeSeconds } from '../lib/motivationals/motivationalPlaybackSession'
import {
  isMotivationalQueueSong,
  isMotivationalVideoSong,
  parseMotivationalSongId,
  patchMotivationalSessionWithPlayUrl,
} from '../lib/motivationals/motivationalPlaybackAdapter'
import {
  MOTIVATIONAL_PROGRESS_THROTTLE_MS,
  MOTIVATIONAL_MIN_CONTINUE_SECONDS,
  buildMotivationalProgressEntryFromSong,
  isMotivationalSessionCompleted,
  progressEntryToHistoryEntry as motivationalProgressEntryToHistoryEntry,
  recordMotivationalHistory,
  removeMotivationalProgress,
  upsertMotivationalProgress,
} from '../lib/motivationals/motivationalProgressStorage'
import { resolveLecturePlay, searchLectureContinuation, fetchAllLectureSeriesSessions } from '../lib/lectures/lectureCatalogApi'
import { consumePendingLectureResumeSeconds } from '../lib/lectures/lecturePlaybackSession'
import {
  isLectureQueueSong,
  isLectureVideoSong,
  parseLectureSongId,
  patchLectureSessionWithPlayUrl,
  buildLectureQueueSongs,
} from '../lib/lectures/lecturePlaybackAdapter'
import {
  LECTURE_PROGRESS_THROTTLE_MS,
  LECTURE_MIN_CONTINUE_SECONDS,
  buildLectureProgressEntryFromSong,
  isLectureSessionCompleted,
  progressEntryToHistoryEntry as lectureProgressEntryToHistoryEntry,
  recordLectureHistory,
  removeLectureProgress,
  upsertLectureProgress,
} from '../lib/lectures/lectureProgressStorage'
import type {
  DesktopPlaybackContextValue,
  DesktopPlaybackProgressState,
  QueueCandidatePools,
  QueueContext,
  QueueSeedMetadata,
  QueueSeedType,
} from '../lib/desktopPlayback/types'

const DesktopPlaybackContext = createContext<DesktopPlaybackContextValue | null>(null)
const DesktopPlaybackProgressContext = createContext<DesktopPlaybackProgressState | null>(null)

const POSITION_UI_THROTTLE_MS = 500

const DEFAULT_QUEUE_CONTEXT: QueueContext = 'manual'
const DEFAULT_QUEUE_SEED_TYPE: QueueSeedType = 'manual'
const UPGRADE_MIN_PLAYED_SECONDS = 4
const UPGRADE_STABLE_WINDOW_MS = 2500

type UpgradeSession = {
  sessionId: number
  trackId: string
  song: ApiSong
  selection: InstantPlayableSelection
  upgradeUrl: string
  upgradeTier: InstantPlayableSelection['tier']
  attempted: boolean
  cancelled: boolean
  startedAtMs: number
  lastUnstableAtMs: number
}

function shuffleSongs(queue: ApiSong[]) {
  const array = [...queue]
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const swap = array[i]
    array[i] = array[j]
    array[j] = swap
  }
  return array
}

function shuffleQueueFromIndex(queue: ApiSong[], startIndex: number) {
  if (queue.length <= 1 || startIndex < 0 || startIndex >= queue.length) return queue
  const current = queue[startIndex]
  const others = queue.filter((_, index) => index !== startIndex)
  return [current, ...shuffleSongs(others)]
}

function contextToSeedType(context: QueueContext): QueueSeedType {
  if (
    context === 'home' ||
    context === 'discover' ||
    context === 'album' ||
    context === 'artist' ||
    context === 'mood'
  ) {
    return context
  }

  return 'manual'
}

function playbackErrorMessage(song: ApiSong | null) {
  if (isRadioQueueSong(song)) {
    return 'This station stream is unavailable right now.'
  }
  if (isTvQueueSong(song)) {
    return 'This TV channel is unavailable right now.'
  }
  if (isSportsQueueSong(song)) {
    return 'This event is not currently available to play.'
  }
  if (isPodcastQueueSong(song)) {
    return 'This podcast episode is unavailable right now.'
  }
  if (isAudiobookQueueSong(song)) {
    return 'This audiobook chapter is unavailable right now.'
  }
  if (isMotivationalQueueSong(song)) {
    return 'This item is currently unavailable.'
  }
  if (isLectureQueueSong(song)) {
    return 'This lecture session is currently unavailable.'
  }
  return 'Unable to play this track.'
}

const MATURE_CONTENT_RESTRICTED_MESSAGE = 'This item is restricted by your content settings.'
/** Bound how many queue slots we may skip for mature gating (no infinite loops). */
const MATURE_SKIP_WALK_LIMIT = 64

function isQueueSongBlockedByMature(song: ApiSong): boolean {
  if (isMatureLibraryAccessEnabled()) return false
  return Boolean(
    song.tags?.some((t) => /mature|adult|explicit/i.test(t))
    || /adult|mature|explicit/i.test(song.genre || '')
    || (isRadioQueueSong(song) && /sex sound/i.test(song.title || '')),
  )
}

/**
 * Walk forward from `fromIndex` (inclusive) looking for a non-mature-blocked song.
 * Returns -1 when none found within the remaining queue / walk bound.
 */
function findNextUnblockedQueueIndex(queue: ApiSong[], fromIndex: number): number {
  if (fromIndex < 0 || fromIndex >= queue.length) return -1
  const end = Math.min(queue.length, fromIndex + MATURE_SKIP_WALK_LIMIT)
  for (let i = fromIndex; i < end; i++) {
    const song = queue[i]
    if (song && !isQueueSongBlockedByMature(song)) return i
  }
  return -1
}

/**
 * Auto-next walker: skip mature + music items missing a playable URL, bounded.
 * Does not invent infinite skip loops. Non-music families keep URL resolution async.
 */
function findNextAutoAdvanceIndex(queue: ApiSong[], fromIndex: number): number {
  if (fromIndex < 0 || fromIndex >= queue.length) return -1
  let skipped = 0
  for (let i = fromIndex; i < queue.length; i++) {
    if (skipped > AUTO_NEXT_INVALID_SKIP_LIMIT) return -1
    const song = queue[i]
    if (!song || isQueueSongBlockedByMature(song)) {
      skipped += 1
      continue
    }
    if (isMusicCatalogSong(song) && isMusicItemMissingPlayableUrl(song)) {
      skipped += 1
      continue
    }
    return i
  }
  return -1
}

/** TV, Sports, lecture video, and motivational video share the single video element path. */
function usesDesktopVideoPath(song: ApiSong | null | undefined) {
  return isTvQueueSong(song) || isSportsQueueSong(song) || isLectureVideoSong(song) || isMotivationalVideoSong(song)
}

/* Context hooks are intentionally co-located with the provider. */
/* eslint-disable react-refresh/only-export-components -- hooks + provider share this module */
export function useDesktopPlayback() {
  const value = useContext(DesktopPlaybackContext)
  if (!value) {
    throw new Error('useDesktopPlayback must be used within DesktopPlaybackProvider')
  }
  return value
}

export function useDesktopPlaybackProgress() {
  const value = useContext(DesktopPlaybackProgressContext)
  if (!value) {
    throw new Error('useDesktopPlaybackProgress must be used within DesktopPlaybackProvider')
  }
  return value
}
/* eslint-enable react-refresh/only-export-components */

export function DesktopPlaybackProvider({ children }: { children: ReactNode }) {
  const serviceRef = useRef<HtmlAudioPlaybackService | null>(null)
  const videoServiceRef = useRef<HtmlVideoPlaybackService | null>(null)
  const activeMediaRef = useRef<'audio' | 'video'>('audio')
  const queueRef = useRef<ApiSong[]>([])
  const queueIndexRef = useRef(-1)
  const queueSeedTypeRef = useRef<QueueSeedType>(DEFAULT_QUEUE_SEED_TYPE)
  const queueSeedIdRef = useRef<string | undefined>(undefined)
  const queueSeedTracksRef = useRef<ApiSong[]>([])
  const queueCandidatePoolsRef = useRef<QueueCandidatePools | undefined>(undefined)
  /** Mobile parity: bounded contexts stop at end; only unbounded may smart-append. */
  const queueSeedBoundedRef = useRef(true)
  /**
   * Index where smart-continuation items begin in the live queue, or -1.
   * Manual enqueue must insert before this region so user choices outrank smart tracks.
   */
  const smartContinuationStartRef = useRef(-1)
  const queueContextRef = useRef<QueueContext>(DEFAULT_QUEUE_CONTEXT)
  const autoAdvanceInFlightRef = useRef(false)
  const lastEndedAdvanceRef = useRef<{ songId: string; at: number }>({ songId: '', at: 0 })
  const playSongRef = useRef<(song: ApiSong) => void>(() => undefined)
  const flushPodcastProgressRef = useRef<(force?: boolean) => void>(() => undefined)
  const flushAudiobookProgressRef = useRef<(force?: boolean) => void>(() => undefined)
  const flushMotivationalProgressRef = useRef<(force?: boolean) => void>(() => undefined)
  const flushLectureProgressRef = useRef<(force?: boolean) => void>(() => undefined)
  const flushMusicProgressRef = useRef<(force?: boolean) => void>(() => undefined)
  const currentTrackRef = useRef<ApiSong | null>(null)
  const audioQualityModeRef = useRef<AudioQualityMode>('auto')
  const upgradeSessionRef = useRef<UpgradeSession | null>(null)
  const upgradeSessionIdRef = useRef(0)
  const unshuffledQueueRef = useRef<ApiSong[]>([])
  const shuffleEnabledRef = useRef(false)
  const repeatModeRef = useRef<'off' | 'all' | 'one'>('off')
  const mediaResolveGenerationRef = useRef(0)
  const tvChannelSwitchInFlightRef = useRef(false)
  const tvFailSkipCountRef = useRef(0)
  const tvAutoAdvanceOnFailRef = useRef<'forward' | 'backward' | null>(null)
  const podcastProgressTrackIdRef = useRef<string | null>(null)
  const podcastProgressLastWriteRef = useRef(0)
  const podcastProgressLastPositionRef = useRef(0)
  const audiobookProgressTrackIdRef = useRef<string | null>(null)
  const audiobookProgressLastWriteRef = useRef(0)
  const audiobookProgressLastPositionRef = useRef(0)
  const motivationalProgressTrackIdRef = useRef<string | null>(null)
  const motivationalProgressLastWriteRef = useRef(0)
  const motivationalProgressLastPositionRef = useRef(0)
  const lectureProgressTrackIdRef = useRef<string | null>(null)
  const lectureProgressLastWriteRef = useRef(0)
  const lectureProgressLastPositionRef = useRef(0)
  const musicProgressTrackIdRef = useRef<string | null>(null)
  const musicProgressLastWriteRef = useRef(0)
  const musicProgressLastPositionRef = useRef(0)

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new HtmlAudioPlaybackService()
    }
    return serviceRef.current
  }, [])

  const getVideoService = useCallback(() => {
    if (!videoServiceRef.current) {
      videoServiceRef.current = acquireTvVideoPlaybackService()
    }
    return videoServiceRef.current
  }, [])

  const stopInactiveMedia = useCallback((target: 'audio' | 'video') => {
    activeMediaRef.current = target
    if (target === 'video') {
      getService().stop()
      return
    }
    getVideoService().releaseSource()
  }, [getService, getVideoService])

  const [currentTrack, setCurrentTrack] = useState<ApiSong | null>(null)
  const [currentQueue, setCurrentQueue] = useState<ApiSong[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [queueContext, setQueueContext] = useState<QueueContext>(DEFAULT_QUEUE_CONTEXT)
  const [queueSeedType, setQueueSeedType] = useState<QueueSeedType>(DEFAULT_QUEUE_SEED_TYPE)
  const [queueSeedId, setQueueSeedId] = useState<string | undefined>(undefined)
  const [queueTitle, setQueueTitle] = useState<string | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
  const isPlayingRef = useRef(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [positionSeconds, setPositionSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const positionSecondsRef = useRef(0)
  const lastPositionEmitRef = useRef(0)
  const lastEmittedPositionRef = useRef(0)
  const [volume, setVolumeState] = useState(1)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off')
  const [audioQualityMode, setAudioQualityMode] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.audioQualityMode,
    'auto',
    parseStoredAudioQualityMode,
  )
  const [audiobookPlaybackRate, setAudiobookPlaybackRate] = usePersistedPreference(
    DESKTOP_PREFERENCE_KEYS.audiobookPlaybackRate,
    1 as AudiobookPlaybackRate,
    parseStoredAudiobookPlaybackRate,
  )
  const audiobookPlaybackRateRef = useRef(audiobookPlaybackRate)

  useEffect(() => {
    audiobookPlaybackRateRef.current = audiobookPlaybackRate
  }, [audiobookPlaybackRate])

  useEffect(() => {
    shuffleEnabledRef.current = shuffleEnabled
  }, [shuffleEnabled])

  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])

  useEffect(() => {
    audioQualityModeRef.current = audioQualityMode
  }, [audioQualityMode])

  const emitPositionSeconds = useCallback((seconds: number, force = false) => {
    if (!Number.isFinite(seconds)) return
    const safeSeconds = Math.max(0, seconds)
    positionSecondsRef.current = safeSeconds

    const now = performance.now()
    if (
      !force
      && now - lastPositionEmitRef.current < POSITION_UI_THROTTLE_MS
      && Math.abs(safeSeconds - lastEmittedPositionRef.current) < 1
    ) {
      return
    }

    lastPositionEmitRef.current = now
    lastEmittedPositionRef.current = safeSeconds
    setPositionSeconds(safeSeconds)
  }, [])

  const cancelUpgradeSession = useCallback(
    (
      event?:
        | 'upgrade-cancelled-track-changed'
        | 'upgrade-cancelled-pause'
        | 'upgrade-cancelled-target-changed'
        | 'upgrade-cancelled-session-replaced',
      reason?: string,
    ) => {
      const session = upgradeSessionRef.current
      if (session && !session.cancelled && event) {
        logAudioUpgrade(
          event,
          buildUpgradeDiagnosticsContext({
            trackId: session.trackId,
            trackTitle: session.song.title,
            qualityMode: audioQualityModeRef.current,
            sourceTier: session.selection.tier,
            targetTier: session.upgradeTier,
            sourceUrl: session.selection.url,
            targetUrl: session.upgradeUrl,
            sessionId: session.sessionId,
            reason,
          }),
        )
      }
      if (session) {
        session.cancelled = true
      }
      upgradeSessionRef.current = null
    },
    [],
  )

  const persistPodcastProgress = useCallback(
    (
      song: ApiSong,
      positionSeconds: number,
      durationSeconds: number,
      options?: { force?: boolean; completed?: boolean },
    ) => {
      if (!isPodcastQueueSong(song)) return

      const completed =
        options?.completed === true
        || isPodcastEpisodeCompleted(positionSeconds, durationSeconds)

      const entry = buildPodcastProgressEntryFromSong(
        song,
        positionSeconds,
        durationSeconds,
        completed,
      )
      if (!entry) return

      if (completed) {
        removePodcastProgress(entry.episodeId)
        recordPodcastHistory(progressEntryToHistoryEntry(entry))
        return
      }

      upsertPodcastProgress(entry)
    },
    [],
  )

  const flushPodcastProgress = useCallback(
    (force = false) => {
      const track = currentTrackRef.current
      if (!track || !isPodcastQueueSong(track)) return

      const audio = getService().getAudioElement()
      const position = audio.currentTime
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationSeconds

      if (!force) {
        const elapsed = performance.now() - podcastProgressLastWriteRef.current
        const positionDelta = Math.abs(position - podcastProgressLastPositionRef.current)
        if (elapsed < PODCAST_PROGRESS_THROTTLE_MS && positionDelta < 2) return
      }

      podcastProgressLastWriteRef.current = performance.now()
      podcastProgressLastPositionRef.current = position
      persistPodcastProgress(track, position, duration, { force })
    },
    [durationSeconds, getService, persistPodcastProgress],
  )

  const persistAudiobookProgress = useCallback(
    (
      song: ApiSong,
      positionSeconds: number,
      durationSeconds: number,
      options?: { force?: boolean; completed?: boolean },
    ) => {
      if (!isAudiobookQueueSong(song)) return

      const completed =
        options?.completed === true
        || isAudiobookChapterCompleted(positionSeconds, durationSeconds)

      const entry = buildAudiobookProgressEntryFromSong(
        song,
        positionSeconds,
        durationSeconds,
        completed,
      )
      if (!entry) return

      if (completed) {
        removeAudiobookProgress(entry.bookId)
        recordAudiobookHistory(audiobookProgressEntryToHistoryEntry(entry))
        return
      }

      upsertAudiobookProgress(entry)
    },
    [],
  )

  const flushAudiobookProgress = useCallback(
    (force = false) => {
      const track = currentTrackRef.current
      if (!track || !isAudiobookQueueSong(track)) return

      const audio = getService().getAudioElement()
      const position = audio.currentTime
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationSeconds

      if (!force) {
        const elapsed = performance.now() - audiobookProgressLastWriteRef.current
        const positionDelta = Math.abs(position - audiobookProgressLastPositionRef.current)
        if (elapsed < AUDIOBOOK_PROGRESS_THROTTLE_MS && positionDelta < 2) return
      }

      audiobookProgressLastWriteRef.current = performance.now()
      audiobookProgressLastPositionRef.current = position
      persistAudiobookProgress(track, position, duration, { force })
    },
    [durationSeconds, getService, persistAudiobookProgress],
  )

  const persistMotivationalProgress = useCallback(
    (
      song: ApiSong,
      positionSeconds: number,
      durationSeconds: number,
      options?: { force?: boolean; completed?: boolean },
    ) => {
      if (!isMotivationalQueueSong(song)) return

      const completed =
        options?.completed === true
        || isMotivationalSessionCompleted(positionSeconds, durationSeconds)

      const entry = buildMotivationalProgressEntryFromSong(
        song,
        positionSeconds,
        durationSeconds,
        completed,
      )
      if (!entry) return

      if (completed) {
        removeMotivationalProgress(entry.programId)
        recordMotivationalHistory(motivationalProgressEntryToHistoryEntry(entry))
        return
      }

      upsertMotivationalProgress(entry)
    },
    [],
  )

  const flushMotivationalProgress = useCallback(
    (force = false) => {
      const track = currentTrackRef.current
      if (!track || !isMotivationalQueueSong(track)) return

      const position = isMotivationalVideoSong(track)
        ? getVideoService().getVideoElement().currentTime
        : getService().getAudioElement().currentTime
      const rawDuration = isMotivationalVideoSong(track)
        ? getVideoService().getVideoElement().duration
        : getService().getAudioElement().duration
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : durationSeconds

      if (!force) {
        const elapsed = performance.now() - motivationalProgressLastWriteRef.current
        const positionDelta = Math.abs(position - motivationalProgressLastPositionRef.current)
        if (elapsed < MOTIVATIONAL_PROGRESS_THROTTLE_MS && positionDelta < 2) return
      }

      motivationalProgressLastWriteRef.current = performance.now()
      motivationalProgressLastPositionRef.current = position
      persistMotivationalProgress(track, position, duration, { force })
    },
    [durationSeconds, getService, getVideoService, persistMotivationalProgress],
  )

  const persistLectureProgress = useCallback(
    (
      song: ApiSong,
      positionSeconds: number,
      durationSeconds: number,
      options?: { force?: boolean; completed?: boolean },
    ) => {
      if (!isLectureQueueSong(song)) return

      const completed =
        options?.completed === true
        || isLectureSessionCompleted(positionSeconds, durationSeconds)

      const entry = buildLectureProgressEntryFromSong(
        song,
        positionSeconds,
        durationSeconds,
        completed,
        null,
        null,
        song.genre ?? null,
      )
      if (!entry) return

      if (completed) {
        removeLectureProgress(entry.seriesId)
        recordLectureHistory(lectureProgressEntryToHistoryEntry(entry))
        return
      }

      upsertLectureProgress(entry)
    },
    [],
  )

  const flushLectureProgress = useCallback(
    (force = false) => {
      const track = currentTrackRef.current
      if (!track || !isLectureQueueSong(track)) return

      const position = isLectureVideoSong(track)
        ? getVideoService().getVideoElement().currentTime
        : getService().getAudioElement().currentTime
      const rawDuration = isLectureVideoSong(track)
        ? getVideoService().getVideoElement().duration
        : getService().getAudioElement().duration
      const duration =
        Number.isFinite(rawDuration) && rawDuration > 0
          ? rawDuration
          : durationSeconds

      if (!force) {
        const elapsed = performance.now() - lectureProgressLastWriteRef.current
        const positionDelta = Math.abs(position - lectureProgressLastPositionRef.current)
        if (elapsed < LECTURE_PROGRESS_THROTTLE_MS && positionDelta < 2) return
      }

      lectureProgressLastWriteRef.current = performance.now()
      lectureProgressLastPositionRef.current = position
      persistLectureProgress(track, position, duration, { force })
    },
    [durationSeconds, getService, getVideoService, persistLectureProgress],
  )

  const persistMusicProgress = useCallback(
    (
      song: ApiSong,
      positionSeconds: number,
      durationSeconds: number,
      options?: { force?: boolean; completed?: boolean },
    ) => {
      if (!isMusicCatalogSong(song)) return

      const completed =
        options?.completed === true
        || isMusicTrackCompleted(positionSeconds, durationSeconds)

      const entry = buildMusicProgressEntryFromSong(
        song,
        positionSeconds,
        durationSeconds,
        completed,
      )
      if (!entry) return

      if (completed) {
        removeMusicProgress(entry.songId)
        recordMusicHistory(musicProgressEntryToHistoryEntry(entry))
        return
      }

      upsertMusicProgress(entry)
    },
    [],
  )

  const flushMusicProgress = useCallback(
    (force = false) => {
      const track = currentTrackRef.current
      if (!track || !isMusicCatalogSong(track)) return

      const audio = getService().getAudioElement()
      const position = audio.currentTime
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : durationSeconds

      if (!force) {
        const elapsed = performance.now() - musicProgressLastWriteRef.current
        const positionDelta = Math.abs(position - musicProgressLastPositionRef.current)
        if (elapsed < MUSIC_PROGRESS_THROTTLE_MS && positionDelta < 2) return
      }

      musicProgressLastWriteRef.current = performance.now()
      musicProgressLastPositionRef.current = position
      persistMusicProgress(track, position, duration, { force })
    },
    [durationSeconds, getService, persistMusicProgress],
  )

  const applyQueueState = useCallback((queue: ApiSong[], index: number) => {
    queueRef.current = queue
    queueIndexRef.current = index
    setCurrentQueue(queue)
    setCurrentIndex(index)

    // Persist finite audio queue metadata only (TV/Sports stripped by classify).
    const persistable = queue.filter((song) => isPersistableQueueSong(song))
    if (persistable.length === 0) {
      clearPersistedQueue()
      return
    }
    const mappedIndex = index >= 0 && queue[index]
      ? persistable.findIndex((song) => song.id === queue[index].id)
      : -1
    persistQueueSnapshot({
      songs: persistable,
      activeIndex: mappedIndex,
      queueContext: queueContextRef.current,
      queueTitle: undefined,
    })
  }, [])

  const clearTvChannelSwitchState = useCallback(() => {
    tvChannelSwitchInFlightRef.current = false
    tvFailSkipCountRef.current = 0
    tvAutoAdvanceOnFailRef.current = null
  }, [])

  /** Atomically publish queue index + active metadata so sidebar/footer never drift. */
  const commitActiveQueueTrack = useCallback((queue: ApiSong[], index: number) => {
    applyQueueState(queue, index)
    const track = queue[index] ?? null
    currentTrackRef.current = track
    setCurrentTrack(track)
    setError(null)
  }, [applyQueueState])

  const trySkipFailedTvChannel = useCallback((failedSong: ApiSong): boolean => {
    if (!isTvQueueSong(failedSong)) return false
    const direction = tvAutoAdvanceOnFailRef.current
    if (!direction) {
      tvChannelSwitchInFlightRef.current = false
      return false
    }
    if (tvFailSkipCountRef.current >= TV_CHANNEL_FAIL_SKIP_LIMIT) {
      clearTvChannelSwitchState()
      return false
    }

    const queue = queueRef.current
    const index = queueIndexRef.current

    if (direction === 'forward') {
      const playableIndex = findNextUnblockedQueueIndex(queue, index + 1)
      if (playableIndex < 0) {
        clearTvChannelSwitchState()
        return false
      }
      tvFailSkipCountRef.current += 1
      commitActiveQueueTrack(queue, playableIndex)
      playSongRef.current(queue[playableIndex])
      return true
    }

    let candidate = index - 1
    while (candidate >= 0 && isQueueSongBlockedByMature(queue[candidate])) {
      candidate -= 1
    }
    if (candidate < 0) {
      clearTvChannelSwitchState()
      return false
    }
    tvFailSkipCountRef.current += 1
    commitActiveQueueTrack(queue, candidate)
    playSongRef.current(queue[candidate])
    return true
  }, [clearTvChannelSwitchState, commitActiveQueueTrack])

  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])

  const setQueueContextState = useCallback((context: QueueContext) => {
    queueContextRef.current = context
    setQueueContext(context)
  }, [])

  const queueRestoredRef = useRef(false)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-shot paused queue restore on mount */
    if (queueRestoredRef.current) return
    queueRestoredRef.current = true
    const restored = restoreQueueSongs()
    if (!restored || restored.songs.length === 0) return

    // Mature-content gating: do not hydrate blocked items into the restored queue.
    const allowedSongs = restored.songs.filter((song) => !isQueueSongBlockedByMature(song))
    if (allowedSongs.length === 0) {
      emitQueueDiagnostic('queue_restored', {
        count: 0,
        activeIndex: -1,
        autoplay: false,
        matureFiltered: restored.songs.length,
      })
      return
    }

    let activeIndex = restored.activeIndex
    if (activeIndex >= 0) {
      const activeSong = restored.songs[activeIndex]
      if (!activeSong || isQueueSongBlockedByMature(activeSong)) {
        activeIndex = -1
      } else {
        const mapped = allowedSongs.findIndex((song) => song.id === activeSong.id)
        activeIndex = mapped >= 0 ? mapped : -1
      }
    }
    if (activeIndex >= allowedSongs.length) activeIndex = -1

    applyQueueState(allowedSongs, activeIndex)
    const ctx = restored.queueContext
    if (
      ctx === 'home'
      || ctx === 'discover'
      || ctx === 'album'
      || ctx === 'artist'
      || ctx === 'mood'
      || ctx === 'manual'
      || ctx === 'radio'
      || ctx === 'podcast'
      || ctx === 'audiobook'
      || ctx === 'motivational'
      || ctx === 'lecture'
      || ctx === 'tv'
      || ctx === 'sports'
      || ctx === 'scene'
      || ctx === 'smart'
    ) {
      setQueueContextState(ctx)
    }
    if (restored.queueTitle) setQueueTitle(restored.queueTitle)
    emitQueueDiagnostic('queue_restored', {
      count: allowedSongs.length,
      activeIndex,
      autoplay: false,
      matureFiltered: restored.songs.length - allowedSongs.length,
    })
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [applyQueueState, setQueueContextState])

  const extendQueueIfNeeded = useCallback((
    queue: ApiSong[],
    index: number,
    options?: { reason?: 'exhaustion' | 'prefetch' },
  ) => {
    // Mobile parity: smart continuation only at true queue exhaustion.
    // Never pre-append on play start or when merely landing on the last item —
    // that would let smart tracks sit ahead of later manual enqueue() calls.
    if (options?.reason !== 'exhaustion') {
      return queue
    }

    if (
      queue.length === 0
      || index !== queue.length - 1
      || queueSeedTypeRef.current === 'manual'
    ) {
      return queue
    }

    const started = performance.now()
    const { relatedTracks, inspectedCount, reason } = buildRelatedQueue(
      queue,
      queueSeedTypeRef.current,
      queueSeedIdRef.current,
      queueSeedTracksRef.current,
      queueCandidatePoolsRef.current,
      {
        context: queueContextRef.current,
        currentTrack: currentTrackRef.current,
        bounded: queueSeedBoundedRef.current,
      },
    )
    if (relatedTracks.length === 0) return queue

    logQueueExtension({
      seedType: queueSeedTypeRef.current,
      addedCount: relatedTracks.length,
      durationMs: Math.round(performance.now() - started),
      inspectedCount,
      reason,
    })

    const extendedQueue = [...queue, ...relatedTracks]
    queueRef.current = extendedQueue
    setCurrentQueue(extendedQueue)
    return extendedQueue
  }, [])

  const startPlayback = useCallback(
    (song: ApiSong) => {
      if (usesDesktopVideoPath(song)) {
        stopInactiveMedia('video')
        const videoService = getVideoService()
        const streamUrl = song.audioUrl?.trim() || song.previewUrl?.trim() || ''

        currentTrackRef.current = song
        setCurrentTrack(song)
        setError(null)
        emitPositionSeconds(0, true)
        setDurationSeconds(
          song.durationSeconds != null && song.durationSeconds > 0
            ? song.durationSeconds
            : 0,
        )

        if (!isPlayableMediaUrl(streamUrl)) {
          videoService.releaseSource()
          setIsPlaying(false)
          setIsLoading(false)
          if (isTvQueueSong(song) && trySkipFailedTvChannel(song)) {
            return
          }
          setError(playbackErrorMessage(song))
          return
        }

        const pendingResumeSeconds = isLectureVideoSong(song)
          ? consumePendingLectureResumeSeconds()
          : isMotivationalVideoSong(song)
            ? consumePendingMotivationalResumeSeconds()
            : null

        videoService.setVolume(volume)
        setIsLoading(true)
        void videoService
          .play(streamUrl)
          .then(() => {
            if (currentTrackRef.current?.id !== song.id) return
            if (isTvQueueSong(song)) {
              clearTvChannelSwitchState()
              recordTvHistory({
                channelId: extractTvChannelId(song.id) ?? song.id,
                title: song.title,
                channelName: song.artist,
                artworkUrl: song.artwork,
              })
            }
            if (isSportsQueueSong(song)) {
              const fixtureId = extractSportsFixtureId(song.id) ?? song.id.replace(/^sports-/, '')
              mirrorSportsHistoryEntry({
                fixtureId,
                title: song.title,
                sport: song.genre,
                league: song.album !== 'Sports' ? song.album : null,
                artworkUrl: song.artwork,
                status: Array.isArray(song.tags) ? song.tags.find((tag) => ['live', 'upcoming', 'completed', 'postponed', 'cancelled', 'unknown'].includes(tag)) ?? null : null,
              })
            }

            if (pendingResumeSeconds == null) return

            const video = videoService.getVideoElement()
            const maxDuration =
              Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : song.durationSeconds ?? pendingResumeSeconds
            const safeResume = Math.min(
              Math.max(0, pendingResumeSeconds),
              maxDuration > 1 ? maxDuration - 1 : pendingResumeSeconds,
            )
            const minContinue = isLectureVideoSong(song)
              ? LECTURE_MIN_CONTINUE_SECONDS / 2
              : MOTIVATIONAL_MIN_CONTINUE_SECONDS / 2
            if (safeResume >= minContinue) {
              video.currentTime = safeResume
              emitPositionSeconds(safeResume, true)
            }
          })
          .catch((err) => {
            if (currentTrackRef.current?.id !== song.id) return
            videoService.releaseSource()
            const message = err instanceof Error ? err.message : String(err)
            if (import.meta.env.DEV) {
              console.error('[ht-video-playback] play() failed', { error: message })
            }
            setIsPlaying(false)
            setIsLoading(false)
            if (isTvQueueSong(song) && trySkipFailedTvChannel(song)) {
              return
            }
            setError(message || playbackErrorMessage(song))
          })
        return
      }

      stopInactiveMedia('audio')
      const service = getService()
      cancelUpgradeSession('upgrade-cancelled-session-replaced', 'new-track-playback')
      const selection = selectPlayableUrlForQualityMode(song, audioQualityMode)
      const instantUrl = selection?.url ?? null
      const upgradeTarget =
        isPodcastQueueSong(song) || isRadioQueueSong(song) || isAudiobookQueueSong(song) || isMotivationalQueueSong(song) || isLectureQueueSong(song) || isTvQueueSong(song) || isSportsQueueSong(song)
          ? null
          : resolveUpgradeTargetForQualityMode(
              song,
              selection,
              audioQualityMode,
            )

      if (selection) {
        const diagnosticsBase = buildUpgradeDiagnosticsContext({
          trackId: song.id,
          trackTitle: song.title,
          qualityMode: audioQualityMode,
          sourceTier: selection.tier,
          sourceUrl: selection.url,
          targetTier: upgradeTarget?.tier,
          targetUrl: upgradeTarget?.url,
        })

        queueMicrotask(() => {
          logAudioVersionSelection({
            selectedTier: selection.tier,
            qualityMode: audioQualityMode,
            ...audioVersionAvailability(song.audioVersions),
          })

          if (upgradeTarget) {
            logAudioUpgrade('target-selected', diagnosticsBase)
          } else if (audioQualityMode === 'data-saver') {
            logAudioUpgrade('upgrade-blocked-data-saver', {
              ...diagnosticsBase,
              reason: 'quality-mode-disallows-upgrade',
            })
          } else if (audioQualityMode === 'standard') {
            logAudioUpgrade('upgrade-blocked-standard', {
              ...diagnosticsBase,
              reason: 'quality-mode-disallows-upgrade',
            })
          } else {
            logAudioUpgrade('upgrade-skipped', {
              ...diagnosticsBase,
              reason: 'already-at-target-or-unavailable',
            })
          }
        })
      }

      currentTrackRef.current = song
      setCurrentTrack(song)
      setError(null)
      emitPositionSeconds(0, true)
      setDurationSeconds(
        song.durationSeconds != null && song.durationSeconds > 0
          ? song.durationSeconds
          : 0,
      )

      if (!instantUrl) {
        cancelUpgradeSession()
        service.stop()
        setIsPlaying(false)
        setIsLoading(false)
        setError(playbackErrorMessage(song))
        return
      }

      const pendingResumeSeconds = isPodcastQueueSong(song)
        ? consumePendingPodcastResumeSeconds()
        : isAudiobookQueueSong(song)
          ? consumePendingAudiobookResumeSeconds()
          : isMotivationalQueueSong(song)
            ? consumePendingMotivationalResumeSeconds()
            : isLectureQueueSong(song)
              ? consumePendingLectureResumeSeconds()
              : isMusicCatalogSong(song)
                ? consumePendingMusicResumeSeconds()
                : null

      if (isAudiobookQueueSong(song)) {
        service.setPlaybackRate(audiobookPlaybackRateRef.current)
      } else {
        service.setPlaybackRate(1)
      }

      setIsLoading(true)
      const motivationalPlayOptions = isMotivationalQueueSong(song)
        ? { startupTimeoutMs: 15000 }
        : undefined
      void service
        .play(instantUrl, motivationalPlayOptions)
        .then(() => {
          if (isRadioQueueSong(song) && currentTrackRef.current?.id === song.id) {
            const stationId = extractRadioStationId(song.id) ?? song.id
            mirrorRadioHistoryEntry({
              stationId,
              title: song.title,
              artworkUrl: song.artwork,
              country: song.album,
              isMature: Boolean(song.tags?.includes('mature') || song.genre === 'adult'),
              contentRating: null,
            })
          }

          if (
            pendingResumeSeconds
            && isPodcastQueueSong(song)
            && currentTrackRef.current?.id === song.id
          ) {
            const audio = service.getAudioElement()
            const maxDuration =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : song.durationSeconds ?? pendingResumeSeconds
            const safeResume = Math.min(
              Math.max(0, pendingResumeSeconds),
              maxDuration > 1 ? maxDuration - 1 : pendingResumeSeconds,
            )
            if (safeResume >= PODCAST_MIN_CONTINUE_SECONDS / 2) {
              service.seekTo(safeResume)
              emitPositionSeconds(safeResume, true)
            }
          }

          if (
            pendingResumeSeconds
            && isAudiobookQueueSong(song)
            && currentTrackRef.current?.id === song.id
          ) {
            const audio = service.getAudioElement()
            const maxDuration =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : song.durationSeconds ?? pendingResumeSeconds
            const safeResume = Math.min(
              Math.max(0, pendingResumeSeconds),
              maxDuration > 1 ? maxDuration - 1 : pendingResumeSeconds,
            )
            if (safeResume >= AUDIOBOOK_MIN_CONTINUE_SECONDS / 2) {
              service.seekTo(safeResume)
              emitPositionSeconds(safeResume, true)
            }
          }

          if (
            pendingResumeSeconds
            && isMotivationalQueueSong(song)
            && currentTrackRef.current?.id === song.id
          ) {
            const audio = service.getAudioElement()
            const maxDuration =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : song.durationSeconds ?? pendingResumeSeconds
            const safeResume = Math.min(
              Math.max(0, pendingResumeSeconds),
              maxDuration > 1 ? maxDuration - 1 : pendingResumeSeconds,
            )
            if (safeResume >= MOTIVATIONAL_MIN_CONTINUE_SECONDS / 2) {
              service.seekTo(safeResume)
              emitPositionSeconds(safeResume, true)
            }
          }

          if (
            pendingResumeSeconds
            && isLectureQueueSong(song)
            && !isLectureVideoSong(song)
            && currentTrackRef.current?.id === song.id
          ) {
            const audio = service.getAudioElement()
            const maxDuration =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : song.durationSeconds ?? pendingResumeSeconds
            const safeResume = Math.min(
              Math.max(0, pendingResumeSeconds),
              maxDuration > 1 ? maxDuration - 1 : pendingResumeSeconds,
            )
            if (safeResume >= LECTURE_MIN_CONTINUE_SECONDS / 2) {
              service.seekTo(safeResume)
              emitPositionSeconds(safeResume, true)
            }
          }

          if (
            pendingResumeSeconds
            && isMusicCatalogSong(song)
            && currentTrackRef.current?.id === song.id
          ) {
            const audio = service.getAudioElement()
            const maxDuration =
              Number.isFinite(audio.duration) && audio.duration > 0
                ? audio.duration
                : song.durationSeconds ?? pendingResumeSeconds
            const safeResume = Math.min(
              Math.max(0, pendingResumeSeconds),
              maxDuration > 1 ? maxDuration - 1 : pendingResumeSeconds,
            )
            if (safeResume >= MUSIC_MIN_CONTINUE_SECONDS / 2) {
              service.seekTo(safeResume)
              emitPositionSeconds(safeResume, true)
            }
          }

          if (
            selection
            && upgradeTarget
            && !isPodcastQueueSong(song)
            && !isRadioQueueSong(song)
            && !isAudiobookQueueSong(song)
            && !isMotivationalQueueSong(song)
            && !isLectureQueueSong(song)
            && currentTrackRef.current?.id === song.id
          ) {
            upgradeSessionRef.current = {
              sessionId: ++upgradeSessionIdRef.current,
              trackId: song.id,
              song,
              selection,
              upgradeUrl: upgradeTarget.url,
              upgradeTier: upgradeTarget.tier,
              attempted: false,
              cancelled: false,
              startedAtMs: performance.now(),
              lastUnstableAtMs: 0,
            }
            logAudioUpgrade(
              'upgrade-scheduled',
              buildUpgradeDiagnosticsContext({
                trackId: song.id,
                trackTitle: song.title,
                qualityMode: audioQualityMode,
                sourceTier: selection.tier,
                targetTier: upgradeTarget.tier,
                sourceUrl: selection.url,
                targetUrl: upgradeTarget.url,
                sessionId: upgradeSessionRef.current.sessionId,
                reason: 'awaiting-stable-playback',
              }),
            )
          }
        })
        .catch((err) => {
          cancelUpgradeSession()
          const message = err instanceof Error ? err.message : String(err)
          if (import.meta.env.DEV) {
            console.error('[ht-playback] play() failed', {
              audioUrl: instantUrl,
              error: message,
            })
          }
          setIsPlaying(false)
          setIsLoading(false)
          const unavailable =
            isMotivationalQueueSong(song)
            && (message.includes('Timed out') || message.includes('MEDIA_ERR'))
          setError(unavailable ? 'This item is currently unavailable.' : message || playbackErrorMessage(song))
        })
    },
    [audioQualityMode, cancelUpgradeSession, clearTvChannelSwitchState, emitPositionSeconds, getService, getVideoService, stopInactiveMedia, trySkipFailedTvChannel, volume],
  )

  const playSong = useCallback(
    (song: ApiSong) => {
      const generation = ++mediaResolveGenerationRef.current

      const preparePodcastProgress = (resolvedSong: ApiSong) => {
        if (isPodcastQueueSong(resolvedSong)) {
          podcastProgressTrackIdRef.current = resolvedSong.id
          podcastProgressLastWriteRef.current = 0
          podcastProgressLastPositionRef.current = 0

          const historySeed = buildPodcastProgressEntryFromSong(
            resolvedSong,
            0,
            resolvedSong.durationSeconds ?? 0,
            false,
          )
          if (historySeed) {
            recordPodcastHistory(progressEntryToHistoryEntry(historySeed))
          }
          return
        }

        podcastProgressTrackIdRef.current = null
      }

      const prepareAudiobookProgress = (resolvedSong: ApiSong) => {
        if (isAudiobookQueueSong(resolvedSong)) {
          audiobookProgressTrackIdRef.current = resolvedSong.id
          audiobookProgressLastWriteRef.current = 0
          audiobookProgressLastPositionRef.current = 0

          const historySeed = buildAudiobookProgressEntryFromSong(
            resolvedSong,
            0,
            resolvedSong.durationSeconds ?? 0,
            false,
          )
          if (historySeed) {
            recordAudiobookHistory(audiobookProgressEntryToHistoryEntry(historySeed))
          }
          return
        }

        audiobookProgressTrackIdRef.current = null
      }

      const prepareMotivationalProgress = (resolvedSong: ApiSong) => {
        if (isMotivationalQueueSong(resolvedSong)) {
          motivationalProgressTrackIdRef.current = resolvedSong.id
          motivationalProgressLastWriteRef.current = 0
          motivationalProgressLastPositionRef.current = 0

          const historySeed = buildMotivationalProgressEntryFromSong(
            resolvedSong,
            0,
            resolvedSong.durationSeconds ?? 0,
            false,
          )
          if (historySeed) {
            recordMotivationalHistory(motivationalProgressEntryToHistoryEntry(historySeed))
          }
          return
        }

        motivationalProgressTrackIdRef.current = null
      }

      const prepareLectureProgress = (resolvedSong: ApiSong) => {
        if (isLectureQueueSong(resolvedSong)) {
          lectureProgressTrackIdRef.current = resolvedSong.id
          lectureProgressLastWriteRef.current = 0
          lectureProgressLastPositionRef.current = 0

          const historySeed = buildLectureProgressEntryFromSong(
            resolvedSong,
            0,
            resolvedSong.durationSeconds ?? 0,
            false,
            null,
            null,
            resolvedSong.genre ?? null,
          )
          if (historySeed) {
            recordLectureHistory(lectureProgressEntryToHistoryEntry(historySeed))
          }
          return
        }

        lectureProgressTrackIdRef.current = null
      }

      const prepareMusicProgress = (resolvedSong: ApiSong) => {
        if (isMusicCatalogSong(resolvedSong)) {
          musicProgressTrackIdRef.current = resolvedSong.id
          musicProgressLastWriteRef.current = 0
          musicProgressLastPositionRef.current = 0

          const historySeed = buildMusicProgressEntryFromSong(
            resolvedSong,
            0,
            resolvedSong.durationSeconds ?? 0,
            false,
          )
          if (historySeed) {
            recordMusicHistory(musicProgressEntryToHistoryEntry(historySeed))
          }
          return
        }

        musicProgressTrackIdRef.current = null
      }

      const hasPlayableSource = Boolean(
        isPlayableMediaUrl(song.audioUrl) || isPlayableMediaUrl(song.previewUrl),
      )
      const needsRadioResolve = isRadioQueueSong(song) && !hasPlayableSource
      const needsTvResolve = isTvQueueSong(song) && !hasPlayableSource
      const needsPodcastResolve = isPodcastQueueSong(song) && !hasPlayableSource
      const needsAudiobookResolve = isAudiobookQueueSong(song) && !hasPlayableSource
      const needsMotivationalResolve = isMotivationalQueueSong(song) && !hasPlayableSource
      const needsLectureResolve = isLectureQueueSong(song) && !hasPlayableSource

      if (!needsRadioResolve && !needsTvResolve && !needsPodcastResolve && !needsAudiobookResolve && !needsMotivationalResolve && !needsLectureResolve) {
        if (generation !== mediaResolveGenerationRef.current) return
        if (currentTrackRef.current?.id !== song.id) return
        preparePodcastProgress(song)
        prepareAudiobookProgress(song)
        prepareMotivationalProgress(song)
        prepareLectureProgress(song)
        prepareMusicProgress(song)
        startPlayback(song)
        return
      }

      setIsLoading(true)
      setError(null)

      void (async () => {
        let resolvedSong = song

        if (needsRadioResolve) {
          const stationId = extractRadioStationId(song.id)
          if (!stationId) {
            setError('Unable to play this station.')
            setIsLoading(false)
            return
          }

          try {
            const streamUrl = await resolveRadioPlayUrl(stationId)
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            if (!streamUrl) {
              setIsLoading(false)
              setError('This station is not currently playable.')
              return
            }

            resolvedSong = {
              ...song,
              audioUrl: streamUrl,
              previewUrl: streamUrl,
            }

            const queue = queueRef.current
            const queueIndex = queue.findIndex((entry) => entry.id === song.id)
            if (queueIndex >= 0) {
              const updatedQueue = [...queue]
              updatedQueue[queueIndex] = resolvedSong
              queueRef.current = updatedQueue
              setCurrentQueue(updatedQueue)
            }
          } catch (error) {
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            setIsLoading(false)
            setError(
              error instanceof Error
                ? error.message
                : 'This station stream is unavailable right now.',
            )
            return
          }
        }

        if (needsTvResolve) {
          const channelId = extractTvChannelId(song.id)
          if (!channelId) {
            setIsLoading(false)
            if (trySkipFailedTvChannel(song)) return
            setError('Unable to play this TV channel.')
            return
          }

          try {
            const play = await resolveTvPlayUrl(channelId)
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            if (!play?.streamUrl?.startsWith('http')) {
              setIsLoading(false)
              if (trySkipFailedTvChannel(song)) return
              setError('This TV channel is not currently playable.')
              return
            }

            resolvedSong = {
              ...song,
              audioUrl: play.streamUrl,
              previewUrl: play.streamUrl,
            }

            const queue = queueRef.current
            const queueIndex = queue.findIndex((entry) => entry.id === song.id)
            if (queueIndex >= 0) {
              const updatedQueue = [...queue]
              updatedQueue[queueIndex] = resolvedSong
              queueRef.current = updatedQueue
              setCurrentQueue(updatedQueue)
            }
          } catch (error) {
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            setIsLoading(false)
            if (trySkipFailedTvChannel(song)) return
            setError(
              error instanceof Error
                ? error.message
                : 'This TV channel is unavailable right now.',
            )
            return
          }
        }

        if (needsPodcastResolve) {
          const episodeId = extractPodcastEpisodeId(song.id)
          if (!episodeId) {
            setError('Unable to play this podcast episode.')
            setIsLoading(false)
            return
          }

          try {
            const play = await resolvePodcastPlayUrl(episodeId)
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            if (!play?.audioUrl?.startsWith('http')) {
              setIsLoading(false)
              setError('This podcast episode is not currently playable.')
              return
            }

            resolvedSong = patchPodcastEpisodeWithPlayUrl(song, play)

            const queue = queueRef.current
            const queueIndex = queue.findIndex((entry) => entry.id === song.id)
            if (queueIndex >= 0) {
              const updatedQueue = [...queue]
              updatedQueue[queueIndex] = resolvedSong
              queueRef.current = updatedQueue
              setCurrentQueue(updatedQueue)
            }
          } catch (error) {
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            setIsLoading(false)
            setError(
              error instanceof Error
                ? error.message
                : 'This podcast episode is unavailable right now.',
            )
            return
          }
        }

        if (needsAudiobookResolve) {
          const ids = parseAudiobookSongId(song.id)
          if (!ids) {
            setError('Unable to play this audiobook chapter.')
            setIsLoading(false)
            return
          }

          try {
            const play = await resolveAudiobookChapterPlay(ids.bookId, ids.chapterId)
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            if (!play || play.chapters.length === 0) {
              setIsLoading(false)
              setError('This audiobook chapter is not currently playable.')
              return
            }

            const firstChapter = play.chapters[0]
            resolvedSong = patchAudiobookChapterWithPlayUrl(song, {
              audioUrl: firstChapter.audioUrl,
              durationSeconds: firstChapter.durationSeconds,
            })

            const queue = queueRef.current
            const queueIndex = queue.findIndex((entry) => entry.id === song.id)
            const patchStartIndex = queueIndex >= 0 ? queueIndex : Math.max(0, play.startIndex)
            const patchedQueue = patchAudiobookQueueWithResolvedChapters(
              queue,
              play.audiobook,
              play.chapters,
              patchStartIndex,
            )
            queueRef.current = patchedQueue
            setCurrentQueue(patchedQueue)
            if (queueIndex >= 0) {
              resolvedSong = patchedQueue[queueIndex] ?? resolvedSong
            }
          } catch (error) {
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            setIsLoading(false)
            setError(
              error instanceof Error
                ? error.message
                : 'This audiobook chapter is unavailable right now.',
            )
            return
          }
        }

        if (needsMotivationalResolve) {
          const ids = parseMotivationalSongId(song.id)
          if (!ids) {
            setError('Unable to play this motivational session.')
            setIsLoading(false)
            return
          }

          try {
            const play = await resolveMotivationalPlay(ids.sessionId)
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            if (!play?.audioUrl?.startsWith('http')) {
              setIsLoading(false)
              setError('This item is currently unavailable.')
              return
            }

            resolvedSong = patchMotivationalSessionWithPlayUrl(song, {
              audioUrl: play.audioUrl,
              durationSeconds: play.durationSeconds,
            })

            const queue = queueRef.current
            const queueIndex = queue.findIndex((entry) => entry.id === song.id)
            if (queueIndex >= 0) {
              const updatedQueue = [...queue]
              updatedQueue[queueIndex] = resolvedSong
              queueRef.current = updatedQueue
              setCurrentQueue(updatedQueue)
            }
          } catch (error) {
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            setIsLoading(false)
            setError(
              error instanceof Error
                ? error.message
                : 'This item is currently unavailable.',
            )
            return
          }
        }

        if (needsLectureResolve) {
          const ids = parseLectureSongId(song.id)
          if (!ids) {
            setError('Unable to play this lecture session.')
            setIsLoading(false)
            return
          }

          try {
            const play = await resolveLecturePlay(ids.seriesId, ids.sessionId)
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            if (!play?.playbackUrl?.startsWith('http')) {
              setIsLoading(false)
              setError('This lecture session is currently unavailable.')
              return
            }

            resolvedSong = patchLectureSessionWithPlayUrl(song, {
              playbackUrl: play.playbackUrl,
              durationSeconds: play.durationSeconds,
              mediaType: play.mediaType,
            })

            const queue = queueRef.current
            const queueIndex = queue.findIndex((entry) => entry.id === song.id)
            if (queueIndex >= 0) {
              const updatedQueue = [...queue]
              updatedQueue[queueIndex] = resolvedSong
              queueRef.current = updatedQueue
              setCurrentQueue(updatedQueue)
            }
          } catch (error) {
            if (generation !== mediaResolveGenerationRef.current) return
            if (currentTrackRef.current?.id !== song.id) return
            setIsLoading(false)
            setError(
              error instanceof Error
                ? error.message
                : 'This lecture session is currently unavailable.',
            )
            return
          }
        }

        if (generation !== mediaResolveGenerationRef.current) return
        if (currentTrackRef.current?.id !== song.id) return

        preparePodcastProgress(resolvedSong)
        prepareAudiobookProgress(resolvedSong)
        prepareMotivationalProgress(resolvedSong)
        prepareLectureProgress(resolvedSong)
        prepareMusicProgress(resolvedSong)
        startPlayback(resolvedSong)
      })()
    },
    [startPlayback, trySkipFailedTvChannel],
  )

  useEffect(() => {
    playSongRef.current = playSong
  }, [playSong])

  useEffect(() => {
    flushPodcastProgressRef.current = flushPodcastProgress
  }, [flushPodcastProgress])

  useEffect(() => {
    flushAudiobookProgressRef.current = flushAudiobookProgress
  }, [flushAudiobookProgress])

  useEffect(() => {
    flushMotivationalProgressRef.current = flushMotivationalProgress
  }, [flushMotivationalProgress])

  useEffect(() => {
    flushLectureProgressRef.current = flushLectureProgress
  }, [flushLectureProgress])

  useEffect(() => {
    flushMusicProgressRef.current = flushMusicProgress
  }, [flushMusicProgress])

  useEffect(() => {
    const onBeforeUnload = () => {
      flushPodcastProgressRef.current(true)
      flushAudiobookProgressRef.current(true)
      flushMotivationalProgressRef.current(true)
      flushLectureProgressRef.current(true)
      flushMusicProgressRef.current(true)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    const service = getService()
    const audio = service.getAudioElement()

    const syncDuration = () => {
      const fromAudio = audio.duration
      if (Number.isFinite(fromAudio) && fromAudio > 0) {
        setDurationSeconds(fromAudio)
      }
    }


    const markUpgradeUnstable = (reason: 'waiting' | 'stalled') => {
      const session = upgradeSessionRef.current
      if (!session || session.attempted) return

      const wasStable = session.lastUnstableAtMs === 0
      session.lastUnstableAtMs = performance.now()

      if (wasStable) {
        logAudioUpgrade(
          'upgrade-deferred-unstable',
          buildUpgradeDiagnosticsContext({
            trackId: session.trackId,
            trackTitle: session.song.title,
            qualityMode: audioQualityModeRef.current,
            sourceTier: session.selection.tier,
            targetTier: session.upgradeTier,
            sourceUrl: session.selection.url,
            targetUrl: session.upgradeUrl,
            sessionId: session.sessionId,
            positionSeconds: audio.currentTime,
            reason: `playback-not-stable:${reason}`,
          }),
        )
      }
    }

    const maybeUpgradeAfterStablePlayback = () => {
      const session = upgradeSessionRef.current
      if (!session || session.cancelled || session.attempted) return
      if (currentTrackRef.current?.id !== session.trackId) {
        cancelUpgradeSession(
          'upgrade-cancelled-track-changed',
          'active-track-changed-before-upgrade',
        )
        return
      }
      if (audio.paused || audio.ended) return
      if (audio.currentTime < UPGRADE_MIN_PLAYED_SECONDS) return
      if (session.lastUnstableAtMs > 0) {
        const stableForMs = performance.now() - session.lastUnstableAtMs
        if (stableForMs < UPGRADE_STABLE_WINDOW_MS) return
      }

      const currentTarget = resolveUpgradeTargetForQualityMode(
        session.song,
        session.selection,
        audioQualityModeRef.current,
      )
      if (!currentTarget || currentTarget.url !== session.upgradeUrl) {
        cancelUpgradeSession(
          'upgrade-cancelled-target-changed',
          'upgrade-target-no-longer-valid',
        )
        return
      }

      session.attempted = true
      void service.upgradeSource(
        currentTarget.url,
        buildUpgradeDiagnosticsContext({
          trackId: session.trackId,
          trackTitle: session.song.title,
          qualityMode: audioQualityModeRef.current,
          sourceTier: session.selection.tier,
          targetTier: currentTarget.tier,
          sourceUrl: session.selection.url,
          targetUrl: currentTarget.url,
          sessionId: session.sessionId,
          positionSeconds: audio.currentTime,
          ageMs: Math.round(performance.now() - session.startedAtMs),
          playedSeconds: Math.round(audio.currentTime),
          reason: 'stable-playback-threshold-met',
        }),
      )
    }

    const onTimeUpdate = () => {
      emitPositionSeconds(audio.currentTime)
      maybeUpgradeAfterStablePlayback()
      flushPodcastProgressRef.current()
      flushAudiobookProgressRef.current()
      flushMotivationalProgressRef.current()
      flushLectureProgressRef.current()
      flushMusicProgressRef.current()
    }
    const onPlay = () => {
      if (activeMediaRef.current !== 'audio') return
      setIsPlaying(true)
      setIsLoading(false)
      setError(null)
    }
    const onPause = () => {
      if (activeMediaRef.current !== 'audio') return
      setIsPlaying(false)
      flushPodcastProgressRef.current(true)
      flushAudiobookProgressRef.current(true)
      flushMotivationalProgressRef.current(true)
      flushLectureProgressRef.current(true)
      flushMusicProgressRef.current(true)
      if (!audio.ended && !upgradeSessionRef.current?.attempted) {
        cancelUpgradeSession('upgrade-cancelled-pause', 'playback-paused-before-upgrade')
      }
    }
    const onWaiting = () => {
      if (activeMediaRef.current !== 'audio') return
      markUpgradeUnstable('waiting')
      setIsLoading(true)
    }
    const onStalled = () => {
      markUpgradeUnstable('stalled')
      setIsLoading(true)
    }
    const onCanPlay = () => {
      setIsLoading(false)
      syncDuration()
    }
    const onLoadedMetadata = () => {
      syncDuration()
    }
    const onEnded = () => {
      const endedTrack = currentTrackRef.current
      if (endedTrack && isPodcastQueueSong(endedTrack)) {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : endedTrack.durationSeconds ?? audio.currentTime
        persistPodcastProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        podcastProgressTrackIdRef.current = null
      }

      if (endedTrack && isAudiobookQueueSong(endedTrack)) {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : endedTrack.durationSeconds ?? audio.currentTime
        persistAudiobookProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        audiobookProgressTrackIdRef.current = null
      }

      if (endedTrack && isMotivationalQueueSong(endedTrack)) {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : endedTrack.durationSeconds ?? audio.currentTime
        persistMotivationalProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        motivationalProgressTrackIdRef.current = null
      }

      if (endedTrack && isLectureQueueSong(endedTrack)) {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : endedTrack.durationSeconds ?? audio.currentTime
        persistLectureProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        lectureProgressTrackIdRef.current = null
      }

      if (endedTrack && isMusicCatalogSong(endedTrack)) {
        const duration =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration
            : endedTrack.durationSeconds ?? audio.currentTime
        persistMusicProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        musicProgressTrackIdRef.current = null
      }

      cancelUpgradeSession('upgrade-cancelled-track-changed', 'track-ended')

      // Mobile FINISH_DEBOUNCE / autoAdvanceRef: one ended → one advance.
      if (autoAdvanceInFlightRef.current) {
        return
      }
      const endedSongId = endedTrack?.id ?? ''
      const endedAt = Date.now()
      if (
        endedSongId
        && lastEndedAdvanceRef.current.songId === endedSongId
        && endedAt - lastEndedAdvanceRef.current.at < ENDED_ADVANCE_DEBOUNCE_MS
      ) {
        return
      }
      lastEndedAdvanceRef.current = { songId: endedSongId, at: endedAt }
      autoAdvanceInFlightRef.current = true

      try {
        const queue = queueRef.current
        const currentIndexValue = queueIndexRef.current

        if (repeatModeRef.current === 'one' && currentIndexValue >= 0 && queue[currentIndexValue]) {
          playSongRef.current(queue[currentIndexValue])
          return
        }

        const nextIndex = currentIndexValue + 1

        if (nextIndex < queue.length) {
          const playableIndex = findNextAutoAdvanceIndex(queue, nextIndex)
          if (playableIndex < 0) {
            setIsPlaying(false)
            emitPositionSeconds(0, true)
            setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
            return
          }
          queueIndexRef.current = playableIndex
          setCurrentIndex(playableIndex)
          // Do not smart-extend when merely advancing onto a later source item.
          playSongRef.current(queue[playableIndex])
          return
        }

        // Queue exhausted — mobile smart continuation (unbounded contexts only).
        const extendedQueue = extendQueueIfNeeded(queue, queueIndexRef.current, {
          reason: 'exhaustion',
        })
        if (nextIndex < extendedQueue.length) {
          const playableIndex = findNextAutoAdvanceIndex(extendedQueue, nextIndex)
          if (playableIndex < 0) {
            setIsPlaying(false)
            emitPositionSeconds(0, true)
            setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
            return
          }
          queueIndexRef.current = playableIndex
          setCurrentIndex(playableIndex)
          playSongRef.current(extendedQueue[playableIndex])
          return
        }

        if (repeatModeRef.current === 'all' && queue.length > 0) {
          const playableIndex = findNextAutoAdvanceIndex(queue, 0)
          if (playableIndex < 0) {
            setIsPlaying(false)
            emitPositionSeconds(0, true)
            setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
            return
          }
          queueIndexRef.current = playableIndex
          setCurrentIndex(playableIndex)
          playSongRef.current(queue[playableIndex])
          return
        }

        if (
          endedTrack
          && isLectureQueueSong(endedTrack)
          && queueContextRef.current === 'lecture'
        ) {
          const playedSeriesIds = new Set(
            queue
              .filter((entry) => isLectureQueueSong(entry) && entry.albumId)
              .map((entry) => entry.albumId as string),
          )
          const currentSeriesId = endedTrack.albumId ?? parseLectureSongId(endedTrack.id)?.seriesId
          if (currentSeriesId) playedSeriesIds.add(currentSeriesId)

          void (async () => {
            try {
              const continuationSeries = await searchLectureContinuation(
                {
                  id: currentSeriesId ?? '',
                  slug: currentSeriesId ?? '',
                  title: endedTrack.album ?? 'Lecture course',
                  subtitle: null,
                  description: null,
                  artworkUrl: endedTrack.artwork,
                  speaker: endedTrack.artist ? { name: endedTrack.artist } : null,
                  institution: null,
                  category: endedTrack.genre
                    ? { id: endedTrack.genre, slug: endedTrack.genre, name: endedTrack.genre }
                    : null,
                  subject: endedTrack.mood,
                  language: null,
                  country: null,
                  sessionCount: 0,
                  totalDurationSeconds: null,
                  isFeatured: false,
                  isVerified: true,
                  publishedAt: null,
                  difficulty: null,
                  topicTags: [],
                  mediaType: null,
                },
                playedSeriesIds,
              )
              if (!continuationSeries) return

              const sessions = await fetchAllLectureSeriesSessions(continuationSeries.id)
              if (sessions.length === 0) return

              const appended = buildLectureQueueSongs(continuationSeries, sessions)
              const merged = [...queue, ...appended]
              queueRef.current = merged
              setCurrentQueue(merged)
              queueIndexRef.current = queue.length
              setCurrentIndex(queue.length)
              playSongRef.current(appended[0])
            } catch {
              // Continue learning fallback is best-effort only.
            }
          })()
          return
        }

        setIsPlaying(false)
        emitPositionSeconds(0, true)
      } finally {
        autoAdvanceInFlightRef.current = false
      }
    }
    const onError = () => {
      cancelUpgradeSession('upgrade-cancelled-track-changed', 'media-error')
      setIsPlaying(false)
      setIsLoading(false)
      const mediaError = audio.error
      if (import.meta.env.DEV && mediaError) {
        console.error('[ht-playback] media error', {
          code: mediaError.code,
          message: mediaError.message,
          src: audio.currentSrc || audio.src,
          readyState: audio.readyState,
          networkState: audio.networkState,
        })
      }

      const track = currentTrackRef.current
      const queue = queueRef.current
      const currentIndexValue = queueIndexRef.current

      if (
        track
        && isRadioQueueSong(track)
        && currentIndexValue + 1 < queue.length
      ) {
        const playableIndex = findNextUnblockedQueueIndex(queue, currentIndexValue + 1)
        if (playableIndex < 0) {
          setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
          setIsPlaying(false)
          return
        }
        setError('Station unavailable — trying next.')
        queueIndexRef.current = playableIndex
        setCurrentIndex(playableIndex)
        currentTrackRef.current = queue[playableIndex]
        setCurrentTrack(queue[playableIndex])
        playSongRef.current(queue[playableIndex])
        return
      }

      if (track && isPodcastQueueSong(track)) {
        flushPodcastProgressRef.current(true)
        setError(playbackErrorMessage(track))
        return
      }

      if (track && isAudiobookQueueSong(track)) {
        flushAudiobookProgressRef.current(true)
        setError(playbackErrorMessage(track))
        return
      }

      setError(playbackErrorMessage(track))
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      cancelUpgradeSession()
      service.destroy()
      serviceRef.current = null
    }
  }, [cancelUpgradeSession, extendQueueIfNeeded, getService, persistAudiobookProgress, persistPodcastProgress])

  useEffect(() => {
    const videoService = getVideoService()
    const video = videoService.getVideoElement()

    const syncVideoDuration = () => {
      if (activeMediaRef.current !== 'video') return
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDurationSeconds(video.duration)
      }
    }

    const onTimeUpdate = () => {
      if (activeMediaRef.current !== 'video') return
      emitPositionSeconds(video.currentTime)
      flushLectureProgressRef.current()
      flushMotivationalProgressRef.current()
    }
    const onPlay = () => {
      if (activeMediaRef.current !== 'video') return
      setIsPlaying(true)
      setIsLoading(false)
      setError(null)
    }
    const onPause = () => {
      if (activeMediaRef.current !== 'video') return
      setIsPlaying(false)
      flushLectureProgressRef.current(true)
      flushMotivationalProgressRef.current(true)
    }
    const onWaiting = () => {
      if (activeMediaRef.current !== 'video') return
      setIsLoading(true)
    }
    const onCanPlay = () => {
      if (activeMediaRef.current !== 'video') return
      setIsLoading(false)
      syncVideoDuration()
    }
    const onLoadedMetadata = () => {
      syncVideoDuration()
    }
    const onEnded = () => {
      if (activeMediaRef.current !== 'video') return
      const endedTrack = currentTrackRef.current

      if (endedTrack && isLectureQueueSong(endedTrack)) {
        const duration =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : endedTrack.durationSeconds ?? video.currentTime
        persistLectureProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        lectureProgressTrackIdRef.current = null
      }

      if (endedTrack && isMotivationalQueueSong(endedTrack)) {
        const duration =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : endedTrack.durationSeconds ?? video.currentTime
        persistMotivationalProgress(endedTrack, duration, duration, {
          force: true,
          completed: true,
        })
        motivationalProgressTrackIdRef.current = null
      }

      const queue = queueRef.current
      const currentIndexValue = queueIndexRef.current

      if (repeatModeRef.current === 'one' && currentIndexValue >= 0 && queue[currentIndexValue]) {
        playSongRef.current(queue[currentIndexValue])
        return
      }

      const nextIndex = currentIndexValue + 1
      if (nextIndex < queue.length) {
        const playableIndex = findNextUnblockedQueueIndex(queue, nextIndex)
        if (playableIndex < 0) {
          setIsPlaying(false)
          emitPositionSeconds(0, true)
          setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
          return
        }
        queueIndexRef.current = playableIndex
        setCurrentIndex(playableIndex)
        playSongRef.current(queue[playableIndex])
        return
      }

      if (repeatModeRef.current === 'all' && queue.length > 0) {
        const playableIndex = findNextUnblockedQueueIndex(queue, 0)
        if (playableIndex < 0) {
          setIsPlaying(false)
          emitPositionSeconds(0, true)
          setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
          return
        }
        queueIndexRef.current = playableIndex
        setCurrentIndex(playableIndex)
        playSongRef.current(queue[playableIndex])
        return
      }

      setIsPlaying(false)
      emitPositionSeconds(0, true)
    }
    const onError = () => {
      if (activeMediaRef.current !== 'video') return
      const track = currentTrackRef.current
      videoService.releaseSource()
      setIsPlaying(false)
      setIsLoading(false)
      if (import.meta.env.DEV && video.error) {
        console.error('[ht-tv-playback] media error', {
          code: video.error.code,
          message: video.error.message,
        })
      }
      if (track && trySkipFailedTvChannel(track)) return
      setError(playbackErrorMessage(track))
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('canplay', onCanPlay)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('ended', onEnded)
    video.addEventListener('error', onError)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      videoService.releaseSource()
      videoService.unmount()
    }
  }, [emitPositionSeconds, getVideoService, persistLectureProgress, persistMotivationalProgress, trySkipFailedTvChannel])

  const playQueue = useCallback(
    (
      queue: ApiSong[],
      startIndex: number,
      context: QueueContext,
      nextQueueTitle?: string,
      seedMetadata?: QueueSeedMetadata,
    ) => {
      const playableQueue = queue.filter(Boolean)
      if (playableQueue.length === 0) return

      const safeIndex = Math.min(
        playableQueue.length - 1,
        Math.max(0, Number.isFinite(startIndex) ? startIndex : 0),
      )

      // Fresh queue ownership: clear any in-flight TV channel switch bookkeeping.
      clearTvChannelSwitchState()

      unshuffledQueueRef.current = playableQueue
      let resolvedQueue = playableQueue
      let resolvedIndex = safeIndex
      if (shuffleEnabledRef.current && playableQueue.length > 1 && context !== 'audiobook' && context !== 'motivational' && context !== 'lecture' && context !== 'tv' && context !== 'sports' && context !== 'radio') {
        resolvedQueue = shuffleQueueFromIndex(playableQueue, safeIndex)
        resolvedIndex = 0
      }

      const targetTrack = resolvedQueue[resolvedIndex]
      setIsLoading(true)
      setError(null)
      currentTrackRef.current = targetTrack
      setCurrentTrack(targetTrack)

      if (isPodcastQueueSong(targetTrack)) {
        flushPodcastProgress(true)
      } else if (isAudiobookQueueSong(targetTrack)) {
        flushAudiobookProgress(true)
      } else {
        queueMicrotask(() => {
          flushPodcastProgress(true)
          flushAudiobookProgress(true)
        })
      }

      const nextSeedType = seedMetadata?.seedType ?? contextToSeedType(context)
      queueSeedTypeRef.current = nextSeedType
      queueSeedIdRef.current = seedMetadata?.seedId
      queueSeedTracksRef.current = seedMetadata?.seedTracks ?? resolvedQueue
      queueCandidatePoolsRef.current = seedMetadata?.candidatePools
      // Default bounded (mobile): only explicit unbounded full-catalog-style plays continue.
      queueSeedBoundedRef.current = seedMetadata?.bounded ?? true
      smartContinuationStartRef.current = -1

      applyQueueState(resolvedQueue, resolvedIndex)
      setQueueContextState(context)
      setQueueSeedType(nextSeedType)
      setQueueSeedId(seedMetadata?.seedId)
      setQueueTitle(nextQueueTitle)

      playSong(targetTrack)
      // Do not pre-extend here — smart continuation runs only at exhaustion on ended/next.
    },
    [applyQueueState, clearTvChannelSwitchState, flushAudiobookProgress, flushPodcastProgress, playSong, setQueueContextState],
  )

  const playTrack = useCallback(
    (song: ApiSong) => {
      playQueue([song], 0, DEFAULT_QUEUE_CONTEXT)
    },
    [playQueue],
  )

  const playNow = useCallback(
    (song: ApiSong) => {
      const existing = findSongIndexById(queueRef.current, song.id)
      if (existing >= 0) {
        emitQueueDiagnostic('queue_active_changed', { reason: 'playNow-existing', index: existing })
        applyQueueState(queueRef.current, existing)
        playSong(queueRef.current[existing])
        return
      }
      emitQueueDiagnostic('queue_play_started', { reason: 'playNow-replace', id: song.id })
      playQueue([song], 0, DEFAULT_QUEUE_CONTEXT)
    },
    [applyQueueState, playQueue, playSong],
  )

  const enqueue = useCallback(
    (song: ApiSong, opts?: { allowDuplicate?: boolean }) => {
      const queue = queueRef.current
      const smartStart = smartContinuationStartRef.current

      // Manual add-to-queue must stay ahead of smart continuation items.
      if (smartStart >= 0 && smartStart <= queue.length) {
        if (!opts?.allowDuplicate) {
          const existing = findSongIndexById(queue, song.id)
          if (existing >= 0) {
            return { added: false, index: existing }
          }
        }
        const insertAt = smartStart
        const nextQueue = [...queue.slice(0, insertAt), song, ...queue.slice(insertAt)]
        smartContinuationStartRef.current = insertAt + 1
        applyQueueState(nextQueue, queueIndexRef.current < 0 ? 0 : queueIndexRef.current)
        emitQueueDiagnostic('queue_item_added', { id: song.id, index: insertAt, beforeSmart: true })
        return { added: true, index: insertAt }
      }

      const result = enqueueSong(queue, song, opts)
      if (result.added) {
        applyQueueState(result.queue, queueIndexRef.current < 0 ? 0 : queueIndexRef.current)
        emitQueueDiagnostic('queue_item_added', { id: song.id, index: result.index })
      }
      return { added: result.added, index: result.index }
    },
    [applyQueueState],
  )

  const playNextSong = useCallback(
    (song: ApiSong, opts?: { allowDuplicate?: boolean }) => {
      const result = insertPlayNext(queueRef.current, queueIndexRef.current, song, opts)
      if (result.added) {
        if (
          smartContinuationStartRef.current >= 0
          && result.index <= smartContinuationStartRef.current
        ) {
          smartContinuationStartRef.current += 1
        }
        applyQueueState(result.queue, queueIndexRef.current)
        emitQueueDiagnostic('queue_item_added', { id: song.id, mode: 'playNext', index: result.index })
      }
      return { added: result.added, index: result.index }
    },
    [applyQueueState],
  )

  const removeQueueItem = useCallback(
    (queueIndex: number) => {
      const result = removeAtIndex(queueRef.current, queueIndexRef.current, queueIndex)
      if (result.queue === queueRef.current && !result.removedActive) return

      emitQueueDiagnostic('queue_item_removed', { index: queueIndex, removedActive: result.removedActive })

      if (result.queue.length === 0) {
        applyQueueState([], -1)
        mediaResolveGenerationRef.current += 1
        cancelUpgradeSession()
        if (activeMediaRef.current === 'video') {
          getVideoService().stop()
          activeMediaRef.current = 'audio'
        } else {
          getService().stop()
        }
        currentTrackRef.current = null
        setCurrentTrack(null)
        setIsPlaying(false)
        setIsLoading(false)
        setError(null)
        emitPositionSeconds(0, true)
        setDurationSeconds(0)
        return
      }

      if (result.removedActive) {
        applyQueueState(result.queue, result.activeIndex)
        const nextSong = result.queue[result.activeIndex]
        if (nextSong) {
          playSong(nextSong)
        } else {
          mediaResolveGenerationRef.current += 1
          cancelUpgradeSession()
          if (activeMediaRef.current === 'video') {
            getVideoService().stop()
            activeMediaRef.current = 'audio'
          } else {
            getService().stop()
          }
          currentTrackRef.current = null
          setCurrentTrack(null)
          setIsPlaying(false)
          setIsLoading(false)
        }
        return
      }

      applyQueueState(result.queue, result.activeIndex)
    },
    [applyQueueState, cancelUpgradeSession, emitPositionSeconds, getService, getVideoService, playSong],
  )

  const moveQueueItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      const result = moveIndex(queueRef.current, queueIndexRef.current, fromIndex, toIndex)
      applyQueueState(result.queue, result.activeIndex)
      emitQueueDiagnostic('queue_reordered', { fromIndex, toIndex })
    },
    [applyQueueState],
  )

  const next = useCallback(() => {
    const active = currentTrackRef.current
    if (isTvQueueSong(active) && tvChannelSwitchInFlightRef.current) return

    const queue = queueRef.current
    const startIndex = queueIndexRef.current + 1
    if (startIndex >= queue.length) {
      // Mobile nextSong at end: try smart continuation for unbounded contexts.
      const extendedQueue = extendQueueIfNeeded(queue, queueIndexRef.current, {
        reason: 'exhaustion',
      })
      if (startIndex < extendedQueue.length) {
        const playableIndex = findNextAutoAdvanceIndex(extendedQueue, startIndex)
        if (playableIndex < 0) {
          setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
          return
        }
        if (isTvQueueSong(extendedQueue[playableIndex]) || isTvQueueSong(active)) {
          tvChannelSwitchInFlightRef.current = true
          tvFailSkipCountRef.current = 0
          tvAutoAdvanceOnFailRef.current = 'forward'
        }
        commitActiveQueueTrack(extendedQueue, playableIndex)
        playSong(extendedQueue[playableIndex])
        return
      }

      if (repeatModeRef.current === 'all' && queue.length > 0) {
        const playableIndex = findNextAutoAdvanceIndex(queue, 0)
        if (playableIndex < 0) {
          setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
          return
        }
        if (isTvQueueSong(queue[playableIndex]) || isTvQueueSong(active)) {
          tvChannelSwitchInFlightRef.current = true
          tvFailSkipCountRef.current = 0
          tvAutoAdvanceOnFailRef.current = 'forward'
        }
        commitActiveQueueTrack(queue, playableIndex)
        playSong(queue[playableIndex])
      }
      return
    }

    const playableIndex = findNextAutoAdvanceIndex(queue, startIndex)
    if (playableIndex < 0) {
      setError(MATURE_CONTENT_RESTRICTED_MESSAGE)
      return
    }

    if (isTvQueueSong(queue[playableIndex]) || isTvQueueSong(active)) {
      tvChannelSwitchInFlightRef.current = true
      tvFailSkipCountRef.current = 0
      tvAutoAdvanceOnFailRef.current = 'forward'
    }
    commitActiveQueueTrack(queue, playableIndex)
    playSong(queue[playableIndex])
  }, [commitActiveQueueTrack, extendQueueIfNeeded, playSong])

  const previous = useCallback(() => {
    const track = currentTrackRef.current
    if (isTvQueueSong(track) && tvChannelSwitchInFlightRef.current) return
    const caps = resolvePlaybackCapabilities(track)

    // Live / non-seekable: never fake-restart; walk previous queue item only.
    if (track && !caps.seek && caps.isLive) {
      const queue = queueRef.current
      const previousIndex = queueIndexRef.current - 1
      if (previousIndex < 0) {
        if (repeatModeRef.current === 'all' && queue.length > 1 && caps.previous) {
          const lastIndex = queue.length - 1
          if (isTvQueueSong(queue[lastIndex]) || isTvQueueSong(track)) {
            tvChannelSwitchInFlightRef.current = true
            tvFailSkipCountRef.current = 0
            tvAutoAdvanceOnFailRef.current = 'backward'
          }
          commitActiveQueueTrack(queue, lastIndex)
          playSong(queue[lastIndex])
        }
        return
      }
      if (!caps.previous) return
      if (isTvQueueSong(queue[previousIndex]) || isTvQueueSong(track)) {
        tvChannelSwitchInFlightRef.current = true
        tvFailSkipCountRef.current = 0
        tvAutoAdvanceOnFailRef.current = 'backward'
      }
      commitActiveQueueTrack(queue, previousIndex)
      playSong(queue[previousIndex])
      return
    }

    // Finite media: one consistent restart threshold (3s) across Music / Podcast /
    // Audiobook / Motivational / Lecture (and downloaded finite audio of those families).
    if (
      track
      && caps.seek
      && positionSecondsRef.current > QUEUE_PREVIOUS_RESTART_SECONDS
    ) {
      if (isMotivationalVideoSong(track) || isLectureVideoSong(track)) {
        getVideoService().getVideoElement().currentTime = 0
      } else {
        getService().seekTo(0)
      }
      emitPositionSeconds(0, true)
      if (isAudiobookQueueSong(track)) flushAudiobookProgressRef.current(true)
      if (isMotivationalQueueSong(track)) flushMotivationalProgressRef.current(true)
      if (isLectureQueueSong(track)) flushLectureProgressRef.current(true)
      if (isPodcastQueueSong(track)) flushPodcastProgressRef.current(true)
      if (isMusicCatalogSong(track)) flushMusicProgressRef.current(true)
      return
    }

    if (!caps.previous) return

    const queue = queueRef.current
    const previousIndex = queueIndexRef.current - 1
    if (previousIndex < 0) {
      if (repeatModeRef.current === 'all' && queue.length > 1) {
        const lastIndex = queue.length - 1
        commitActiveQueueTrack(queue, lastIndex)
        playSong(queue[lastIndex])
      }
      return
    }
    if (previousIndex >= queue.length) return

    commitActiveQueueTrack(queue, previousIndex)
    playSong(queue[previousIndex])
  }, [commitActiveQueueTrack, emitPositionSeconds, getService, getVideoService, playSong])

  const getUpcomingTracks = useCallback(() => {
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex <= 0) return []
    return queueRef.current.slice(nextIndex)
  }, [])

  const playQueueAtIndex = useCallback(
    (index: number) => {
      const queue = queueRef.current
      if (index < 0 || index >= queue.length) return
      commitActiveQueueTrack(queue, index)
      playSong(queue[index])
    },
    [commitActiveQueueTrack, playSong],
  )

  const clearUpcomingQueue = useCallback(() => {
    const queue = queueRef.current
    const index = queueIndexRef.current
    if (index < 0 || index >= queue.length - 1) return

    const trimmed = queue.slice(0, index + 1)
    queueRef.current = trimmed
    queueSeedTracksRef.current = trimmed
    queueSeedTypeRef.current = 'manual'
    queueSeedBoundedRef.current = true
    smartContinuationStartRef.current = -1
    setCurrentQueue(trimmed)
    setQueueContextState('manual')
    setQueueSeedType('manual')
  }, [setQueueContextState])

  const toggleShuffle = useCallback(() => {
    if (queueContextRef.current === 'audiobook') return
    if (queueContextRef.current === 'motivational') return
    if (queueContextRef.current === 'lecture') return

    setShuffleEnabled((enabled) => {
      const next = !enabled
      const queue = queueRef.current
      const index = queueIndexRef.current
      if (next && queue.length > 1 && index >= 0) {
        const upcoming = queue.slice(index + 1)
        if (upcoming.length > 1) {
          const reshuffled = [...queue.slice(0, index + 1), ...shuffleSongs(upcoming)]
          queueRef.current = reshuffled
          setCurrentQueue(reshuffled)
        }
      } else if (!next && unshuffledQueueRef.current.length > 0) {
        const currentId = queue[index]?.id
        const restored = unshuffledQueueRef.current
        const restoredIndex = currentId
          ? restored.findIndex((song) => song.id === currentId)
          : index
        if (restoredIndex >= 0) {
          queueRef.current = restored
          queueIndexRef.current = restoredIndex
          setCurrentQueue(restored)
          setCurrentIndex(restoredIndex)
        }
      }
      return next
    })
  }, [])

  const toggleRepeat = useCallback(() => {
    setRepeatMode((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'))
  }, [])

  const pause = useCallback(() => {
    cancelUpgradeSession()
    if (activeMediaRef.current === 'video') {
      getVideoService().pause()
      return
    }
    getService().pause()
  }, [cancelUpgradeSession, getService, getVideoService])

  const resume = useCallback(() => {
    if (!currentTrack) {
      setError('Unable to play this track.')
      return
    }

    if (usesDesktopVideoPath(currentTrack)) {
      const streamUrl = currentTrack.audioUrl?.trim() || currentTrack.previewUrl?.trim() || ''
      if (!isPlayableMediaUrl(streamUrl)) {
        setError(
          isTvQueueSong(currentTrack)
            ? 'Unable to play this TV channel.'
            : isMotivationalVideoSong(currentTrack)
              ? 'Unable to play this motivational video.'
              : 'Unable to play this lecture video.',
        )
        return
      }
      setIsLoading(true)
      void getVideoService()
        .resume()
        .catch(() => {
          setIsPlaying(false)
          setIsLoading(false)
          setError(
            isTvQueueSong(currentTrack)
              ? 'Unable to resume TV playback.'
              : isMotivationalVideoSong(currentTrack)
                ? 'Unable to resume motivational video playback.'
                : 'Unable to resume lecture video playback.',
          )
        })
      return
    }

    if (!selectPlayableUrlForQualityMode(currentTrack, audioQualityMode)) {
      setError('Unable to play this track.')
      return
    }

    setIsLoading(true)
    void getService()
      .resume()
      .catch(() => {
        setIsPlaying(false)
        setIsLoading(false)
        cancelUpgradeSession()
        setError('Unable to resume playback.')
      })
  }, [audioQualityMode, cancelUpgradeSession, currentTrack, getService, getVideoService])

  const seekTo = useCallback(
    (seconds: number) => {
      if (!currentTrack || !Number.isFinite(seconds)) return

      // Live / non-seekable owners
      if (isRadioQueueSong(currentTrack) || isTvQueueSong(currentTrack) || isSportsQueueSong(currentTrack)) {
        emitQueueDiagnostic('player_seek_rejected', {
          id: currentTrack.id,
          reason: 'live-or-non-seekable',
        })
        return
      }

      if (usesDesktopVideoPath(currentTrack)) {
        const video = getVideoService().getVideoElement()
        const max =
          durationSeconds > 0
            ? durationSeconds
            : video.duration
        if (!Number.isFinite(max) || max <= 0) return

        const clamped = Math.min(max, Math.max(0, seconds))
        video.currentTime = clamped
        emitPositionSeconds(clamped, true)
        if (isLectureQueueSong(currentTrack)) {
          flushLectureProgressRef.current(true)
        }
        if (isMotivationalQueueSong(currentTrack)) {
          flushMotivationalProgressRef.current(true)
        }
        return
      }

      const max =
        durationSeconds > 0
          ? durationSeconds
          : getService().getAudioElement().duration
      if (!Number.isFinite(max) || max <= 0) return

      const clamped = Math.min(max, Math.max(0, seconds))
      getService().seekTo(clamped)
      emitPositionSeconds(clamped, true)
      if (isAudiobookQueueSong(currentTrack)) {
        flushAudiobookProgressRef.current(true)
      }
      if (isPodcastQueueSong(currentTrack)) {
        flushPodcastProgressRef.current(true)
      }
      if (isLectureQueueSong(currentTrack)) {
        flushLectureProgressRef.current(true)
      }
      if (isMotivationalQueueSong(currentTrack)) {
        flushMotivationalProgressRef.current(true)
      }
      if (isMusicCatalogSong(currentTrack)) {
        flushMusicProgressRef.current(true)
      }
    },
    [currentTrack, durationSeconds, emitPositionSeconds, getService, getVideoService],
  )

  const skipRelative = useCallback(
    (deltaSeconds: number) => {
      if (!Number.isFinite(deltaSeconds)) return
      const base = positionSecondsRef.current
      seekTo(base + deltaSeconds)
    },
    [seekTo],
  )

  const handleAudiobookPlaybackRate = useCallback(
    (rate: AudiobookPlaybackRate) => {
      setAudiobookPlaybackRate(rate)
      if (isAudiobookQueueSong(currentTrackRef.current)) {
        getService().setPlaybackRate(rate)
      }
    },
    [getService, setAudiobookPlaybackRate],
  )

  const setVolume = useCallback(
    (nextVolume: number) => {
      if (!Number.isFinite(nextVolume)) return
      const clamped = Math.min(1, Math.max(0, nextVolume))
      if (activeMediaRef.current === 'video') {
        getVideoService().setVolume(clamped)
      } else {
        getService().setVolume(clamped)
      }
      setVolumeState(clamped)
    },
    [getService, getVideoService],
  )

  const stopPlayback = useCallback(() => {
    cancelUpgradeSession()
    clearTvChannelSwitchState()
    if (document.pictureInPictureElement) {
      void document.exitPictureInPicture().catch(() => undefined)
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }

    if (activeMediaRef.current === 'video') {
      getVideoService().stop()
      activeMediaRef.current = 'audio'
    } else {
      getService().stop()
    }

    setIsPlaying(false)
    setIsLoading(false)
    setError(null)
    emitPositionSeconds(0, true)
    setDurationSeconds(0)
    currentTrackRef.current = null
    setCurrentTrack(null)
  }, [cancelUpgradeSession, clearTvChannelSwitchState, emitPositionSeconds, getService, getVideoService])

  const clearQueue = useCallback(() => {
    emitQueueDiagnostic('queue_cleared', { previousLength: queueRef.current.length })
    applyQueueState([], -1)
    unshuffledQueueRef.current = []
    queueSeedTracksRef.current = []
    setQueueTitle(undefined)
    setQueueContextState('manual')
    stopPlayback()
    clearPersistedQueue()
  }, [applyQueueState, setQueueContextState, stopPlayback])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (new URLSearchParams(window.location.search).get('visualAudit') !== 'home') return

    const auditWindow = window as typeof window & {
      __HT_HOME_VISUAL_AUDIT__?: { stop: () => void }
    }
    auditWindow.__HT_HOME_VISUAL_AUDIT__ = { stop: stopPlayback }
    return () => {
      delete auditWindow.__HT_HOME_VISUAL_AUDIT__
    }
  }, [stopPlayback])

  const mountTvVideo = useCallback((container: HTMLElement | null) => {
    getVideoService().mount(container)
  }, [getVideoService])

  useEffect(() => {
    return bindMediaSessionActions({
      play: () => {
        void resume()
      },
      pause: () => {
        pause()
      },
      previoustrack: () => {
        previous()
      },
      nexttrack: () => {
        next()
      },
      seekbackward: (details) => {
        skipRelative(-(details.seekOffset ?? 10))
      },
      seekforward: (details) => {
        skipRelative(details.seekOffset ?? 10)
      },
      seekto: (details) => {
        if (typeof details.seekTime === 'number') {
          seekTo(details.seekTime)
        }
      },
    })
  }, [next, pause, previous, resume, seekTo, skipRelative])

  useEffect(() => {
    const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      if (target.isContentEditable) return true
      return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'))
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableKeyboardTarget(event.target)) return

      const caps = resolvePlaybackCapabilities(currentTrackRef.current)
      if (event.code === 'Space' || event.key === ' ') {
        if (!currentTrackRef.current) return
        event.preventDefault()
        if (isPlayingRef.current) pause()
        else void resume()
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'MediaTrackNext') {
        if (!caps.next) return
        event.preventDefault()
        next()
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'MediaTrackPrevious') {
        if (!caps.previous) return
        event.preventDefault()
        previous()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [next, pause, previous, resume])

  useEffect(() => {
    updateMediaSessionMetadata(currentTrack)
  }, [currentTrack])

  useEffect(() => {
    updateMediaSessionPlaybackState(isPlaying)
  }, [isPlaying])

  useEffect(() => {
    updateMediaSessionPositionState({
      duration: durationSeconds,
      position: positionSeconds,
    })
  }, [durationSeconds, isPlaying, positionSeconds])

  const value = useMemo<DesktopPlaybackContextValue>(
    () => ({
      currentTrack,
      currentQueue,
      currentIndex,
      queueContext,
      queueSeedType,
      queueSeedId,
      queueTitle,
      isPlaying,
      isLoading,
      error,
      volume,
      audioQualityMode,
      shuffleEnabled,
      repeatMode,
      audiobookPlaybackRate,
      playTrack,
      playQueue,
      playNow,
      enqueue,
      playNext: playNextSong,
      removeQueueItem,
      moveQueueItem,
      clearQueue,
      next,
      previous,
      getUpcomingTracks,
      playQueueAtIndex,
      clearUpcomingQueue,
      toggleShuffle,
      toggleRepeat,
      pause,
      resume,
      seekTo,
      skipRelative,
      setVolume,
      setAudioQualityMode,
      setAudiobookPlaybackRate: handleAudiobookPlaybackRate,
      stopPlayback,
      mountTvVideo,
    }),
    [
      currentTrack,
      currentQueue,
      currentIndex,
      queueContext,
      queueSeedType,
      queueSeedId,
      queueTitle,
      isPlaying,
      isLoading,
      error,
      volume,
      audioQualityMode,
      shuffleEnabled,
      repeatMode,
      audiobookPlaybackRate,
      playTrack,
      playQueue,
      playNow,
      enqueue,
      playNextSong,
      removeQueueItem,
      moveQueueItem,
      clearQueue,
      next,
      previous,
      getUpcomingTracks,
      playQueueAtIndex,
      clearUpcomingQueue,
      toggleShuffle,
      toggleRepeat,
      pause,
      resume,
      seekTo,
      skipRelative,
      setVolume,
      setAudioQualityMode,
      handleAudiobookPlaybackRate,
      stopPlayback,
      mountTvVideo,
    ],
  )

  const progressValue = useMemo<DesktopPlaybackProgressState>(
    () => ({
      positionSeconds,
      durationSeconds,
    }),
    [durationSeconds, positionSeconds],
  )

  return (
    <DesktopPlaybackContext.Provider value={value}>
      <DesktopPlaybackProgressContext.Provider value={progressValue}>
        {children}
      </DesktopPlaybackProgressContext.Provider>
    </DesktopPlaybackContext.Provider>
  )
}
