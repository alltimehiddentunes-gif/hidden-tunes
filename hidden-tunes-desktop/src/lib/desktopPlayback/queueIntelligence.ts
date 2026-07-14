import type { ApiSong } from '../api'
import {
  CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT,
  inferSongGenre,
  normalizeLookupKey,
} from '../catalogIndexes'
import type { QueueCandidatePools, QueueSeedType } from './types'

const RELATED_LIMIT = 5

function stableSongCompare(a: ApiSong, b: ApiSong) {
  const aTime = a.createdAt ? Date.parse(a.createdAt) : 0
  const bTime = b.createdAt ? Date.parse(b.createdAt) : 0
  if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
    return bTime - aTime
  }

  const titleCompare = a.title.localeCompare(b.title)
  if (titleCompare !== 0) return titleCompare
  return a.id.localeCompare(b.id)
}

function uniqueUnqueuedSongs(currentQueue: ApiSong[], candidates: ApiSong[]) {
  const queuedIds = new Set(currentQueue.map((song) => song.id))
  const seenIds = new Set<string>()
  const unqueued: ApiSong[] = []

  for (const song of candidates) {
    if (queuedIds.has(song.id) || seenIds.has(song.id)) continue
    seenIds.add(song.id)
    unqueued.push(song)
    if (unqueued.length >= RELATED_LIMIT) break
  }

  return unqueued
}

function resolveCandidatePool(
  currentQueue: ApiSong[],
  queueSeedType: QueueSeedType,
  queueSeedId: string | undefined,
  seedTracks: ApiSong[],
  pools?: QueueCandidatePools,
) {
  const referenceTrack = currentQueue[currentQueue.length - 1]
  if (!referenceTrack) return { pool: seedTracks, inspectedCount: 0 }

  if (queueSeedType === 'discover' || queueSeedType === 'home') {
    const genre = inferSongGenre(referenceTrack)
    const genrePool = pools?.songsByGenre?.get(genre)
    if (genrePool?.length) {
      return {
        pool: genrePool.slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
        inspectedCount: Math.min(genrePool.length, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
      }
    }
  }

  if (queueSeedType === 'artist') {
    const artistId = queueSeedId ?? referenceTrack.artistId ?? undefined
    const artistPool = artistId ? pools?.songsByArtistId?.get(artistId) : undefined
    if (artistPool?.length) {
      return {
        pool: artistPool.slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
        inspectedCount: Math.min(artistPool.length, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
      }
    }
  }

  if (queueSeedType === 'album') {
    const albumKey = normalizeLookupKey(referenceTrack.album)
    const albumPool = albumKey ? pools?.songsByAlbumName?.get(albumKey) : undefined
    if (albumPool?.length) {
      return {
        pool: albumPool.slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
        inspectedCount: Math.min(albumPool.length, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
      }
    }
  }

  if (queueSeedType === 'mood' && seedTracks.length > 0) {
    return {
      pool: seedTracks.slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
      inspectedCount: Math.min(seedTracks.length, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
    }
  }

  return {
    pool: seedTracks.slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
    inspectedCount: Math.min(seedTracks.length, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT),
  }
}

export function buildRelatedQueue(
  currentQueue: ApiSong[],
  queueSeedType: QueueSeedType,
  queueSeedId?: string,
  seedTracks: ApiSong[] = [],
  pools?: QueueCandidatePools,
) {
  if (queueSeedType === 'manual' || currentQueue.length === 0) {
    return { relatedTracks: [] as ApiSong[], inspectedCount: 0 }
  }

  const { pool, inspectedCount } = resolveCandidatePool(
    currentQueue,
    queueSeedType,
    queueSeedId,
    seedTracks,
    pools,
  )
  if (pool.length === 0) {
    return { relatedTracks: [] as ApiSong[], inspectedCount }
  }

  const referenceTrack = currentQueue[currentQueue.length - 1]

  if (queueSeedType === 'discover' || queueSeedType === 'home') {
    const referenceGenre = inferSongGenre(referenceTrack)
    const relatedTracks = [...pool]
      .sort((a, b) => {
        const aGenreMatch = inferSongGenre(a) === referenceGenre
        const bGenreMatch = inferSongGenre(b) === referenceGenre
        if (aGenreMatch !== bGenreMatch) return aGenreMatch ? -1 : 1
        return stableSongCompare(a, b)
      })
      .slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT)

    return {
      relatedTracks: uniqueUnqueuedSongs(currentQueue, relatedTracks),
      inspectedCount,
    }
  }

  const relatedTracks = pool
    .filter((song) => {
      if (queueSeedType === 'artist') {
        if (queueSeedId && song.artistId === queueSeedId) return true
        return normalizeLookupKey(song.artist) === normalizeLookupKey(referenceTrack.artist)
      }

      if (queueSeedType === 'album') {
        return normalizeLookupKey(song.album) === normalizeLookupKey(referenceTrack.album)
      }

      if (queueSeedType === 'mood') {
        return true
      }

      return false
    })
    .sort(stableSongCompare)
    .slice(0, CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT)

  return {
    relatedTracks: uniqueUnqueuedSongs(currentQueue, relatedTracks),
    inspectedCount,
  }
}
