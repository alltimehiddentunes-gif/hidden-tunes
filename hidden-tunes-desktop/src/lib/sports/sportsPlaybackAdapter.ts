import type { ApiSong } from '../api'
import {
  extractSportsFixtureIdFromSongId,
  isSportsSongId,
  sportsFixtureSongId,
} from './identity'
import type { DesktopSportsFixture } from './types'

/**
 * Map a Sports fixture into the shared queue song shape.
 * Playback must use the desktop video path (caller wires usesDesktopVideoPath).
 */
export function sportsFixtureToApiSong(
  fixture: DesktopSportsFixture,
  streamUrl: string | null = null,
): ApiSong {
  const title =
    fixture.title
    || (fixture.homeTeam && fixture.awayTeam
      ? `${fixture.homeTeam} vs ${fixture.awayTeam}`
      : fixture.league || 'Sports')
  const subtitle = [fixture.league, fixture.sport, fixture.provider]
    .filter(Boolean)
    .join(' · ') || 'Sports'
  const normalizedStream =
    typeof streamUrl === 'string' && streamUrl.trim().startsWith('https://')
      ? streamUrl.trim()
      : null

  return {
    id: sportsFixtureSongId(fixture.id),
    title,
    artist: subtitle,
    artistId: null,
    album: fixture.league || 'Sports',
    albumId: null,
    genre: fixture.sport || 'Sports',
    mood: null,
    tags: ['sports', fixture.status, fixture.sportSlug || ''].filter(Boolean),
    description: fixture.venue || null,
    artwork: fixture.artwork,
    previewUrl: normalizedStream,
    audioUrl: normalizedStream,
    highQualityUrl: null,
    durationSeconds: null,
    createdAt: fixture.startTime,
  }
}

export function isSportsQueueSong(song: ApiSong | null | undefined) {
  return isSportsSongId(song?.id)
}

export function extractSportsFixtureId(songId: string): string | null {
  return extractSportsFixtureIdFromSongId(songId)
}
