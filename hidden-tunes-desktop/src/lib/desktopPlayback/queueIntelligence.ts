import type { ApiSong } from '../api'
import type { QueueSeedType } from './types'

const RELATED_LIMIT = 5

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

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

function inferGenre(song: ApiSong) {
  const explicitGenre = normalizeKey(song.genre)
  if (explicitGenre) return explicitGenre

  const text = normalizeKey(`${song.title} ${song.album} ${song.artist}`)
  const genreHints: Array<[string, string[]]> = [
    ['country', ['country', 'back road', 'wedding']],
    ['jazz', ['jazz', 'cafe', 'blues', 'soul']],
    ['acoustic', ['acoustic', 'guitar', 'piano']],
    ['gospel', ['worship', 'lord', 'faith']],
    ['amapiano', ['amapiano']],
    ['pop', ['pop', 'party', 'hits']],
    ['ambient', ['ambient', 'calm', 'sleep', 'relax', 'focus', 'chill']],
    ['love', ['love', 'heart', 'miss', 'safe', 'shelter']],
  ]

  for (const [genre, hints] of genreHints) {
    if (hints.some((hint) => text.includes(hint))) return genre
  }

  return 'hidden-tunes'
}

function uniqueUnqueuedSongs(currentQueue: ApiSong[], seedTracks: ApiSong[]) {
  const queuedIds = new Set(currentQueue.map((song) => song.id))
  const seenIds = new Set<string>()
  return seedTracks.filter((song) => {
    if (queuedIds.has(song.id) || seenIds.has(song.id)) return false
    seenIds.add(song.id)
    return true
  })
}

export function buildRelatedQueue(
  currentQueue: ApiSong[],
  queueSeedType: QueueSeedType,
  queueSeedId?: string,
  seedTracks: ApiSong[] = [],
) {
  if (queueSeedType === 'manual' || currentQueue.length === 0) return []

  const referenceTrack = currentQueue[currentQueue.length - 1]
  const candidates = uniqueUnqueuedSongs(currentQueue, seedTracks)
  if (candidates.length === 0) return []

  if (queueSeedType === 'discover' || queueSeedType === 'home') {
    const referenceGenre = inferGenre(referenceTrack)
    return candidates
      .sort((a, b) => {
        const aGenreMatch = inferGenre(a) === referenceGenre
        const bGenreMatch = inferGenre(b) === referenceGenre
        if (aGenreMatch !== bGenreMatch) return aGenreMatch ? -1 : 1
        return stableSongCompare(a, b)
      })
      .slice(0, RELATED_LIMIT)
  }

  const relatedTracks = candidates.filter((song) => {
    if (queueSeedType === 'artist') {
      if (queueSeedId && song.artistId === queueSeedId) return true
      return normalizeKey(song.artist) === normalizeKey(referenceTrack.artist)
    }

    if (queueSeedType === 'album') {
      return normalizeKey(song.album) === normalizeKey(referenceTrack.album)
    }

    if (queueSeedType === 'mood') {
      return true
    }

    return false
  })

  return relatedTracks.sort(stableSongCompare).slice(0, RELATED_LIMIT)
}
