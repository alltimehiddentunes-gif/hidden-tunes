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
  usePersistedPreference,
  type AudioQualityMode,
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
import { HtmlAudioPlaybackService } from '../lib/desktopPlayback/HtmlAudioPlaybackService'
import { buildRelatedQueue } from '../lib/desktopPlayback/queueIntelligence'
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

const POSITION_UI_THROTTLE_MS = 250

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
  if (isPodcastQueueSong(song)) {
    return 'This podcast episode is unavailable right now.'
  }
  return 'Unable to play this track.'
}

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

export function DesktopPlaybackProvider({ children }: { children: ReactNode }) {
  const serviceRef = useRef<HtmlAudioPlaybackService | null>(null)
  const queueRef = useRef<ApiSong[]>([])
  const queueIndexRef = useRef(-1)
  const queueSeedTypeRef = useRef<QueueSeedType>(DEFAULT_QUEUE_SEED_TYPE)
  const queueSeedIdRef = useRef<string | undefined>(undefined)
  const queueSeedTracksRef = useRef<ApiSong[]>([])
  const queueCandidatePoolsRef = useRef<QueueCandidatePools | undefined>(undefined)
  const playSongRef = useRef<(song: ApiSong) => void>(() => undefined)
  const flushPodcastProgressRef = useRef<(force?: boolean) => void>(() => undefined)
  const currentTrackRef = useRef<ApiSong | null>(null)
  const audioQualityModeRef = useRef<AudioQualityMode>('auto')
  const upgradeSessionRef = useRef<UpgradeSession | null>(null)
  const upgradeSessionIdRef = useRef(0)
  const unshuffledQueueRef = useRef<ApiSong[]>([])
  const shuffleEnabledRef = useRef(false)
  const repeatModeRef = useRef<'off' | 'all' | 'one'>('off')
  const mediaResolveGenerationRef = useRef(0)
  const podcastProgressTrackIdRef = useRef<string | null>(null)
  const podcastProgressLastWriteRef = useRef(0)
  const podcastProgressLastPositionRef = useRef(0)

  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new HtmlAudioPlaybackService()
    }
    return serviceRef.current
  }, [])

  const [currentTrack, setCurrentTrack] = useState<ApiSong | null>(null)
  const [currentQueue, setCurrentQueue] = useState<ApiSong[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [queueContext, setQueueContext] = useState<QueueContext>(DEFAULT_QUEUE_CONTEXT)
  const [queueSeedType, setQueueSeedType] = useState<QueueSeedType>(DEFAULT_QUEUE_SEED_TYPE)
  const [queueSeedId, setQueueSeedId] = useState<string | undefined>(undefined)
  const [queueTitle, setQueueTitle] = useState<string | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
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

  const applyQueueState = useCallback((queue: ApiSong[], index: number) => {
    queueRef.current = queue
    queueIndexRef.current = index
    setCurrentQueue(queue)
    setCurrentIndex(index)
  }, [])

  const extendQueueIfNeeded = useCallback((queue: ApiSong[], index: number) => {
    if (
      queue.length === 0 ||
      index !== queue.length - 1 ||
      queueSeedTypeRef.current === 'manual'
    ) {
      return queue
    }

    const started = performance.now()
    const { relatedTracks, inspectedCount } = buildRelatedQueue(
      queue,
      queueSeedTypeRef.current,
      queueSeedIdRef.current,
      queueSeedTracksRef.current,
      queueCandidatePoolsRef.current,
    )
    if (relatedTracks.length === 0) return queue

    logQueueExtension({
      seedType: queueSeedTypeRef.current,
      addedCount: relatedTracks.length,
      durationMs: Math.round(performance.now() - started),
      inspectedCount,
    })

    const extendedQueue = [...queue, ...relatedTracks]
    queueRef.current = extendedQueue
    setCurrentQueue(extendedQueue)
    return extendedQueue
  }, [])

  const startPlayback = useCallback(
    (song: ApiSong) => {
      const service = getService()
      cancelUpgradeSession('upgrade-cancelled-session-replaced', 'new-track-playback')
      const selection = selectPlayableUrlForQualityMode(song, audioQualityMode)
      const instantUrl = selection?.url ?? null
      const upgradeTarget =
        isPodcastQueueSong(song) || isRadioQueueSong(song)
          ? null
          : resolveUpgradeTargetForQualityMode(
              song,
              selection,
              audioQualityMode,
            )

      if (selection) {
        logAudioVersionSelection({
          selectedTier: selection.tier,
          qualityMode: audioQualityMode,
          ...audioVersionAvailability(song.audioVersions),
        })
      }

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
        : null

      setIsLoading(true)
      void service
        .play(instantUrl, { instant: true })
        .then(() => {
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
            selection
            && upgradeTarget
            && !isPodcastQueueSong(song)
            && !isRadioQueueSong(song)
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
          setError(message || playbackErrorMessage(song))
        })
    },
    [audioQualityMode, cancelUpgradeSession, emitPositionSeconds, getService],
  )

  const playSong = useCallback(
    (song: ApiSong) => {
      const generation = ++mediaResolveGenerationRef.current

      void (async () => {
        let resolvedSong = song

        if (isRadioQueueSong(song)) {
          const hasStream = Boolean(
            song.audioUrl?.startsWith('http') || song.previewUrl?.startsWith('http'),
          )
          if (!hasStream) {
            const stationId = extractRadioStationId(song.id)
            if (!stationId) {
              setError('Unable to play this station.')
              return
            }

            setIsLoading(true)
            setError(null)

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
        }

        if (isPodcastQueueSong(song)) {
          const hasAudio = Boolean(
            song.audioUrl?.startsWith('http') || song.previewUrl?.startsWith('http'),
          )
          if (!hasAudio) {
            const episodeId = extractPodcastEpisodeId(song.id)
            if (!episodeId) {
              setError('Unable to play this podcast episode.')
              return
            }

            setIsLoading(true)
            setError(null)

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
        }

        if (generation !== mediaResolveGenerationRef.current) return
        if (currentTrackRef.current?.id !== song.id) return

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
        } else {
          podcastProgressTrackIdRef.current = null
        }

        startPlayback(resolvedSong)
      })()
    },
    [startPlayback],
  )

  useEffect(() => {
    playSongRef.current = playSong
  }, [playSong])

  useEffect(() => {
    flushPodcastProgressRef.current = flushPodcastProgress
  }, [flushPodcastProgress])

  useEffect(() => {
    const onBeforeUnload = () => {
      flushPodcastProgressRef.current(true)
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
    }
    const onPlay = () => {
      setIsPlaying(true)
      setIsLoading(false)
      setError(null)
    }
    const onPause = () => {
      setIsPlaying(false)
      flushPodcastProgressRef.current(true)
      if (!audio.ended && !upgradeSessionRef.current?.attempted) {
        cancelUpgradeSession('upgrade-cancelled-pause', 'playback-paused-before-upgrade')
      }
    }
    const onWaiting = () => {
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

      cancelUpgradeSession('upgrade-cancelled-track-changed', 'track-ended')
      const queue = queueRef.current
      const currentIndexValue = queueIndexRef.current

      if (repeatModeRef.current === 'one' && currentIndexValue >= 0 && queue[currentIndexValue]) {
        playSongRef.current(queue[currentIndexValue])
        return
      }

      const nextIndex = currentIndexValue + 1

      if (nextIndex < queue.length) {
        queueIndexRef.current = nextIndex
        setCurrentIndex(nextIndex)
        const extendedQueue = extendQueueIfNeeded(queue, nextIndex)
        playSongRef.current(extendedQueue[nextIndex])
        return
      }

      const extendedQueue = extendQueueIfNeeded(queue, queueIndexRef.current)
      if (nextIndex < extendedQueue.length) {
        queueIndexRef.current = nextIndex
        setCurrentIndex(nextIndex)
        playSongRef.current(extendedQueue[nextIndex])
        return
      }

      if (repeatModeRef.current === 'all' && queue.length > 0) {
        queueIndexRef.current = 0
        setCurrentIndex(0)
        playSongRef.current(queue[0])
        return
      }

      setIsPlaying(false)
      emitPositionSeconds(0, true)
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
        setError('Station unavailable — trying next.')
        const nextIndex = currentIndexValue + 1
        queueIndexRef.current = nextIndex
        setCurrentIndex(nextIndex)
        currentTrackRef.current = queue[nextIndex]
        setCurrentTrack(queue[nextIndex])
        playSongRef.current(queue[nextIndex])
        return
      }

      if (track && isPodcastQueueSong(track)) {
        flushPodcastProgressRef.current(true)
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
  }, [cancelUpgradeSession, extendQueueIfNeeded, getService, persistPodcastProgress])

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

      flushPodcastProgress(true)

      const safeIndex = Math.min(
        playableQueue.length - 1,
        Math.max(0, Number.isFinite(startIndex) ? startIndex : 0),
      )

      unshuffledQueueRef.current = playableQueue
      let resolvedQueue = playableQueue
      let resolvedIndex = safeIndex
      if (shuffleEnabledRef.current && playableQueue.length > 1) {
        resolvedQueue = shuffleQueueFromIndex(playableQueue, safeIndex)
        resolvedIndex = 0
      }

      const nextSeedType = seedMetadata?.seedType ?? contextToSeedType(context)
      queueSeedTypeRef.current = nextSeedType
      queueSeedIdRef.current = seedMetadata?.seedId
      queueSeedTracksRef.current = seedMetadata?.seedTracks ?? resolvedQueue
      queueCandidatePoolsRef.current = seedMetadata?.candidatePools

      applyQueueState(resolvedQueue, resolvedIndex)
      currentTrackRef.current = resolvedQueue[resolvedIndex]
      setCurrentTrack(resolvedQueue[resolvedIndex])
      setQueueContext(context)
      setQueueSeedType(nextSeedType)
      setQueueSeedId(seedMetadata?.seedId)
      setQueueTitle(nextQueueTitle)
      extendQueueIfNeeded(resolvedQueue, resolvedIndex)
      playSong(resolvedQueue[resolvedIndex])
    },
    [applyQueueState, extendQueueIfNeeded, flushPodcastProgress, playSong],
  )

  const playTrack = useCallback(
    (song: ApiSong) => {
      playQueue([song], 0, DEFAULT_QUEUE_CONTEXT)
    },
    [playQueue],
  )

  const next = useCallback(() => {
    const queue = queueRef.current
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex >= queue.length) {
      if (repeatModeRef.current === 'all' && queue.length > 0) {
        applyQueueState(queue, 0)
        playSong(queue[0])
      }
      return
    }

    applyQueueState(queue, nextIndex)
    const extendedQueue = extendQueueIfNeeded(queue, nextIndex)
    playSong(extendedQueue[nextIndex])
  }, [applyQueueState, extendQueueIfNeeded, playSong])

  const previous = useCallback(() => {
    const queue = queueRef.current
    const previousIndex = queueIndexRef.current - 1
    if (previousIndex < 0) {
      if (repeatModeRef.current === 'all' && queue.length > 1) {
        const lastIndex = queue.length - 1
        applyQueueState(queue, lastIndex)
        extendQueueIfNeeded(queue, lastIndex)
        playSong(queue[lastIndex])
      }
      return
    }
    if (previousIndex >= queue.length) return

    applyQueueState(queue, previousIndex)
    extendQueueIfNeeded(queue, previousIndex)
    playSong(queue[previousIndex])
  }, [applyQueueState, extendQueueIfNeeded, playSong])

  const getUpcomingTracks = useCallback(() => {
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex <= 0) return []
    return queueRef.current.slice(nextIndex)
  }, [])

  const playQueueAtIndex = useCallback(
    (index: number) => {
      const queue = queueRef.current
      if (index < 0 || index >= queue.length) return
      applyQueueState(queue, index)
      extendQueueIfNeeded(queue, index)
      playSong(queue[index])
    },
    [applyQueueState, extendQueueIfNeeded, playSong],
  )

  const clearUpcomingQueue = useCallback(() => {
    const queue = queueRef.current
    const index = queueIndexRef.current
    if (index < 0 || index >= queue.length - 1) return

    const trimmed = queue.slice(0, index + 1)
    queueRef.current = trimmed
    queueSeedTracksRef.current = trimmed
    queueSeedTypeRef.current = 'manual'
    setCurrentQueue(trimmed)
    setQueueContext('manual')
    setQueueSeedType('manual')
  }, [])

  const toggleShuffle = useCallback(() => {
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
    getService().pause()
  }, [cancelUpgradeSession, getService])

  const resume = useCallback(() => {
    if (!currentTrack || !selectPlayableUrlForQualityMode(currentTrack, audioQualityMode)) {
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
  }, [audioQualityMode, cancelUpgradeSession, currentTrack, getService])

  const seekTo = useCallback(
    (seconds: number) => {
      if (!currentTrack || !Number.isFinite(seconds)) return

      const max =
        durationSeconds > 0
          ? durationSeconds
          : getService().getAudioElement().duration
      if (!Number.isFinite(max) || max <= 0) return

      const clamped = Math.min(max, Math.max(0, seconds))
      getService().seekTo(clamped)
      emitPositionSeconds(clamped, true)
    },
    [currentTrack, durationSeconds, emitPositionSeconds, getService],
  )

  const setVolume = useCallback(
    (nextVolume: number) => {
      if (!Number.isFinite(nextVolume)) return
      const clamped = Math.min(1, Math.max(0, nextVolume))
      getService().setVolume(clamped)
      setVolumeState(clamped)
    },
    [getService],
  )

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
      playTrack,
      playQueue,
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
      setVolume,
      setAudioQualityMode,
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
      playTrack,
      playQueue,
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
      setVolume,
      setAudioQualityMode,
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
