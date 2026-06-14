import type { ApiAlbum, ApiArtist, ApiSong } from './api'
import { logAlbumResolve, logArtistResolve, logCatalogIndexBuild } from './catalogDiagnostics'

export const CATALOG_QUEUE_CANDIDATE_POOL_LIMIT = 250
export const CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT = 120
export const CATALOG_DETAIL_TRACK_PREVIEW_LIMIT = 24

export type CatalogIndexes = {
  songsById: Map<string, ApiSong>
  songsByArtistId: Map<string, ApiSong[]>
  songsByArtistName: Map<string, ApiSong[]>
  songsByAlbumId: Map<string, ApiSong[]>
  songsByAlbumName: Map<string, ApiSong[]>
  songsByMood: Map<string, ApiSong[]>
  songsByGenre: Map<string, ApiSong[]>
  albumsByArtistId: Map<string, ApiAlbum[]>
  artistNames: Map<string, string>
}

export function normalizeArtistKey(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeAlbumKey(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeLookupKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ''
}

function albumArtistFallbackKey(albumTitle: string, artistId: string) {
  return `${normalizeAlbumKey(albumTitle)}::artist::${artistId}`
}

export function inferSongGenre(song?: ApiSong) {
  if (!song) return 'hidden-tunes'

  const explicitGenre = normalizeLookupKey(song.genre)
  if (explicitGenre) return explicitGenre

  const text = normalizeLookupKey(`${song.title} ${song.album} ${song.artist}`)
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

function pushToBucket(map: Map<string, ApiSong[]>, key: string, song: ApiSong) {
  const bucket = map.get(key)
  if (bucket) {
    if (bucket.some((entry) => entry.id === song.id)) return
    bucket.push(song)
  } else {
    map.set(key, [song])
  }
}

function dedupeSongsById(songs: ApiSong[]): ApiSong[] {
  const seen = new Set<string>()
  const result: ApiSong[] = []
  for (const song of songs) {
    if (seen.has(song.id)) continue
    seen.add(song.id)
    result.push(song)
  }
  return result
}

export function buildCatalogIndexes(
  songs: ApiSong[],
  albums: ApiAlbum[],
  artists: ApiArtist[],
): CatalogIndexes {
  const started = performance.now()

  const songsById = new Map<string, ApiSong>()
  const songsByArtistId = new Map<string, ApiSong[]>()
  const songsByArtistName = new Map<string, ApiSong[]>()
  const songsByAlbumName = new Map<string, ApiSong[]>()
  const songsByAlbumId = new Map<string, ApiSong[]>()
  const songsByMood = new Map<string, ApiSong[]>()
  const songsByGenre = new Map<string, ApiSong[]>()

  const albumTitleCounts = new Map<string, number>()
  for (const album of albums) {
    const albumKey = normalizeAlbumKey(album.title)
    if (!albumKey) continue
    albumTitleCounts.set(albumKey, (albumTitleCounts.get(albumKey) ?? 0) + 1)
  }

  for (const song of songs) {
    songsById.set(song.id, song)

    if (song.artistId) {
      pushToBucket(songsByArtistId, song.artistId, song)
    }

    const artistKey = normalizeArtistKey(song.artist)
    if (artistKey) {
      pushToBucket(songsByArtistName, artistKey, song)
    }

    if (song.albumId) {
      pushToBucket(songsByAlbumId, song.albumId, song)
    }

    const albumKey = normalizeAlbumKey(song.album)
    if (albumKey && !song.albumId) {
      if (song.artistId) {
        pushToBucket(songsByAlbumName, albumArtistFallbackKey(song.album, song.artistId), song)
      }
      if ((albumTitleCounts.get(albumKey) ?? 0) <= 1) {
        pushToBucket(songsByAlbumName, albumKey, song)
      }
    }

    const moodKey = normalizeLookupKey(song.mood)
    if (moodKey) {
      pushToBucket(songsByMood, moodKey, song)
    }

    pushToBucket(songsByGenre, inferSongGenre(song), song)
  }

  const indexes: CatalogIndexes = {
    songsById,
    songsByArtistId,
    songsByArtistName,
    songsByAlbumId,
    songsByAlbumName,
    songsByMood,
    songsByGenre,
    albumsByArtistId: buildAlbumsByArtistId(albums),
    artistNames: buildArtistNameLookup(artists),
  }

  logCatalogIndexBuild({
    songCount: songs.length,
    durationMs: Math.round(performance.now() - started),
    songsById: songsById.size,
    songsByArtistId: songsByArtistId.size,
    songsByAlbumId: songsByAlbumId.size,
    songsByMood: songsByMood.size,
    songsByGenre: songsByGenre.size,
  })

  return indexes
}

export function buildSongsByAlbumTitle(songs: ApiSong[]) {
  const map = new Map<string, ApiSong[]>()
  for (const song of songs) {
    pushToBucket(map, normalizeAlbumKey(song.album), song)
  }
  return map
}

export function buildSongsByArtistName(songs: ApiSong[]) {
  const map = new Map<string, ApiSong[]>()
  for (const song of songs) {
    const key = normalizeArtistKey(song.artist)
    if (!key) continue
    pushToBucket(map, key, song)
  }
  return map
}

export function buildSongsByArtistId(songs: ApiSong[]) {
  const map = new Map<string, ApiSong[]>()
  for (const song of songs) {
    if (!song.artistId) continue
    pushToBucket(map, song.artistId, song)
  }
  return map
}

export function resolveSongsForArtist(
  artist: ApiArtist,
  songsByArtistId: Map<string, ApiSong[]>,
  songsByArtistName: Map<string, ApiSong[]>,
) {
  const started = performance.now()

  if (artist.id) {
    const byId = songsByArtistId.get(artist.id)
    if (byId?.length) {
      logArtistResolve({
        artistId: artist.id,
        resultCount: byId.length,
        durationMs: Math.round(performance.now() - started),
        source: 'id',
      })
      return byId
    }
  }

  const byName = songsByArtistName.get(normalizeArtistKey(artist.name))
  if (byName?.length) {
    logArtistResolve({
      artistId: artist.id,
      resultCount: byName.length,
      durationMs: Math.round(performance.now() - started),
      source: 'name',
    })
    return byName
  }

  const tracks = artist.tracks ?? []
  logArtistResolve({
    artistId: artist.id,
    resultCount: tracks.length,
    durationMs: Math.round(performance.now() - started),
    source: tracks.length > 0 ? 'tracks' : 'none',
  })
  return tracks
}

export function resolveAlbumDisplayArtist(
  album: ApiAlbum,
  albumSongs: ApiSong[],
  artistNames: Map<string, string>,
): string | null {
  if (album.artistId) {
    const linked = artistNames.get(album.artistId)
    if (linked) return linked
  }

  if (albumSongs.length === 0) return null

  const counts = new Map<string, number>()
  for (const song of albumSongs) {
    const name = song.artist.trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }

  let bestName: string | null = null
  let bestCount = 0
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestName = name
      bestCount = count
    }
  }

  return bestName
}

export function resolveAlbumArtwork(
  album: ApiAlbum,
  albumSongs: ApiSong[],
): string | null {
  if (album.artwork) return album.artwork
  for (const song of albumSongs) {
    if (song.artwork) return song.artwork
  }
  return null
}

export function resolveSongsForAlbum(
  album: ApiAlbum,
  songsByAlbumId: Map<string, ApiSong[]>,
  songsByAlbumName: Map<string, ApiSong[]>,
) {
  const started = performance.now()

  if (album.id) {
    const byId = songsByAlbumId.get(album.id)
    if (byId?.length) {
      const result = dedupeSongsById(byId)
      logAlbumResolve({
        albumId: album.id,
        resultCount: result.length,
        durationMs: Math.round(performance.now() - started),
        source: 'id',
      })
      return result
    }
  }

  const albumKey = normalizeAlbumKey(album.title)
  const fallbackSongs = album.artistId
    ? songsByAlbumName.get(albumArtistFallbackKey(album.title, album.artistId))
      ?? songsByAlbumName.get(albumKey)
      ?? []
    : songsByAlbumName.get(albumKey) ?? []
  const byName = fallbackSongs.filter((song) => {
    if (song.albumId) return false
    if (normalizeAlbumKey(song.album) !== albumKey) return false
    if (album.artistId && song.artistId) return song.artistId === album.artistId
    if (album.artistId && !song.artistId) return false
    return true
  })
  const result = dedupeSongsById(byName)
  logAlbumResolve({
    albumId: album.id,
    resultCount: result.length,
    durationMs: Math.round(performance.now() - started),
    source: result.length > 0 ? 'name' : 'none',
  })
  return result
}

const MOOD_ROOM_GENRES: Record<string, string[]> = {
  violet: ['jazz', 'love', 'ambient', 'soul'],
  cyan: ['ambient', 'acoustic', 'pop', 'focus'],
  rose: ['pop', 'love', 'country', 'hits'],
  mint: ['acoustic', 'ambient', 'gospel', 'chill'],
}

export function hashSeedToIndex(seed: string, modulo: number) {
  let acc = 0
  for (let i = 0; i < seed.length; i++) acc = (acc * 31 + seed.charCodeAt(i)) >>> 0
  return modulo > 0 ? acc % modulo : 0
}

export function resolveSongsForMoodRoom(
  moodKey: string,
  moodTone: string,
  songsByMood: Map<string, ApiSong[]>,
  songsByGenre: Map<string, ApiSong[]>,
  fallbackSongs: ApiSong[],
) {
  const byTitle = songsByMood.get(normalizeLookupKey(moodKey))
  if (byTitle?.length) {
    const start = hashSeedToIndex(moodKey, byTitle.length)
    return [...byTitle.slice(start), ...byTitle.slice(0, start)]
  }

  const genreKeys = MOOD_ROOM_GENRES[moodTone] ?? []
  const seen = new Set<string>()
  const merged: ApiSong[] = []

  for (const genre of genreKeys) {
    for (const song of songsByGenre.get(genre) ?? []) {
      if (seen.has(song.id)) continue
      seen.add(song.id)
      merged.push(song)
    }
  }

  const source = merged.length > 0 ? merged : fallbackSongs
  if (source.length === 0) return []

  const start = hashSeedToIndex(moodKey, source.length)
  return [...source.slice(start), ...source.slice(0, start)]
}

export function capSongPool(songs: ApiSong[], limit = CATALOG_QUEUE_CANDIDATE_POOL_LIMIT) {
  return songs.length <= limit ? songs : songs.slice(0, limit)
}

export function buildQueueSeedPool(
  seedType: 'home' | 'discover' | 'artist' | 'album' | 'mood' | 'manual',
  contextSongs: ApiSong[],
  indexes: Pick<CatalogIndexes, 'songsByArtistId' | 'songsByGenre'>,
  referenceSong?: ApiSong,
) {
  if (seedType === 'artist' && referenceSong?.artistId) {
    const artistPool = indexes.songsByArtistId.get(referenceSong.artistId)
    if (artistPool?.length) return capSongPool(artistPool)
  }

  if (seedType === 'home' || seedType === 'discover') {
    const genrePool = indexes.songsByGenre.get(inferSongGenre(referenceSong ?? contextSongs[0]))
    if (genrePool?.length) return capSongPool(genrePool)
  }

  return capSongPool(contextSongs)
}

export function buildAlbumsByArtistId(albums: ApiAlbum[]) {
  const map = new Map<string, ApiAlbum[]>()
  for (const album of albums) {
    if (!album.artistId) continue
    const bucket = map.get(album.artistId)
    if (bucket) {
      bucket.push(album)
    } else {
      map.set(album.artistId, [album])
    }
  }
  return map
}

export function buildArtistNameLookup(artists: ApiArtist[]) {
  return new Map(artists.map((artist) => [artist.id, artist.name]))
}
