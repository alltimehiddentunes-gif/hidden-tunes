/**
 * Mobile-parity smart continuation for the existing desktop Queue.
 *
 * Rules (from HiddenTunes-CLEAN PlayerContext):
 * - Only unbounded contexts may append at true queue exhaustion.
 * - Append into the same ApiSong[] queue — never a second store.
 * - Manual / source items already in the queue are never replaced.
 * - Deduplicate by stable catalogue id.
 * - Bound candidate inspect + append size.
 */

import type { ApiSong } from '../api'
import {
  CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT,
  inferSongGenre,
  normalizeLookupKey,
} from '../catalogIndexes'
import { isInternalDevCatalogSong } from '../devAudioVersionTestHarness'
import { isPlayableMediaUrl } from './isPlayableMediaUrl'
import type { QueueCandidatePools, QueueContext, QueueSeedType } from './types'

/** Mobile `extendQueueWithSmartTracks` batch size. */
export const SMART_CONTINUATION_LIMIT = 12
export const SMART_QUEUE_TARGET_UPCOMING = 10
export const SMART_QUEUE_REFILL_THRESHOLD = 3
export const SMART_QUEUE_MAX_ACTIVE = 25
export const SMART_QUEUE_SESSION_DEDUPE_WINDOW = 50

/** Mobile `FINISH_DEBOUNCE_MS` — prevent double ended → next. */
export const ENDED_ADVANCE_DEBOUNCE_MS = 1500

/** Bound consecutive invalid/unavailable skips during auto-next (music only). */
export const AUTO_NEXT_INVALID_SKIP_LIMIT = 8

export type SmartContinuationScore = {
  score: number
  reason: string
}

export type SmartContinuationInput = {
  currentQueue: ApiSong[]
  currentTrack: ApiSong | null | undefined
  context: QueueContext
  seedType: QueueSeedType
  seedId?: string
  seedTracks?: ApiSong[]
  pools?: QueueCandidatePools
  /** Explicit override from play seeding (mobile bounded vs full_catalog). */
  bounded?: boolean
}

export type SmartContinuationResult = {
  relatedTracks: ApiSong[]
  inspectedCount: number
  reason: string
}

function songHasPlayableUrl(song: ApiSong): boolean {
  return (
    isPlayableMediaUrl(song.audioUrl)
    || isPlayableMediaUrl(song.previewUrl)
    || isPlayableMediaUrl(song.highQualityUrl)
  )
}

/**
 * Mobile `isBoundedPlaybackContext`:
 * only `full_catalog` / `radio` / `queue` are unbounded.
 * Desktop maps unbounded full-catalog-style plays via `bounded: false`.
 * Live radio must not receive music smart continuation.
 */
export function isBoundedPlaybackContext(
  context: QueueContext,
  _seedType: QueueSeedType,
  bounded?: boolean,
): boolean {
  if (typeof bounded === 'boolean') return bounded

  // Without an explicit flag, treat every desktop context as bounded
  // (mobile default when source is missing / home_rail / album / artist / …).
  if (
    context === 'radio'
    || context === 'podcast'
    || context === 'audiobook'
    || context === 'motivational'
    || context === 'lecture'
    || context === 'tv'
    || context === 'sports'
    || context === 'scene'
    || context === 'manual-queue'
  ) {
    return true
  }

  // home / discover without explicit unbounded flag → bounded (section rails).
  return false
}

export function canSmartContinueMusicContext(context: QueueContext): boolean {
  return (
    context === 'home'
    || context === 'discover'
    || context === 'smart'
    || context === 'album'
    || context === 'artist'
    || context === 'mood'
    || context === 'genre'
    || context === 'emotional-world'
    || context === 'playlist'
    || context === 'search'
    || context === 'library'
    || context === 'favorites'
    || context === 'history'
    || context === 'downloads'
    || context === 'recommendation'
    || context === 'manual'
  )
}

export function scoreSmartContinuationCandidate(
  song: ApiSong,
  current: ApiSong,
  context: QueueContext,
  seedType: QueueSeedType,
  seedId: string | undefined,
  index: number,
): SmartContinuationScore {
  if (song.id === current.id) {
    return { score: -1, reason: 'same_song' }
  }
  if (isInternalDevCatalogSong(song)) {
    return { score: -1, reason: 'dev_fixture' }
  }
  if (!songHasPlayableUrl(song)) {
    return { score: -1, reason: 'unplayable' }
  }

  const orderBias = Math.max(0, 500 - index)
  const artist = normalizeLookupKey(song.artist)
  const genre = normalizeLookupKey(song.genre) || inferSongGenre(song)
  const mood = normalizeLookupKey(song.mood)
  const album = normalizeLookupKey(song.album)
  const currentArtist = normalizeLookupKey(current.artist)
  const currentGenre = normalizeLookupKey(current.genre) || inferSongGenre(current)
  const currentMood = normalizeLookupKey(current.mood)
  const currentAlbum = normalizeLookupKey(current.album)

  const sameAlbumId =
    Boolean(seedId && seedType === 'album' && song.albumId && seedId === song.albumId)
    || Boolean(current.albumId && song.albumId && current.albumId === song.albumId)
  const sameAlbumTitle =
    Boolean(currentAlbum && album && album === currentAlbum)

  if ((context === 'album' || seedType === 'album') && (sameAlbumId || sameAlbumTitle)) {
    return { score: 100000 + orderBias, reason: 'same_album' }
  }
  if (sameAlbumId || sameAlbumTitle) {
    return { score: 95000 + orderBias, reason: 'same_album' }
  }

  const sameArtistId =
    Boolean(seedId && seedType === 'artist' && song.artistId && seedId === song.artistId)
    || Boolean(current.artistId && song.artistId && current.artistId === song.artistId)
  if ((context === 'artist' || context === 'album' || seedType === 'artist') && sameArtistId) {
    return { score: 80000 + orderBias, reason: 'same_artist' }
  }
  if (currentArtist && artist && artist === currentArtist) {
    return { score: 75000 + orderBias, reason: 'same_artist' }
  }

  if (currentGenre && genre && genre === currentGenre) {
    return { score: 55000 + orderBias, reason: 'same_genre' }
  }

  if (currentMood && mood && mood.includes(currentMood)) {
    return { score: 48000 + orderBias, reason: 'same_mood_room' }
  }

  if (context === 'home' || seedType === 'home') {
    return { score: 100 + orderBias, reason: 'full_catalog_fallback' }
  }

  return { score: 50 + orderBias, reason: 'catalog_fallback' }
}

function resolveCandidatePool(input: SmartContinuationInput): {
  pool: ApiSong[]
  inspectedCount: number
} {
  const {
    currentQueue,
    currentTrack,
    seedType,
    seedId,
    seedTracks = [],
    pools,
  } = input
  const reference = currentTrack ?? currentQueue[currentQueue.length - 1]
  if (!reference) return { pool: [], inspectedCount: 0 }
  const artistId = seedType === 'artist' ? seedId : reference.artistId ?? undefined
  const albumKey = normalizeLookupKey(reference.album)
  const genre = inferSongGenre(reference)
  const preferred = [
    ...(seedTracks.length > 0 ? seedTracks : currentQueue),
    ...(albumKey ? pools?.songsByAlbumName?.get(albumKey) ?? [] : []),
    ...(artistId ? pools?.songsByArtistId?.get(artistId) ?? [] : []),
    ...(genre ? pools?.songsByGenre?.get(genre) ?? [] : []),
    ...Array.from(pools?.songsByGenre?.values() ?? []).flat(),
  ]
  const seen = new Set<string>()
  const fallback = preferred.filter((song) => {
    if (seen.has(song.id)) return false
    seen.add(song.id)
    return true
  })
  return {
    pool: fallback.slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
    inspectedCount: Math.min(fallback.length, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
  }
}

/**
 * Build smart continuation tracks to APPEND to the existing queue.
 * Returns [] when blocked / empty — callers must fail open (stop, do not corrupt queue).
 */
export function buildSmartContinuation(input: SmartContinuationInput): SmartContinuationResult {
  const {
    currentQueue,
    currentTrack,
    context,
    seedType,
    seedId,
    bounded,
  } = input

  if (currentQueue.length === 0) {
    return { relatedTracks: [], inspectedCount: 0, reason: 'empty_queue' }
  }

  if (seedType === 'manual' && context === 'manual-queue') {
    return { relatedTracks: [], inspectedCount: 0, reason: 'manual_seed' }
  }

  if (isBoundedPlaybackContext(context, seedType, bounded)) {
    return { relatedTracks: [], inspectedCount: 0, reason: 'bounded_context' }
  }

  if (!canSmartContinueMusicContext(context)) {
    return { relatedTracks: [], inspectedCount: 0, reason: 'non_music_context' }
  }

  const current = currentTrack ?? currentQueue[currentQueue.length - 1]
  if (!current) {
    return { relatedTracks: [], inspectedCount: 0, reason: 'no_current' }
  }

  const { pool, inspectedCount } = resolveCandidatePool(input)
  if (pool.length === 0) {
    return { relatedTracks: [], inspectedCount, reason: 'empty_pool' }
  }

  const existingIds = new Set(currentQueue.map((song) => song.id))
  existingIds.add(current.id)

  const scored = pool
    .map((song, index) => ({
      song,
      ...scoreSmartContinuationCandidate(song, current, context, seedType, seedId, index),
    }))
    .filter((entry) => entry.score > 0)
    .filter((entry) => !existingIds.has(entry.song.id))
    .sort((left, right) => right.score - left.score)

  const seen = new Set<string>()
  const relatedTracks: ApiSong[] = []
  for (const entry of scored) {
    if (seen.has(entry.song.id)) continue
    seen.add(entry.song.id)
    relatedTracks.push(entry.song)
    if (relatedTracks.length >= SMART_CONTINUATION_LIMIT) break
  }

  if (relatedTracks.length === 0) {
    return {
      relatedTracks: [],
      inspectedCount,
      reason: scored[0]?.reason || 'no_scored_candidates',
    }
  }

  return {
    relatedTracks,
    inspectedCount,
    reason: scored[0]?.reason || 'catalog_fallback',
  }
}

/** True when a music catalogue item is clearly missing a stream URL. */
export function isMusicItemMissingPlayableUrl(song: ApiSong): boolean {
  return !songHasPlayableUrl(song)
}
