import type { ApiAlbum, ApiArtist, ApiSong } from './api'

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
    const bucket = map.get(song.artist)
    if (bucket) {
      bucket.push(song)
    } else {
      map.set(song.artist, [song])
    }
  }
  return map
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
