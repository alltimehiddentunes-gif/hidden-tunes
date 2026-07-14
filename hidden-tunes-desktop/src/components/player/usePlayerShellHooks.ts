import { useCallback, useEffect, useMemo } from 'react'
import type { ApiSong } from '../../lib/api'
import {
  useDesktopPlayback,
  useDesktopPlaybackProgress,
} from '../../context/DesktopPlaybackProvider'
import { acquirePlayerOverlayScrollLock } from '../../lib/playerOverlayChrome'
import { resolvePlayerShellMetadata } from '../../lib/playerDisplayMetadata'

export function usePlayerShellState(preferredTrack: ApiSong | null = null) {
  const playback = useDesktopPlayback()
  const { positionSeconds, durationSeconds } = useDesktopPlaybackProgress()
  const {
    currentTrack,
    queueTitle,
    audioQualityMode,
    getUpcomingTracks,
  } = playback

  const {
    displayTrack,
    isActive,
    displayTitle,
    displayArtist,
    displayAlbum,
    displayArtwork,
    qualityLabel,
    activeTrackId,
  } = useMemo(
    () => resolvePlayerShellMetadata({
      currentTrack,
      preferredTrack,
      queueTitle,
      audioQualityMode,
    }),
    [audioQualityMode, currentTrack, preferredTrack, queueTitle],
  )

  const liveProgressMax = isActive && durationSeconds > 0 ? durationSeconds : 0
  const liveProgressValue = liveProgressMax > 0 ? Math.min(positionSeconds, liveProgressMax) : 0
  const progressMax = liveProgressMax
  const progressValue = liveProgressValue
  const progressPercent = progressMax > 0
    ? Math.min(100, (progressValue / progressMax) * 100)
    : 0

  return {
    ...playback,
    positionSeconds,
    durationSeconds,
    displayTrack,
    isActive,
    liveProgressMax,
    progressMax,
    progressValue,
    progressPercent,
    displayTitle,
    displayArtist,
    displayAlbum,
    displayArtwork,
    qualityLabel,
    activeTrackId,
    getUpcomingTracks,
  }
}

export function usePlayerShellChrome(onClose: () => void) {
  useEffect(() => acquirePlayerOverlayScrollLock(), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])
}

export function useSeekHandlers(input: {
  isActive: boolean
  isLoading: boolean
  progressMax: number
  progressValue: number
  seekTo: (seconds: number) => void
}) {
  const { isActive, isLoading, progressMax, seekTo } = input

  const resolveSeekSeconds = useCallback(
    (trackEl: HTMLDivElement | null, clientX: number) => {
      if (!trackEl || progressMax <= 0) return null
      const rect = trackEl.getBoundingClientRect()
      if (rect.width <= 0) return null
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * progressMax
    },
    [progressMax],
  )

  return {
    canSeek: isActive && progressMax > 0 && !isLoading,
    resolveSeekSeconds,
    seekTo,
  }
}

export function useVolumeHandlers(setVolume: (value: number) => void) {
  const resolveVolume = useCallback((trackEl: HTMLDivElement | null, clientX: number) => {
    if (!trackEl) return null
    const rect = trackEl.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio
  }, [])

  return { resolveVolume, setVolume }
}
