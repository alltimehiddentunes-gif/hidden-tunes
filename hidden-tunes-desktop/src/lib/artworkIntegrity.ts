import type { ApiAlbum, ApiArtist, ApiSong } from './api'
import {
  buildCatalogIndexes,
  resolveAlbumDisplayArtist,
  resolveSongsForAlbum,
  type CatalogIndexes,
} from './catalogIndexes'
import {
  isValidArtworkUrl,
  listMissingRegistryAssets,
  resolveAlbumArtwork,
  resolveArtistPortrait,
  resolveHeroArtwork,
  resolvePlaylistCover,
  resolvePlayerBackground,
  resolvePremiumArtwork,
  resolveSongArtwork,
  resolveWorldArtwork,
  type HeroArtworkKey,
  type PlayerBackgroundType,
  type PlaylistArtworkInput,
  type PremiumArtworkKey,
  type WorldArtworkInput,
} from '../data/artworkRegistry'

export type ArtworkContext = {
  indexes: CatalogIndexes
  albumsById: Map<string, ApiAlbum>
  artistsById: Map<string, ApiArtist>
}

export type PlaylistArtworkTarget = PlaylistArtworkInput

export type WorldArtworkTarget = WorldArtworkInput

export { isValidArtworkUrl, listMissingRegistryAssets, resolveHeroArtwork, resolvePlayerBackground, resolvePremiumArtwork }
export type { HeroArtworkKey, PlayerBackgroundType, PremiumArtworkKey }

export function getArtworkForHero(key: HeroArtworkKey = 'home'): string {
  return resolveHeroArtwork(key)
}

export function getArtworkForPremium(key: PremiumArtworkKey = 'default'): string {
  return resolvePremiumArtwork(key)
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
  const direct = resolveSongArtwork(song)
  if (direct) return direct

  if (!song || !context || !song.albumId) return null

  const album = context.albumsById.get(song.albumId)
  if (!album) return null

  return getArtworkForAlbum(album, context)
}

export function getArtworkForAlbum(
  album: ApiAlbum | null | undefined,
  context: ArtworkContext,
): string | null {
  if (!album) return null

  const albumSongs = resolveSongsForAlbum(
    album,
    context.indexes.songsByAlbumId,
    context.indexes.songsByAlbumName,
    context.indexes.artistNames,
  )
  const artistName = resolveAlbumDisplayArtist(
    album,
    albumSongs,
    context.indexes.artistNames,
  )

  const registryOrCatalog = resolveAlbumArtwork(album, artistName)
  if (registryOrCatalog) return registryOrCatalog

  for (const song of albumSongs) {
    const trackArt = resolveSongArtwork(song)
    if (trackArt) return trackArt
  }

  return null
}

export function getArtworkForArtist(
  artist: ApiArtist | null | undefined,
  _context?: ArtworkContext,
): string | null {
  return resolveArtistPortrait(artist)
}

export function getArtworkForPlaylist(
  playlist: PlaylistArtworkTarget,
  context?: ArtworkContext,
): string | null {
  const cover = resolvePlaylistCover(playlist)
  if (cover) return cover

  const songs = playlist.songs ?? []
  for (const song of songs) {
    const artwork = context ? getArtworkForSong(song, context) : resolveSongArtwork(song)
    if (artwork) return artwork
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
    const artwork = context ? getArtworkForSong(song, context) : resolveSongArtwork(song)
    if (!artwork || !isValidArtworkUrl(artwork)) continue
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
  _songs?: ApiSong[],
  _context?: ArtworkContext,
): string | null {
  return resolveWorldArtwork(world)
}

export function getArtworkForTheater(
  _track: ApiSong | null | undefined,
  _context?: ArtworkContext,
): string | null {
  return resolvePlayerBackground('master')
}

/** @deprecated Use resolveSongArtwork / getArtworkForSong */
export const getSongArtwork = getArtworkForSong

/** @deprecated Use resolveAlbumArtwork / getArtworkForAlbum */
export const getAlbumArtwork = getArtworkForAlbum

/** @deprecated Use resolveArtistPortrait / getArtworkForArtist */
export const getArtistArtwork = getArtworkForArtist

/** @deprecated Use resolvePlaylistCover / getArtworkForPlaylist */
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

  const enrichedArtists = artists.map((artist) => ({
    ...artist,
    artwork: resolveArtistPortrait(artist),
  }))

  const enrichedAlbums = albums.map((album) => ({
    ...album,
    artwork: getArtworkForAlbum(album, context),
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

export {
  resolveAlbumArtwork,
  resolveArtistPortrait,
  resolvePlaylistCover,
  resolveSongArtwork,
  resolveWorldArtwork,
} from '../data/artworkRegistry'
