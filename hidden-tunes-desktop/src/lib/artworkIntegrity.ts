import type { ApiAlbum, ApiArtist, ApiSong } from './api'
import {
  buildCatalogIndexes,
  resolveAlbumArtwork,
  resolveSongsForAlbum,
  resolveSongsForArtist,
  type CatalogIndexes,
} from './catalogIndexes'

export type ArtworkContext = {
  indexes: CatalogIndexes
  albumsById: Map<string, ApiAlbum>
  artistsById: Map<string, ApiArtist>
}

export function isValidArtworkUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().startsWith('http')
}

export function deriveEntityInitials(name: string, max = 2): string {
  const parts = name
    .trim()
    .split(/[\s\-–—|/]+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, max).toUpperCase()
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase()
}

export function buildAlbumsByIdMap(albums: ApiAlbum[]): Map<string, ApiAlbum> {
  return new Map(albums.filter((album) => album.id).map((album) => [album.id, album]))
}

export function buildArtistsByIdMap(artists: ApiArtist[]): Map<string, ApiArtist> {
  return new Map(artists.filter((artist) => artist.id).map((artist) => [artist.id, artist]))
}

export function buildArtworkContext(
  indexes: CatalogIndexes,
  albums: ApiAlbum[],
  artists: ApiArtist[],
): ArtworkContext {
  return {
    indexes,
    albumsById: buildAlbumsByIdMap(albums),
    artistsById: buildArtistsByIdMap(artists),
  }
}

export function getSongArtwork(
  song: ApiSong | null | undefined,
  context?: ArtworkContext,
): string | null {
  if (!song) return null
  if (isValidArtworkUrl(song.artwork)) return song.artwork.trim()

  if (!context) return null

  if (song.albumId) {
    const album = context.albumsById.get(song.albumId)
    if (album) {
      const albumSongs = resolveSongsForAlbum(
        album,
        context.indexes.songsByAlbumId,
        context.indexes.songsByAlbumName,
        context.indexes.artistNames,
      )
      const albumArt = resolveAlbumArtwork(album, albumSongs)
      if (isValidArtworkUrl(albumArt)) return albumArt.trim()
    }
  }

  if (song.artistId) {
    const artist = context.artistsById.get(song.artistId)
    if (artist) {
      const artistArt = getArtistArtwork(artist, context, { skipSongScan: true })
      if (isValidArtworkUrl(artistArt)) return artistArt.trim()
    }
  }

  return null
}

export function getAlbumArtwork(
  album: ApiAlbum | null | undefined,
  context: ArtworkContext,
): string | null {
  if (!album) return null
  if (isValidArtworkUrl(album.artwork)) return album.artwork.trim()

  const albumSongs = resolveSongsForAlbum(
    album,
    context.indexes.songsByAlbumId,
    context.indexes.songsByAlbumName,
    context.indexes.artistNames,
  )
  const resolved = resolveAlbumArtwork(album, albumSongs)
  return isValidArtworkUrl(resolved) ? resolved.trim() : null
}

export function getArtistArtwork(
  artist: ApiArtist | null | undefined,
  context?: ArtworkContext,
  options?: { skipSongScan?: boolean },
): string | null {
  if (!artist) return null
  if (isValidArtworkUrl(artist.artwork)) return artist.artwork.trim()

  if (options?.skipSongScan || !context) return null

  const artistSongs = resolveSongsForArtist(
    artist,
    context.indexes.songsByArtistId,
    context.indexes.songsByArtistName,
  )

  for (const song of artistSongs) {
    if (isValidArtworkUrl(song.artwork)) return song.artwork.trim()
    if (song.albumId) {
      const album = context.albumsById.get(song.albumId)
      if (album) {
        const albumArt = getAlbumArtwork(album, context)
        if (isValidArtworkUrl(albumArt)) return albumArt.trim()
      }
    }
  }

  return null
}

export function getPlaylistArtwork(
  playlistSongs: ApiSong[],
  context?: ArtworkContext,
): string | null {
  for (const song of playlistSongs) {
    const artwork = context ? getSongArtwork(song, context) : song.artwork
    if (isValidArtworkUrl(artwork)) return artwork.trim()
  }
  return null
}

export function getPlaylistArtworkCollage(
  playlistSongs: ApiSong[],
  context?: ArtworkContext,
  limit = 4,
): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  for (const song of playlistSongs) {
    const artwork = context ? getSongArtwork(song, context) : song.artwork
    if (!isValidArtworkUrl(artwork)) continue
    const normalized = artwork.trim()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    urls.push(normalized)
    if (urls.length >= limit) break
  }

  return urls
}

export function enrichCatalogArtwork(
  songs: ApiSong[],
  albums: ApiAlbum[],
  artists: ApiArtist[],
): { songs: ApiSong[]; albums: ApiAlbum[]; artists: ApiArtist[] } {
  const provisionalIndexes = buildCatalogIndexes(songs, albums, artists)
  const context = buildArtworkContext(provisionalIndexes, albums, artists)

  const enrichedAlbums = albums.map((album) => ({
    ...album,
    artwork: getAlbumArtwork(album, context),
  }))

  const enrichedArtists = artists.map((artist) => ({
    ...artist,
    artwork: getArtistArtwork(artist, context),
  }))

  const enrichedContext = buildArtworkContext(provisionalIndexes, enrichedAlbums, enrichedArtists)
  const enrichedSongs = songs.map((song) => ({
    ...song,
    artwork: getSongArtwork(song, enrichedContext),
  }))

  return {
    songs: enrichedSongs,
    albums: enrichedAlbums,
    artists: enrichedArtists,
  }
}
