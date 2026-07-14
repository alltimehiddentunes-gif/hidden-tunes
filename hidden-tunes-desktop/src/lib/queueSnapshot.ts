import type { ApiSong } from './api'
import { inferSongGenre, normalizeLookupKey } from './catalogIndexes'

export type QueueNeighborContinuity = {
  matchesPrevious: boolean
  matchesNext: boolean
}

export type QueueArtistContinuity = QueueNeighborContinuity & {
  upcomingCount: number
  dominantArtist: string | null
}

export type QueueAlbumContinuity = QueueNeighborContinuity & {
  upcomingCount: number
  dominantAlbum: string | null
}

export type QueueRepeatSignal = {
  key: string
  label: string
  count: number
}

export type QueueContentHints = {
  moods: string[]
  genres: string[]
  tags: string[]
}

export type QueueSnapshot = {
  currentTrack: ApiSong
  previousTrack: ApiSong | null
  nextTrack: ApiSong | null
  currentIndex: number
  totalCount: number
  remainingCount: number
  artistContinuity: QueueArtistContinuity
  albumContinuity: QueueAlbumContinuity
  repeatedArtists: QueueRepeatSignal[]
  repeatedAlbums: QueueRepeatSignal[]
  contentHints: QueueContentHints
}

export type QueueSnapshotInput = {
  queue: ApiSong[]
  currentIndex: number
  currentTrack?: ApiSong | null
}

function songsShareArtist(a: ApiSong, b: ApiSong) {
  if (a.artistId && b.artistId) return a.artistId === b.artistId
  const aKey = normalizeLookupKey(a.artist)
  const bKey = normalizeLookupKey(b.artist)
  return Boolean(aKey && bKey && aKey === bKey)
}

function songsShareAlbum(a: ApiSong, b: ApiSong) {
  if (a.albumId && b.albumId) return a.albumId === b.albumId
  const aKey = normalizeLookupKey(a.album)
  const bKey = normalizeLookupKey(b.album)
  return Boolean(aKey && bKey && aKey === bKey)
}

function artistKey(song: ApiSong) {
  return song.artistId ?? normalizeLookupKey(song.artist)
}

function albumKey(song: ApiSong) {
  return song.albumId ?? normalizeLookupKey(song.album)
}

function collectRepeatSignals(
  tracks: ApiSong[],
  keyFn: (song: ApiSong) => string,
  labelFn: (song: ApiSong) => string,
  minCount = 2,
) {
  const counts = new Map<string, { label: string; count: number }>()

  for (const track of tracks) {
    const key = keyFn(track)
    if (!key) continue
    const existing = counts.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    counts.set(key, { label: labelFn(track), count: 1 })
  }

  return [...counts.entries()]
    .filter(([, value]) => value.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, value]) => ({ key, label: value.label, count: value.count }))
}

function collectContentHints(tracks: ApiSong[]): QueueContentHints {
  const moods = new Set<string>()
  const genres = new Set<string>()
  const tags = new Set<string>()

  for (const track of tracks) {
    const mood = track.mood?.trim()
    if (mood) moods.add(mood)

    const inferredGenre = inferSongGenre(track)
    if (inferredGenre && inferredGenre !== 'hidden-tunes') {
      genres.add(inferredGenre)
    }

    const explicitGenre = track.genre?.trim()
    if (explicitGenre) genres.add(explicitGenre)

    for (const tag of track.tags ?? []) {
      const normalized = tag.trim()
      if (normalized) tags.add(normalized)
    }
  }

  return {
    moods: [...moods].sort((a, b) => a.localeCompare(b)),
    genres: [...genres].sort((a, b) => a.localeCompare(b)),
    tags: [...tags].sort((a, b) => a.localeCompare(b)).slice(0, 6),
  }
}

function titleCaseGenre(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function analyzeQueueSnapshot(input: QueueSnapshotInput): QueueSnapshot | null {
  const { queue, currentIndex, currentTrack } = input
  if (queue.length === 0 || currentIndex < 0 || currentIndex >= queue.length) {
    return null
  }

  const resolvedCurrent = currentTrack ?? queue[currentIndex] ?? null
  if (!resolvedCurrent) return null

  const previousTrack = currentIndex > 0 ? (queue[currentIndex - 1] ?? null) : null
  const nextTrack =
    currentIndex < queue.length - 1 ? (queue[currentIndex + 1] ?? null) : null
  const upcomingTracks = queue.slice(currentIndex + 1)
  const remainingCount = upcomingTracks.length

  const artistContinuity: QueueArtistContinuity = {
    matchesPrevious: previousTrack
      ? songsShareArtist(resolvedCurrent, previousTrack)
      : false,
    matchesNext: nextTrack ? songsShareArtist(resolvedCurrent, nextTrack) : false,
    upcomingCount: upcomingTracks.filter((track) =>
      songsShareArtist(resolvedCurrent, track),
    ).length,
    dominantArtist:
      upcomingTracks.some((track) => songsShareArtist(resolvedCurrent, track))
        ? resolvedCurrent.artist
        : null,
  }

  const albumContinuity: QueueAlbumContinuity = {
    matchesPrevious: previousTrack
      ? songsShareAlbum(resolvedCurrent, previousTrack)
      : false,
    matchesNext: nextTrack ? songsShareAlbum(resolvedCurrent, nextTrack) : false,
    upcomingCount: upcomingTracks.filter((track) =>
      songsShareAlbum(resolvedCurrent, track),
    ).length,
    dominantAlbum:
      upcomingTracks.some((track) => songsShareAlbum(resolvedCurrent, track))
        ? resolvedCurrent.album || null
        : null,
  }

  const repeatedArtists = collectRepeatSignals(queue, artistKey, (song) => song.artist)
  const repeatedAlbums = collectRepeatSignals(
    queue,
    albumKey,
    (song) => song.album?.trim() || 'Unknown album',
  ).filter((signal) => signal.label !== 'Unknown album')

  return {
    currentTrack: resolvedCurrent,
    previousTrack,
    nextTrack,
    currentIndex,
    totalCount: queue.length,
    remainingCount,
    artistContinuity,
    albumContinuity,
    repeatedArtists,
    repeatedAlbums,
    contentHints: collectContentHints([resolvedCurrent, ...upcomingTracks]),
  }
}

export function describeQueueInsight(snapshot: QueueSnapshot): string | null {
  const {
    remainingCount,
    artistContinuity,
    albumContinuity,
    contentHints,
    repeatedArtists,
    currentTrack,
  } = snapshot

  if (remainingCount === 0) {
    if (albumContinuity.matchesPrevious) {
      return 'Last track in this album stretch'
    }
    return null
  }

  if (
    albumContinuity.upcomingCount === remainingCount &&
    albumContinuity.dominantAlbum
  ) {
    const album = albumContinuity.dominantAlbum
    return remainingCount === 1
      ? `One more from ${album}`
      : `${remainingCount + 1} tracks from ${album}`
  }

  if (
    artistContinuity.upcomingCount === remainingCount &&
    artistContinuity.upcomingCount > 1 &&
    artistContinuity.dominantArtist
  ) {
    return `${remainingCount + 1} tracks by ${artistContinuity.dominantArtist}`
  }

  if (albumContinuity.matchesNext && currentTrack.album) {
    return `Continuing ${currentTrack.album}`
  }

  if (artistContinuity.matchesNext && currentTrack.artist) {
    return `More from ${currentTrack.artist} ahead`
  }

  const topRepeat = repeatedArtists[0]
  if (topRepeat && topRepeat.count >= 3) {
    return `${topRepeat.label} woven through this queue`
  }

  if (contentHints.moods.length === 1) {
    return `${contentHints.moods[0]} mood ahead`
  }

  if (contentHints.moods.length >= 2) {
    return `${contentHints.moods.slice(0, 2).join(' · ')} ahead`
  }

  if (contentHints.genres.length === 1) {
    return `${titleCaseGenre(contentHints.genres[0])} listening ahead`
  }

  if (contentHints.tags.length >= 2) {
    return `${contentHints.tags.slice(0, 2).join(' · ')} ahead`
  }

  return null
}
