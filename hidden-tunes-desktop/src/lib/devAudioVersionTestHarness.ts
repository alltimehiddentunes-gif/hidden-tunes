import type { ApiSong } from './api'

const DEV_TEST_AUDIO_URL_BASE = 'https://example.com/hidden-tunes-dev-audio'

function devSong(overrides: Partial<ApiSong> & Pick<ApiSong, 'id' | 'title'>): ApiSong {
  return {
    ...overrides,
    id: overrides.id,
    title: overrides.title,
    artist: 'Hidden Tunes QA',
    artistId: null,
    album: 'Desktop Audio Version Harness',
    albumId: null,
    genre: 'Diagnostics',
    mood: 'Focus',
    tags: ['desktop-dev', 'audio-versions'],
    description: 'Developer-only desktop test object for audio version UI.',
    artwork: null,
    previewUrl: null,
    audioUrl: null,
    highQualityUrl: null,
    audioVersions: undefined,
    durationSeconds: 42,
    createdAt: '2026-06-13T00:00:00.000Z'
  }
}

const DEV_AUDIO_VERSION_TEST_SONGS: ApiSong[] = [
  devSong({
    id: 'dev-audio-version-full',
    title: 'DEV Audio Versions: All Tiers',
    previewUrl: `${DEV_TEST_AUDIO_URL_BASE}/full-preview.mp3`,
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/full-legacy.mp3`,
    highQualityUrl: `${DEV_TEST_AUDIO_URL_BASE}/full-high.mp3`,
    audioVersions: {
      ultraLight: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-ultra.mp3` },
      standard: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-standard.mp3` },
      highQuality: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-high.mp3` },
      lossless: { url: `${DEV_TEST_AUDIO_URL_BASE}/full-lossless.flac` },
    },
  }),
  devSong({
    id: 'dev-audio-version-lean',
    title: 'DEV Audio Versions: Ultra + Standard',
    previewUrl: `${DEV_TEST_AUDIO_URL_BASE}/lean-preview.mp3`,
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/lean-legacy.mp3`,
    audioVersions: {
      ultraLight: { url: `${DEV_TEST_AUDIO_URL_BASE}/lean-ultra.mp3` },
      standard: { url: `${DEV_TEST_AUDIO_URL_BASE}/lean-standard.mp3` },
    },
  }),
  devSong({
    id: 'dev-audio-version-high-only',
    title: 'DEV Audio Versions: High Quality Only',
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/high-legacy.mp3`,
    highQualityUrl: `${DEV_TEST_AUDIO_URL_BASE}/high-only.mp3`,
    audioVersions: {
      highQuality: { url: `${DEV_TEST_AUDIO_URL_BASE}/high-only.mp3` },
    },
  }),
  devSong({
    id: 'dev-audio-version-legacy-only',
    title: 'DEV Audio Versions: Legacy Only',
    audioUrl: `${DEV_TEST_AUDIO_URL_BASE}/legacy-only.mp3`,
  }),
]

export function withDevAudioVersionTestSongs(songs: ApiSong[]): ApiSong[] {
  if (!import.meta.env.DEV) return songs

  const existingIds = new Set(songs.map((song) => song.id))
  const missingDevSongs = DEV_AUDIO_VERSION_TEST_SONGS.filter(
    (song) => !existingIds.has(song.id),
  )

  return missingDevSongs.length > 0 ? [...missingDevSongs, ...songs] : songs
}
