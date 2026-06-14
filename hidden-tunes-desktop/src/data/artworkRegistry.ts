/**
 * Desktop artwork registry — standalone assets per entity type.
 * PSD *-reference.jpg files are design references only and must never appear here.
 */

import type { ApiAlbum, ApiArtist, ApiSong } from '../lib/api'
import artistWillsAfrobeats from '../assets/artwork/artists/artist-wills-afrobeats.svg'
import artistCaasiWills from '../assets/artwork/artists/artist-caasi-wills.svg'
import artistPlaceholder from '../assets/artwork/artists/artist-placeholder.svg'
import playerBackground from '../assets/artwork/players/player-background.svg'

export type PlayerBackgroundType =
  | 'master'
  | 'player2'
  | 'player3'
  | 'player4'
  | 'player5'
  | 'waveform'
  | 'lyrics'

export type PlaylistArtworkInput = {
  id?: string | null
  title: string
  coverUrl?: string | null
  songs?: ApiSong[]
}

export type WorldArtworkInput = {
  id?: string | null
  title: string
  sceneId?: string | null
}

export function normalizeArtworkKey(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function artistScopedAlbumKey(albumTitle: string, artistName: string) {
  return `${normalizeArtworkKey(artistName)}::${normalizeArtworkKey(albumTitle)}`
}

export function isValidArtworkUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.startsWith('data:')
}

/** Song title/id → bundled song cover (null = pending export) */
export const songArtwork: Record<string, string | null> = {
  'midnight reflection': null,
  'falling slowly': null,
  'afro sunset': null,
  'love vibes': null,
  'rain reflection': null,
  'night drive': null,
}

/** Album title/id → bundled album cover (null = pending export) */
export const albumArtwork: Record<string, string | null> = {
  'reflections at midnight': null,
  'afro sunrise': null,
  'vibes from lagos': null,
  'love rhythm': null,
  'the beginning': null,
}

/** Artist name/id → standalone portrait asset (never song/album art) */
export const artistPortraits: Record<string, string> = {
  'wills afrobeats': artistWillsAfrobeats,
  'caasi wills': artistCaasiWills,
}

/** Playlist title/id → bundled playlist cover (null = pending export) */
export const playlistCovers: Record<string, string | null> = {
  'night drive': null,
  'chill vibes': null,
  'jazz cafe': null,
  'deep focus': null,
}

/** World id/title → bundled world artwork (null = pending export) */
export const worldArtwork: Record<string, string | null> = {
  'rainy window': null,
  'midnight reflection': null,
  'sunday morning': null,
  'afro sunset': null,
  'heartbreak recovery': null,
  'healing slowly': null,
  'midnight drive': null,
  'night drive': null,
}

/** Standalone player/theater backgrounds — never song/album/artist portraits */
export const playerBackgrounds: Record<PlayerBackgroundType, string> = {
  master: playerBackground,
  player2: playerBackground,
  player3: playerBackground,
  player4: playerBackground,
  player5: playerBackground,
  waveform: playerBackground,
  lyrics: playerBackground,
}

const artistPortraitById: Record<string, string> = {}

function lookupById(idMap: Record<string, string | null>, id?: string | null) {
  if (!id) return null
  const hit = idMap[id]
  return hit ?? null
}

function lookupByName(map: Record<string, string | null>, name?: string | null) {
  if (!name) return null
  return map[normalizeArtworkKey(name)] ?? null
}

function lookupPortraitByName(name?: string | null): string | null {
  if (!name) return null
  return artistPortraits[normalizeArtworkKey(name)] ?? null
}

function lookupAlbumScoped(
  albumTitle: string,
  artistName?: string | null,
): string | null {
  if (!artistName) return null
  const key = artistScopedAlbumKey(albumTitle, artistName)
  return albumArtwork[key] ?? null
}

export function resolveSongArtwork(song: ApiSong | null | undefined): string | null {
  if (!song) return null

  const byId = lookupById(songArtwork, song.id)
  if (byId) return byId

  const byTitle = lookupByName(songArtwork, song.title)
  if (byTitle) return byTitle

  if (isValidArtworkUrl(song.artwork)) return song.artwork.trim()

  return null
}

export function resolveAlbumArtwork(
  album: ApiAlbum | null | undefined,
  artistName?: string | null,
): string | null {
  if (!album) return null

  const byId = lookupById(albumArtwork, album.id)
  if (byId) return byId

  const scoped = lookupAlbumScoped(album.title, artistName)
  if (scoped) return scoped

  const byTitle = lookupByName(albumArtwork, album.title)
  if (byTitle) return byTitle

  if (isValidArtworkUrl(album.artwork)) return album.artwork.trim()

  return null
}

export function resolveArtistPortrait(artist: ApiArtist | null | undefined): string | null {
  if (!artist) return null

  const byId = artistPortraitById[artist.id] ?? lookupById(artistPortraits, artist.id)
  if (byId) return byId

  const byName = lookupPortraitByName(artist.name)
  if (byName) return byName

  if (isValidArtworkUrl(artist.artwork)) return artist.artwork.trim()

  return artistPlaceholder
}

export function resolvePlaylistCover(playlist: PlaylistArtworkInput): string | null {
  const byId = lookupById(playlistCovers, playlist.id)
  if (byId) return byId

  const byTitle = lookupByName(playlistCovers, playlist.title)
  if (byTitle) return byTitle

  if (isValidArtworkUrl(playlist.coverUrl)) return playlist.coverUrl!.trim()

  return null
}

export function resolveWorldArtwork(world: WorldArtworkInput): string | null {
  if (world.id) {
    const byId = lookupById(worldArtwork, world.id)
    if (byId) return byId
    const byScene = lookupById(worldArtwork, world.sceneId)
    if (byScene) return byScene
  }

  const byTitle = lookupByName(worldArtwork, world.title)
  if (byTitle) return byTitle

  return null
}

export function resolvePlayerBackground(type: PlayerBackgroundType): string {
  return playerBackgrounds[type]
}

export function listMissingRegistryAssets(): string[] {
  const pending: string[] = []
  const scan = (label: string, map: Record<string, string | null>) => {
    for (const [key, value] of Object.entries(map)) {
      if (!value) pending.push(`${label}/${key}`)
    }
  }
  scan('songs', songArtwork)
  scan('albums', albumArtwork)
  scan('playlists', playlistCovers)
  scan('worlds', worldArtwork)
  return pending
}
