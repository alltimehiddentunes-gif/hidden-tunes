#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
registry = ROOT / 'src/data/artworkRegistry.ts'
integrity = ROOT / 'src/lib/artworkIntegrity.ts'

text = registry.read_text()
old = """export const worldArtwork: Record<string, string> = {
  'rainy-window': '/artwork/worlds/world-midnight-lake.jpg',
  'midnight reflection': '/artwork/worlds/world-midnight-lake.jpg',
  'city rain': '/artwork/worlds/world-midnight-lake.jpg',
  'sunday-morning': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'afro sunset': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'heartbreak-recovery': '/artwork/worlds/world-serene-waterfall.jpg',
  'healing slowly': '/artwork/worlds/world-serene-waterfall.jpg',
  'melancholy bloom': '/artwork/worlds/world-serene-waterfall.jpg',
  'midnight-drive': '/artwork/playlists/playlist-night-drive.jpg',
  'night drive': '/artwork/playlists/playlist-night-drive.jpg',
  'city-lights': '/artwork/heroes/hero-golden-peaks.jpg',
  'sunset glow': '/artwork/worlds/world-afro-sunset-savanna.jpg',
  'ocean dreams': '/artwork/worlds/world-midnight-lake.jpg',
  'focus-room': '/artwork/worlds/world-late-night-focus.jpg',
  'velvet emotions': '/artwork/worlds/world-serene-waterfall.jpg',
  'uplift boost': '/artwork/heroes/hero-afrobeats-celebration.jpg',
}"""
new = """export const worldArtwork: Record<string, string> = {
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
}"""
if old not in text:
    raise SystemExit('registry block missing')
registry.write_text(text.replace(old, new))

itext = integrity.read_text()
old_fn = """export function getArtworkForWorld(
  world: WorldArtworkTarget,
  songs: ApiSong[],
  context?: ArtworkContext,
): string | null {
  const registryArt = resolveWorldArtwork(world)
  if (registryArt) return registryArt

  if (!world.sceneId) return null

  const worldTracks = filterSongsByListeningScene(songs, world.sceneId)
  for (const song of worldTracks) {
    const artwork = context ? getArtworkForSong(song, context) : resolveSongArtwork(song)
    if (artwork) return artwork
  }

  return null
}"""
new_fn = """export function getArtworkForWorld(
  world: WorldArtworkTarget,
  _songs?: ApiSong[],
  _context?: ArtworkContext,
): string | null {
  return resolveWorldArtwork(world)
}"""
if old_fn not in itext:
    raise SystemExit('integrity fn missing')
itext = itext.replace(old_fn, new_fn)
itext = itext.replace("import { filterSongsByListeningScene } from './sceneListening'\n", '')
integrity.write_text(itext)
print('registry + integrity patched')
