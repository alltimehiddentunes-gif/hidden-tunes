/**
 * Queue intelligence — thin adapter over mobile-parity smart continuation.
 * Keeps the historical `buildRelatedQueue` name used by DesktopPlaybackProvider
 * while enforcing bounded-context + exhaustion rules in the provider.
 */

import type { ApiSong } from '../api'
import {
  buildSmartContinuation,
  SMART_CONTINUATION_LIMIT,
} from './smartContinuation'
import type { QueueCandidatePools, QueueContext, QueueSeedType } from './types'

export { SMART_CONTINUATION_LIMIT }

export type BuildRelatedQueueOptions = {
  context?: QueueContext
  currentTrack?: ApiSong | null
  /** Mobile parity: when true, do not append smart tracks. */
  bounded?: boolean
}

/**
 * Propose related tracks to append into the existing queue.
 * Does not mutate the queue. Returns [] for manual / bounded / empty cases.
 */
export function buildRelatedQueue(
  currentQueue: ApiSong[],
  queueSeedType: QueueSeedType,
  queueSeedId?: string,
  seedTracks: ApiSong[] = [],
  pools?: QueueCandidatePools,
  options?: BuildRelatedQueueOptions,
) {
  if (currentQueue.length === 0 || options?.context === 'manual-queue') {
    return { relatedTracks: [] as ApiSong[], inspectedCount: 0, reason: 'manual_or_empty' }
  }

  const context = options?.context ?? (
    queueSeedType === 'home'
    || queueSeedType === 'discover'
    || queueSeedType === 'album'
    || queueSeedType === 'artist'
    || queueSeedType === 'mood'
      ? queueSeedType
      : 'manual'
  )

  const result = buildSmartContinuation({
    currentQueue,
    currentTrack: options?.currentTrack ?? currentQueue[currentQueue.length - 1],
    context,
    seedType: queueSeedType,
    seedId: queueSeedId,
    seedTracks,
    pools,
    bounded: options?.bounded,
  })

  return {
    relatedTracks: result.relatedTracks,
    inspectedCount: result.inspectedCount,
    reason: result.reason,
  }
}
