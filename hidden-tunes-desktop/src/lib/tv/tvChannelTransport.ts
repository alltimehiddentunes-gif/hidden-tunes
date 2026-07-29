import type { ApiSong } from '../api'
import { isTvQueueSong } from './tvPlaybackAdapter'

/** Bound for auto-skipping unplayable TV channels during Next/Previous. */
export const TV_CHANNEL_FAIL_SKIP_LIMIT = 5

export type TvChannelTransportAvailability = {
  hasPrevious: boolean
  hasNext: boolean
  canChangeChannel: boolean
}

/**
 * Shared availability for TV Previous/Next on sidebar + footer.
 * Live TV does not wrap unless repeat-all is explicitly on.
 */
export function resolveTvChannelTransportAvailability(input: {
  isActive: boolean
  currentIndex: number
  queueLength: number
  isLoading: boolean
  repeatMode: 'off' | 'all' | 'one'
}): TvChannelTransportAvailability {
  const { isActive, currentIndex, queueLength, isLoading, repeatMode } = input
  if (!isActive || queueLength <= 0 || currentIndex < 0) {
    return { hasPrevious: false, hasNext: false, canChangeChannel: false }
  }

  const hasPrevious = currentIndex > 0 || (repeatMode === 'all' && queueLength > 1)
  const hasNext =
    currentIndex < queueLength - 1 || (repeatMode === 'all' && queueLength > 1)

  return {
    hasPrevious,
    hasNext,
    canChangeChannel: !isLoading,
  }
}

export function resolveTvTransportLabels(song: ApiSong | null | undefined) {
  if (isTvQueueSong(song)) {
    return {
      previous: 'Previous channel',
      previousUnavailable: 'Previous channel unavailable',
      next: 'Next channel',
      nextUnavailable: 'Next channel unavailable',
      play: 'Play',
      pause: 'Pause',
      loading: 'Connecting channel',
    }
  }

  return {
    previous: 'Previous track',
    previousUnavailable: 'Previous track unavailable',
    next: 'Next track',
    nextUnavailable: 'Next track unavailable',
    play: 'Play',
    pause: 'Pause',
    loading: 'Loading track',
  }
}
