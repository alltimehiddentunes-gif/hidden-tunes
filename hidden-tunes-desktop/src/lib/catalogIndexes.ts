import type { ApiAlbum, ApiArtist, ApiSong } from './api'

export function normalizeArtistKey(value: string) {
  return value.trim().toLowerCase()
}

export function buildSongsByAlbumTitle(songs: ApiSong[]) {
  const map = new Map<string, ApiSong[]>()
  for (const song of songs) {
    const bucket = map.get(song.album)
    if (bucket) {
      bucket.push(song)
    } else {
      map.set(song.album, [song])
    }
  }
  return map
}

export function buildSongsByArtistName(songs: ApiSong[]) {
  const map = new Map<string, ApiSong[]>()
  for (const song of songs) {
    const key = normalizeArtistKey(song.artist)
    if (!key) continue
    const bucket = map.get(key)
    if (bucket) {
      bucket.push(song)
    } else {
      map.set(key, [song])
    }
  }
  return map
}

export function buildSongsByArtistId(songs: ApiSong[]) {
  const map = new Map<string, ApiSong[]>()
  for (const song of songs) {
    if (!song.artistId) continue
    const bucket = map.get(song.artistId)
    if (bucket) {
      bucket.push(song)
    } else {
      map.set(song.artistId, [song])
    }
  }
  return map
}

export function resolveSongsForArtist(
  artist: ApiArtist,
  songsByArtistId: Map<string, ApiSong[]>,
  songsByArtistName: Map<string, ApiSong[]>,
) {
  if (artist.id) {
    const byId = songsByArtistId.get(artist.id)
    if (byId?.length) return byId
  }

  const byName = songsByArtistName.get(normalizeArtistKey(artist.name))
  if (byName?.length) return byName

  return artist.tracks ?? []
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
