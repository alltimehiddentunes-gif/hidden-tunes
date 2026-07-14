import type { ApiSong } from '../api'
import type { RadioStationMeta } from './types'

export const RADIO_SONG_ID_PREFIX = 'radio-'

export function radioStationSongId(stationId: string) {
  return `${RADIO_SONG_ID_PREFIX}${stationId}`
}

export function extractRadioStationId(songId: string): string | null {
  if (!songId.startsWith(RADIO_SONG_ID_PREFIX)) return null
  const stationId = songId.slice(RADIO_SONG_ID_PREFIX.length).trim()
  return stationId || null
}

export function isRadioQueueSong(song: ApiSong | null | undefined) {
  return Boolean(song?.id?.startsWith(RADIO_SONG_ID_PREFIX))
}

function formatStationSubtitle(station: RadioStationMeta) {
  const parts = [
    station.country || station.countryCode,
    station.codec && station.bitrate ? `${station.codec} · ${station.bitrate}kbps` : station.codec,
    ...station.tags.slice(0, 2),
  ].filter(Boolean)
  return parts.join(' · ') || 'Live radio'
}

export function radioStationToApiSong(
  station: RadioStationMeta,
  streamUrl: string | null = null,
): ApiSong {
  const subtitle = formatStationSubtitle(station)
  const normalizedStream = streamUrl?.trim().startsWith('http') ? streamUrl.trim() : null

  return {
    id: radioStationSongId(station.id),
    title: station.name,
    artist: subtitle,
    artistId: null,
    album: 'Live Radio',
    albumId: null,
    genre: station.categories[0] ?? station.tags[0] ?? 'Radio',
    mood: null,
    tags: station.tags,
    description: null,
    artwork: station.artworkUrl,
    previewUrl: normalizedStream,
    audioUrl: normalizedStream,
    highQualityUrl: null,
    durationSeconds: null,
    createdAt: null,
  }
}

export function buildRadioQueueSongs(stations: RadioStationMeta[]) {
  return stations.map((station) => radioStationToApiSong(station))
}
