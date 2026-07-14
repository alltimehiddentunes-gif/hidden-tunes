/**
 * Desktop UI artwork registry — heroes, playlists, worlds, player backgrounds, premium.
 * Catalog song/album/artist artwork comes from API fields only.
 * PSD *-reference.jpg files are design references and must never appear here.
 */

import type { ApiAlbum, ApiArtist, ApiSong } from '../lib/api'
import artistWillsAfrobeats from '../assets/artwork/artists/artist-wills-afrobeats.svg'
import artistCaasiWills from '../assets/artwork/artists/artist-caasi-wills.svg'
import artistPlaceholder from '../assets/artwork/artists/artist-placeholder.svg'

export type PlayerBackgroundType =
  | 'master'
  | 'player2'
  | 'player3'
  | 'player4'
  | 'player5'
  | 'waveform'
  | 'lyrics'

export type HeroArtworkKey = 'home' | 'emotional-worlds' | 'discover'

export type PremiumArtworkKey = 'default' | 'hero'

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

export function isValidArtworkUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.startsWith('http') || trimmed.startsWith('/') || trimmed.startsWith('data:')
}

/** Home / page hero banners */
export const heroArtwork: Record<HeroArtworkKey, string> = {
  home: '/artwork/heroes/hero-afrobeats-celebration.jpg',
  'emotional-worlds': '/artwork/heroes/hero-golden-peaks.jpg',
  discover: '/artwork/heroes/hero-afrobeats-celebration.jpg',
}

/** Playlist title/id → standalone cover art */
export const playlistCovers: Record<string, string> = {
  'night drive': '/artwork/playlists/playlist-night-drive.jpg',
  'late night drive': '/artwork/playlists/playlist-night-drive.jpg',
  'chill vibes': '/artwork/playlists/playlist-neon-rain-lofi.jpg',
  'chill & relax': '/artwork/playlists/playlist-neon-rain-lofi.jpg',
  'rainy day comfort': '/artwork/playlists/playlist-neon-rain-lofi.jpg',
  'deep focus': '/artwork/worlds/world-late-night-focus.jpg',
  'jazz cafe': '/artwork/worlds/world-serene-waterfall.jpg',
  'jazz café': '/artwork/worlds/world-serene-waterfall.jpg',
  'afro vibes': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'workout mix': '/artwork/heroes/hero-afrobeats-celebration.jpg',
}

/** Emotional world scene/title → standalone world art */
export const worldArtwork: Record<string, string> = {
  'ew-midnight-reflection': '/artwork/worlds/world-midnight-lake.jpg',
  'ew-afro-sunset': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'ew-healing-slowly': '/artwork/worlds/world-serene-waterfall.jpg',
  'ew-night-drive': '/artwork/worlds/auto-worlds-19.jpg',
  'ew-sunset-glow': '/artwork/worlds/auto-worlds-28.jpg',
  'ew-velvet-emotions': '/artwork/worlds/auto-worlds-35.jpg',
  'ew-ocean-dreams': '/artwork/worlds/auto-worlds-32.jpg',
  'ew-city-rain': '/artwork/worlds/auto-worlds-26.jpg',
  'ew-uplift-boost': '/artwork/worlds/auto-worlds-40.jpg',
  'ew-melancholy-bloom': '/artwork/worlds/auto-worlds-34.jpg',
  'rainy-window': '/artwork/worlds/world-midnight-lake.jpg',
  'midnight reflection': '/artwork/worlds/world-midnight-lake.jpg',
  'city rain': '/artwork/worlds/auto-worlds-26.jpg',
  'sunday-morning': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'afro sunset': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'heartbreak-recovery': '/artwork/worlds/world-serene-waterfall.jpg',
  'healing slowly': '/artwork/worlds/world-serene-waterfall.jpg',
  'melancholy bloom': '/artwork/worlds/auto-worlds-34.jpg',
  'midnight-drive': '/artwork/worlds/auto-worlds-19.jpg',
  'night drive': '/artwork/worlds/auto-worlds-19.jpg',
  'city-lights': '/artwork/worlds/auto-worlds-28.jpg',
  'sunset glow': '/artwork/worlds/auto-worlds-28.jpg',
  'ocean dreams': '/artwork/worlds/auto-worlds-32.jpg',
  'focus-room': '/artwork/worlds/world-late-night-focus.jpg',
  'velvet emotions': '/artwork/worlds/auto-worlds-35.jpg',
  'uplift boost': '/artwork/worlds/auto-worlds-40.jpg',
}

/** Full-screen player / lyrics / waveform backgrounds */
export const playerBackgrounds: Record<PlayerBackgroundType, string> = {
  master: '/artwork/player-backgrounds/player-bg-neon-cyberpunk.jpg',
  player2: '/artwork/worlds/world-midnight-lake.jpg',
  player3: '/artwork/heroes/hero-golden-peaks.jpg',
  player4: '/artwork/worlds/world-late-night-focus.jpg',
  player5: '/artwork/player-backgrounds/auto-player-backgrounds-21.jpg',
  waveform: '/artwork/worlds/world-midnight-lake.jpg',
  lyrics: '/artwork/worlds/world-serene-waterfall.jpg',
}

/** Premium screen hero / feature art */
export const premiumArtwork: Record<PremiumArtworkKey, string> = {
  default: '/artwork/premium/premium-spiritual-immersion.jpg',
  hero: '/artwork/premium/premium-spiritual-immersion.jpg',
}

/** Artist name/id → standalone portrait (never song/album art) */
export const artistPortraits: Record<string, string> = {
  'wills afrobeats': artistWillsAfrobeats,
  'caasi wills': artistCaasiWills,
}

const artistPortraitById: Record<string, string> = {}

function lookupById(idMap: Record<string, string>, id?: string | null): string | null {
  if (!id) return null
  return idMap[id] ?? null
}

function lookupByName(map: Record<string, string>, name?: string | null): string | null {
  if (!name) return null
  return map[normalizeArtworkKey(name)] ?? null
}

export function resolveHeroArtwork(key: HeroArtworkKey = 'home'): string {
  return heroArtwork[key] ?? heroArtwork.home
}

export function resolvePremiumArtwork(key: PremiumArtworkKey = 'default'): string {
  return premiumArtwork[key] ?? premiumArtwork.default
}

export function resolvePlaylistCover(playlist: PlaylistArtworkInput): string | null {
  const byId = lookupById(playlistCovers, playlist.id ?? undefined)
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
    const byScene = lookupById(worldArtwork, world.sceneId ?? undefined)
    if (byScene) return byScene
  }

  if (world.sceneId) {
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

/** Catalog song artwork only — no UI registry fallback */
export function resolveSongArtwork(song: ApiSong | null | undefined): string | null {
  if (!song) return null
  if (isValidArtworkUrl(song.artwork)) return song.artwork.trim()
  return null
}

/** Catalog album artwork only — no UI registry fallback */
export function resolveAlbumArtwork(
  album: ApiAlbum | null | undefined,
  _artistName?: string | null,
): string | null {
  if (!album) return null
  if (isValidArtworkUrl(album.artwork)) return album.artwork.trim()
  return null
}

export function resolveArtistPortrait(artist: ApiArtist | null | undefined): string | null {
  if (!artist) return null

  const byId = artistPortraitById[artist.id] ?? lookupById(artistPortraits, artist.id)
  if (byId) return byId

  const byName = lookupByName(artistPortraits, artist.name)
  if (byName) return byName

  if (isValidArtworkUrl(artist.artwork)) return artist.artwork.trim()

  return artistPlaceholder
}

export function listMissingRegistryAssets(): string[] {
  return []
}
