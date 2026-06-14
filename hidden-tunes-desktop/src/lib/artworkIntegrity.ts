import type { ApiAlbum, ApiArtist, ApiSong } from './api'
import {
  buildCatalogIndexes,
  resolveAlbumArtwork,
  resolveAlbumDisplayArtist,
  resolveSongsForAlbum,
  type CatalogIndexes,
} from './catalogIndexes'
import { filterSongsByListeningScene } from './sceneListening'
import {
  lookupRegistryAlbumArtwork,
  lookupRegistryArtistArtwork,
  lookupRegistryPlaylistArtwork,
  lookupRegistrySongArtwork,
  lookupRegistryTheaterArtwork,
  lookupRegistryWorldArtwork,
} from './artworkRegistry'

export type ArtworkContext = {
  indexes: CatalogIndexes
  albumsById: Map<string, ApiAlbum>
  artistsById: Map<string, ApiArtist>
}

export type PlaylistArtworkTarget = {
  id?: string | null
  title: string
  songs?: ApiSong[]
}

export type WorldArtworkTarget = {
  id?: string | null
  title: string
  sceneId?: string | null
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

export function getArtworkForSong(
  song: ApiSong | null | undefined,
  context?: ArtworkContext,
): string | null {
  if (!song) return null

  const registryArt = lookupRegistrySongArtwork(song)
  if (registryArt) return registryArt

  if (isValidArtworkUrl(song.artwork)) return song.artwork.trim()

  if (!context) return null

  if (song.albumId) {
    const album = context.albumsById.get(song.albumId)
    if (album) {
      const albumArt = getArtworkForAlbum(album, context)
      if (isValidArtworkUrl(albumArt)) return albumArt.trim()
    }
  }

  return null
}

export function getArtworkForAlbum(
  album: ApiAlbum | null | undefined,
  context: ArtworkContext,
): string | null {
  if (!album) return null

  const artistName = resolveAlbumDisplayArtist(
    album,
    resolveSongsForAlbum(
      album,
      context.indexes.songsByAlbumId,
      context.indexes.songsByAlbumName,
      context.indexes.artistNames,
    ),
    context.indexes.artistNames,
  )

  const registryArt = lookupRegistryAlbumArtwork(album, artistName)
  if (registryArt) return registryArt

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

export function getArtworkForArtist(
  artist: ApiArtist | null | undefined,
  _context?: ArtworkContext,
): string | null {
  if (!artist) return null

  const registryArt = lookupRegistryArtistArtwork(artist)
  if (registryArt) return registryArt

  if (isValidArtworkUrl(artist.artwork)) return artist.artwork.trim()

  return null
}

export function getArtworkForPlaylist(
  playlist: PlaylistArtworkTarget,
  context?: ArtworkContext,
): string | null {
  const registryArt = lookupRegistryPlaylistArtwork(playlist)
  if (registryArt) return registryArt

  const songs = playlist.songs ?? []
  for (const song of songs) {
    const artwork = context ? getArtworkForSong(song, context) : song.artwork
    if (isValidArtworkUrl(artwork)) return artwork.trim()
  }

  return null
}

export function getArtworkForPlaylistCollage(
  playlistSongs: ApiSong[],
  context?: ArtworkContext,
  limit = 4,
): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  for (const song of playlistSongs) {
    const artwork = context ? getArtworkForSong(song, context) : song.artwork
    if (!isValidArtworkUrl(artwork)) continue
    const normalized = artwork.trim()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    urls.push(normalized)
    if (urls.length >= limit) break
  }

  return urls
}

export function getArtworkForWorld(
  world: WorldArtworkTarget,
  songs: ApiSong[],
  context?: ArtworkContext,
): string | null {
  const registryArt = lookupRegistryWorldArtwork(world)
  if (registryArt) return registryArt

  if (world.sceneId) {
    const worldTracks = filterSongsByListeningScene(songs, world.sceneId)
    for (const song of worldTracks) {
      const artwork = context ? getArtworkForSong(song, context) : song.artwork
      if (isValidArtworkUrl(artwork)) return artwork.trim()
    }
  }

  return null
}

export function getArtworkForTheater(
  track: ApiSong | null | undefined,
  context?: ArtworkContext,
): string | null {
  const registryArt = lookupRegistryTheaterArtwork()
  if (registryArt) return registryArt

  return getArtworkForSong(track, context)
}

/** @deprecated Use getArtworkForSong */
export const getSongArtwork = getArtworkForSong

/** @deprecated Use getArtworkForAlbum */
export const getAlbumArtwork = getArtworkForAlbum

/** @deprecated Use getArtworkForArtist */
export const getArtistArtwork = getArtworkForArtist

/** @deprecated Use getArtworkForPlaylist */
export const getPlaylistArtwork = getArtworkForPlaylist

/** @deprecated Use getArtworkForPlaylistCollage */
export const getPlaylistArtworkCollage = getArtworkForPlaylistCollage

export function enrichCatalogArtwork(
  songs: ApiSong[],
  albums: ApiAlbum[],
  artists: ApiArtist[],
): { songs: ApiSong[]; albums: ApiAlbum[]; artists: ApiArtist[] } {
  const provisionalIndexes = buildCatalogIndexes(songs, albums, artists)
  const context = buildArtworkContext(provisionalIndexes, albums, artists)

  const enrichedAlbums = albums.map((album) => ({
    ...album,
    artwork: getArtworkForAlbum(album, context),
  }))

  const enrichedArtists = artists.map((artist) => ({
    ...artist,
    artwork: getArtworkForArtist(artist, context),
  }))

  const enrichedContext = buildArtworkContext(provisionalIndexes, enrichedAlbums, enrichedArtists)
  const enrichedSongs = songs.map((song) => ({
    ...song,
    artwork: getArtworkForSong(song, enrichedContext),
  }))

  return {
    songs: enrichedSongs,
    albums: enrichedAlbums,
    artists: enrichedArtists,
  }
}

export { listMissingRegistryAssets } from './artworkRegistry'
