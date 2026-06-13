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
import { HtmlAudioPlaybackService } from '../lib/desktopPlayback/HtmlAudioPlaybackService'
import type {
  DesktopPlaybackContextValue,
  QueueContext,
} from '../lib/desktopPlayback/types'

const DesktopPlaybackContext = createContext<DesktopPlaybackContextValue | null>(null)

const DEFAULT_QUEUE_CONTEXT: QueueContext = 'manual'

export function useDesktopPlayback() {
  const value = useContext(DesktopPlaybackContext)
  if (!value) {
    throw new Error('useDesktopPlayback must be used within DesktopPlaybackProvider')
  }
  return value
}

export function DesktopPlaybackProvider({ children }: { children: ReactNode }) {
  const serviceRef = useRef<HtmlAudioPlaybackService | null>(null)
  const queueRef = useRef<ApiSong[]>([])
  const queueIndexRef = useRef(-1)
  const playSongRef = useRef<(song: ApiSong) => void>(() => undefined)

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
  const [queueTitle, setQueueTitle] = useState<string | undefined>(undefined)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [positionSeconds, setPositionSeconds] = useState(0)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [volume, setVolumeState] = useState(1)

  const applyQueueState = useCallback((queue: ApiSong[], index: number) => {
    queueRef.current = queue
    queueIndexRef.current = index
    setCurrentQueue(queue)
    setCurrentIndex(index)
  }, [])

  const playSong = useCallback(
    (song: ApiSong) => {
      const service = getService()
      setCurrentTrack(song)
      setError(null)
      setPositionSeconds(0)
      setDurationSeconds(
        song.durationSeconds != null && song.durationSeconds > 0
          ? song.durationSeconds
          : 0,
      )

      if (!song.audioUrl) {
        service.stop()
        setIsPlaying(false)
        setIsLoading(false)
        setError('Audio unavailable for this track.')
        return
      }

      setIsLoading(true)
      void service.play(song.audioUrl).catch((err) => {
        if (import.meta.env.DEV) {
          console.error('[ht-playback] play() failed', {
            audioUrl: song.audioUrl,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        setIsPlaying(false)
        setIsLoading(false)
        setError('Unable to play this track.')
      })
    },
    [getService],
  )

  useEffect(() => {
    playSongRef.current = playSong
  }, [playSong])

  useEffect(() => {
    const service = getService()
    const audio = service.getAudioElement()

    const syncDuration = () => {
      const fromAudio = audio.duration
      if (Number.isFinite(fromAudio) && fromAudio > 0) {
        setDurationSeconds(fromAudio)
      }
    }

    const onTimeUpdate = () => {
      setPositionSeconds(audio.currentTime)
    }
    const onPlay = () => {
      setIsPlaying(true)
      setIsLoading(false)
      setError(null)
    }
    const onPause = () => {
      setIsPlaying(false)
    }
    const onWaiting = () => {
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
      const queue = queueRef.current
      const nextIndex = queueIndexRef.current + 1

      if (nextIndex < queue.length) {
        queueIndexRef.current = nextIndex
        setCurrentIndex(nextIndex)
        playSongRef.current(queue[nextIndex])
        return
      }

      setIsPlaying(false)
      setPositionSeconds(0)
    }
    const onError = () => {
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
      setError('Unable to play this track.')
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('error', onError)
      service.destroy()
      serviceRef.current = null
    }
  }, [getService])

  const playQueue = useCallback(
    (
      queue: ApiSong[],
      startIndex: number,
      context: QueueContext,
      nextQueueTitle?: string,
    ) => {
      const playableQueue = queue.filter(Boolean)
      if (playableQueue.length === 0) return

      const safeIndex = Math.min(
        playableQueue.length - 1,
        Math.max(0, Number.isFinite(startIndex) ? startIndex : 0),
      )

      applyQueueState(playableQueue, safeIndex)
      setQueueContext(context)
      setQueueTitle(nextQueueTitle)
      playSong(playableQueue[safeIndex])
    },
    [applyQueueState, playSong],
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
    if (nextIndex >= queue.length) return

    applyQueueState(queue, nextIndex)
    playSong(queue[nextIndex])
  }, [applyQueueState, playSong])

  const previous = useCallback(() => {
    const queue = queueRef.current
    const previousIndex = queueIndexRef.current - 1
    if (previousIndex < 0 || previousIndex >= queue.length) return

    applyQueueState(queue, previousIndex)
    playSong(queue[previousIndex])
  }, [applyQueueState, playSong])

  const getUpcomingTracks = useCallback(() => {
    const nextIndex = queueIndexRef.current + 1
    if (nextIndex <= 0) return []
    return queueRef.current.slice(nextIndex)
  }, [])

  const pause = useCallback(() => {
    getService().pause()
  }, [getService])

  const resume = useCallback(() => {
    if (!currentTrack?.audioUrl) {
      setError('Audio unavailable for this track.')
      return
    }

    setIsLoading(true)
    void getService()
      .resume()
      .catch(() => {
        setIsPlaying(false)
        setIsLoading(false)
        setError('Unable to resume playback.')
      })
  }, [currentTrack, getService])

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
      setPositionSeconds(clamped)
    },
    [currentTrack, durationSeconds, getService],
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
      queueTitle,
      isPlaying,
      isLoading,
      error,
      positionSeconds,
      durationSeconds,
      volume,
      playTrack,
      playQueue,
      next,
      previous,
      getUpcomingTracks,
      pause,
      resume,
      seekTo,
      setVolume,
    }),
    [
      currentTrack,
      currentQueue,
      currentIndex,
      queueContext,
      queueTitle,
      isPlaying,
      isLoading,
      error,
      positionSeconds,
      durationSeconds,
      volume,
      playTrack,
      playQueue,
      next,
      previous,
      getUpcomingTracks,
      pause,
      resume,
      seekTo,
      setVolume,
    ],
  )

  return (
    <DesktopPlaybackContext.Provider value={value}>
      {children}
    </DesktopPlaybackContext.Provider>
  )
}
