import type { ApiSong } from './api'

const DEV_TEST_AUDIO_URL_BASE = 'https://example.com/hidden-tunes-dev-audio'

/** Structured markers for desktop-only audio-version harness fixtures. */
export const DEV_AUDIO_VERSION_ID_PREFIX = 'dev-audio-version-'
export const DEV_AUDIO_VERSION_TAG = 'desktop-dev'

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
    tags: [DEV_AUDIO_VERSION_TAG, 'audio-versions'],
    description: 'Developer-only desktop test object for audio version UI.',
    artwork: null,
    previewUrl: null,
    audioUrl: null,
    highQualityUrl: null,
    audioVersions: undefined,
    durationSeconds: 42,
    createdAt: '2026-06-13T00:00:00.000Z',
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

/**
 * Explicit diagnostic access only — never merge into the public catalog provider.
 * Fixtures remain available to harness/scripts that call this directly.
 */
export function getDevAudioVersionTestSongs(): readonly ApiSong[] {
  return DEV_AUDIO_VERSION_TEST_SONGS
}

/** True for structured desktop harness fixtures (id prefix and/or desktop-dev tag). */
export function isInternalDevCatalogSong(
  song: Pick<ApiSong, 'id'> & { tags?: string[] | null },
): boolean {
  const id = String(song.id || '')
  if (id.startsWith(DEV_AUDIO_VERSION_ID_PREFIX)) return true
  const tags = song.tags
  return Array.isArray(tags) && tags.includes(DEV_AUDIO_VERSION_TAG)
}

/** Fail-safe: strip harness / desktop-dev songs from any public-facing song list. */
export function excludeInternalDevCatalogSongs(songs: ApiSong[]): ApiSong[] {
  return songs.filter((song) => !isInternalDevCatalogSong(song))
}

/**
 * Public catalog path: never inject harness songs.
 * Always excludes structured internal fixtures if present in the source list.
 *
 * @deprecated Name retained for call-site compatibility; does not prepend test songs.
 */
export function withDevAudioVersionTestSongs(songs: ApiSong[]): ApiSong[] {
  return excludeInternalDevCatalogSongs(songs)
}
