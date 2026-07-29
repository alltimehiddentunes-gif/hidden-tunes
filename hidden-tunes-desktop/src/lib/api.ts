import {
  buildAudioVersionsFromLegacy,
  type SongAudioVersions,
} from './audioVersions'
import {
  normalizeCatalogDisplayText,
  pickAlbumTitleFromRecord,
  pickArtistNameFromRecord,
} from './catalogDisplayText'
import { getExpressCatalogBaseUrlOrThrow } from './config/desktopRuntimeConfig'
import { MUSIC_CATALOG_PAGE_SIZE } from './musicCatalog/types'

export type { AudioVersionSource, SongAudioVersions } from './audioVersions'

/**
 * Express music catalog API base.
 * Resolved via desktopRuntimeConfig — packaged builds never silently default.
 */
export function getApiBaseUrl(): string {
  return getExpressCatalogBaseUrlOrThrow()
}

/** @deprecated Prefer getApiBaseUrl() — kept for diagnostics string reads in dev. */
export const API_BASE_URL = (() => {
  try {
    return getExpressCatalogBaseUrlOrThrow()
  } catch {
    return ''
  }
})()

const REQUEST_TIMEOUT_MS = 20_000

export const CATALOG_SEARCH_MAX_RESULTS = 240
export const CATALOG_SEARCH_LIGHTWEIGHT_LIMIT = 80

export type ApiSyncedLyricLine = {
  text: string
  timestampMs: number
}

export type ApiSong = {
  id: string
  title: string
  artist: string
  artistId: string | null
  album: string
  albumId: string | null
  genre: string | null
  mood: string | null
  tags: string[]
  description: string | null
  artwork: string | null
  /** Optional lightweight preview — resolved on play, not required for search. */
  previewUrl: string | null
  /** Optional stream/audio URL — resolved on play, not required for search. */
  audioUrl: string | null
  /** Optional higher-quality source — future upgrade path. */
  highQualityUrl: string | null
  /** Multi-tier playable sources — populated from legacy fields today. */
  audioVersions?: SongAudioVersions
  durationSeconds: number | null
  createdAt: string | null
  /** Plain-text lyrics when supplied by catalog — not populated in desktop preview yet. */
  lyrics?: string | null
  /** Timestamped lyric lines when supplied by catalog. */
  syncedLyrics?: ApiSyncedLyricLine[] | null
  /** Pre-split plain lyric lines when supplied separately from `lyrics`. */
  lyricLines?: string[] | null
  lyricsSource?: string | null
}

export type ApiAlbum = {
  id: string
  title: string
  artwork: string | null
  releaseYear: number | null
  createdAt: string | null
  artistId: string | null
  releaseType?: string | null
}

export type SongSort = 'latest' | 'az'
export type ArtistSort = 'az' | 'tracks'
export type AlbumSort = 'latest' | 'az'

export type CatalogBundle = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
}

export type ApiArtist = {
  id: string
  name: string
  artwork: string | null
  songCount: number
  tracks: ApiSong[]
}

type PaginationOptions = {
  limit?: number
  page?: number
  query?: string
  genre?: string
}

export type CatalogPagePayload<T> = {
  items: T[]
  total: number | null
  page: number
  limit: number
}

function buildQuery(options?: PaginationOptions) {
  const limit = Math.min(Math.max(options?.limit ?? MUSIC_CATALOG_PAGE_SIZE, 1), 100)
  const page = Math.max(options?.page ?? 1, 1)
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
  })
  const q = options?.query?.trim()
  if (q) params.set('q', q)
  const genre = options?.genre?.trim()
  if (genre) params.set('genre', genre)
  return params
}

function pickHttpUrl(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim().startsWith('http')) {
      return value.trim()
    }
  }
  return null
}

function pickPlaybackUrls(row: Record<string, unknown>) {
  const previewUrl = pickHttpUrl(row, ['previewUrl', 'preview_url'])
  const streamUrl = pickHttpUrl(row, ['streamUrl', 'stream_url', 'url'])
  const audioUrl = pickHttpUrl(row, ['audioUrl', 'audio_url']) ?? streamUrl
  const highQualityUrl = pickHttpUrl(row, ['highQualityUrl', 'high_quality_url'])
  const losslessUrl = pickHttpUrl(row, ['losslessUrl', 'lossless_url'])
  const durationSeconds = pickDurationSeconds(row)

  const audioVersions = buildAudioVersionsFromLegacy({
    previewUrl,
    streamUrl,
    audioUrl,
    highQualityUrl,
    losslessUrl,
    durationSeconds,
  })

  const resolvedHighQuality =
    highQualityUrl ?? audioVersions?.highQuality?.url ?? null

  return {
    previewUrl,
    audioUrl: audioUrl ?? previewUrl,
    highQualityUrl:
      resolvedHighQuality && resolvedHighQuality !== previewUrl
        ? resolvedHighQuality
        : null,
    audioVersions,
  }
}


function pickDurationSeconds(row: Record<string, unknown>): number | null {
  const candidates = [row.duration_seconds, row.duration]

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value
    }
  }

  return null
}

function pickSongArtwork(row: Record<string, unknown>): string | null {
  const candidates = [
    row.artwork,
    row.artwork_url,
    row.cover_url,
    row.cover,
    row.album_artwork_url,
    row.thumbnail,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().startsWith('http')) {
      return value.trim()
    }
  }

  return null
}

function pickAlbumArtwork(row: Record<string, unknown>): string | null {
  const candidates = [
    row.artwork,
    row.artwork_url,
    row.cover_url,
    row.cover,
    row.album_artwork_url,
    row.thumbnail,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().startsWith('http')) {
      return value.trim()
    }
  }

  return null
}

function pickArtistPortrait(row: Record<string, unknown>): string | null {
  return pickHttpUrl(row, [
    'image_url',
    'avatar_url',
    'portrait_url',
    'artist_image_url',
  ])
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function pickSyncedLyricLines(value: unknown): ApiSyncedLyricLine[] | null {
  if (!Array.isArray(value)) return null
  const lines: ApiSyncedLyricLine[] = []
  for (const entry of value) {
    const record = asRecord(entry)
    if (!record) continue
    const text = typeof record.text === 'string'
      ? record.text.trim()
      : typeof record.line === 'string'
        ? record.line.trim()
        : ''
    const timestampMs = typeof record.timestampMs === 'number'
      ? record.timestampMs
      : typeof record.timestamp_ms === 'number'
        ? record.timestamp_ms
        : typeof record.time === 'number'
          ? record.time
          : null
    if (!text || timestampMs == null || !Number.isFinite(timestampMs)) continue
    lines.push({ text, timestampMs })
  }
  return lines.length > 0 ? lines : null
}

function pickLyricsFields(record: Record<string, unknown>) {
  const lyrics = typeof record.lyrics === 'string' ? record.lyrics.trim() : null
  const lyricsSource = typeof record.lyrics_source === 'string'
    ? record.lyrics_source.trim()
    : typeof record.lyricsSource === 'string'
      ? record.lyricsSource.trim()
      : null
  const lyricLines = pickStringList(record.lyric_lines ?? record.lyricLines)
  const syncedLyrics = pickSyncedLyricLines(record.synced_lyrics ?? record.syncedLyrics)

  return {
    lyrics: lyrics || null,
    lyricLines: lyricLines.length > 0 ? lyricLines : null,
    syncedLyrics,
    lyricsSource: lyricsSource || null,
  }
}

function pickStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const items: string[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim()
      if (trimmed) items.push(trimmed)
    }
  }
  return items
}

function pickOptionalId(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return null
}

function normalizeSong(row: unknown): ApiSong | null {
  const record = asRecord(row)
  if (!record || record.id == null) return null

  const createdAt =
    typeof record.created_at === 'string' ? record.created_at : null
  const playback = pickPlaybackUrls(record)
  const nestedAlbum = asRecord(record.album) ?? asRecord(record.albums)
  const directArtwork = pickSongArtwork(record)
  const albumArtwork = nestedAlbum ? pickAlbumArtwork(nestedAlbum) : null
  const lyricsFields = pickLyricsFields(record)
  const title =
    normalizeCatalogDisplayText(
      typeof record.title === 'string' ? record.title : null,
    ) || 'Untitled'
  // Preserve genuine catalog strings (including "Singles"); never String(object).
  const artist = pickArtistNameFromRecord(record) || ''
  const album = pickAlbumTitleFromRecord(record) || ''

  return {
    id: String(record.id),
    title,
    artist,
    artistId: pickOptionalId(record, ['artistId', 'artist_id']),
    album,
    albumId: pickOptionalId(record, ['albumId', 'album_id']),
    genre:
      record.genre != null
        ? String(record.genre)
        : record.category != null
          ? String(record.category)
          : null,
    mood: record.mood != null ? String(record.mood) : null,
    tags: pickStringList(record.tags),
    description:
      typeof record.description === 'string' ? record.description.trim() : null,
    artwork: directArtwork ?? albumArtwork,
    previewUrl: playback.previewUrl,
    audioUrl: playback.audioUrl,
    highQualityUrl: playback.highQualityUrl,
    audioVersions: playback.audioVersions,
    durationSeconds: pickDurationSeconds(record),
    createdAt,
    ...lyricsFields,
  }
}

function normalizeAlbum(row: unknown): ApiAlbum | null {
  const record = asRecord(row)
  if (!record || record.id == null) return null

  const releaseYear =
    typeof record.release_year === 'number' ? record.release_year : null
  const createdAt =
    typeof record.created_at === 'string' ? record.created_at : null
  const title =
    normalizeCatalogDisplayText(
      typeof record.title === 'string' ? record.title : null,
    ) || 'Untitled Album'

  return {
    id: String(record.id),
    title,
    artwork: pickAlbumArtwork(record),
    releaseYear,
    createdAt,
    // Express catalog returns camelCase artistId; snake_case is legacy-only.
    artistId: pickOptionalId(record, ['artistId', 'artist_id']),
  }
}

function normalizeArtist(row: unknown): ApiArtist | null {
  const record = asRecord(row)
  if (!record || record.id == null) return null

  const rawTracks = Array.isArray(record.tracks) ? record.tracks : []
  const tracks = rawTracks
    .map((track) => normalizeSong(track))
    .filter((song): song is ApiSong => Boolean(song))

  const songCount =
    typeof record.songCount === 'number'
      ? record.songCount
      : typeof record.song_count === 'number'
        ? record.song_count
        : tracks.length

  const name =
    normalizeCatalogDisplayText(
      typeof record.name === 'string' ? record.name : null,
    ) || ''

  return {
    id: String(record.id),
    name,
    artwork: pickArtistPortrait(record),
    songCount,
    tracks,
  }
}

async function apiRequest<T>(path: string, externalSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  const abortFromExternal = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', abortFromExternal)
    }
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        asRecord(payload)?.error ||
        asRecord(payload)?.details ||
        `Request failed (${response.status})`
      throw new Error(String(message))
    }

    return payload as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (externalSignal?.aborted) throw error
      throw new Error('Request timed out — the API may be waking up. Try again.', {
        cause: error,
      })
    }
    if (error instanceof Error) throw error
    throw new Error('Unexpected network error', { cause: error })
  } finally {
    window.clearTimeout(timeout)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortFromExternal)
    }
  }
}

export async function fetchSongsPage(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<CatalogPagePayload<ApiSong>> {
  const limit = Math.min(Math.max(options?.limit ?? MUSIC_CATALOG_PAGE_SIZE, 1), 100)
  const page = Math.max(options?.page ?? 1, 1)
  const query = buildQuery({ ...options, limit, page })
  const payload = await apiRequest<unknown>(`/api/songs?${query.toString()}`, signal)
  const rows = Array.isArray(payload) ? payload : []
  const items = rows.map(normalizeSong).filter((song): song is ApiSong => Boolean(song))
  return { items, total: null, page, limit }
}

export async function fetchAlbumsPage(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<CatalogPagePayload<ApiAlbum>> {
  const limit = Math.min(Math.max(options?.limit ?? MUSIC_CATALOG_PAGE_SIZE, 1), 100)
  const page = Math.max(options?.page ?? 1, 1)
  const query = buildQuery({ ...options, limit, page })
  const payload = await apiRequest<{ albums?: unknown[]; count?: number }>(
    `/api/albums?${query.toString()}`,
    signal,
  )
  const rows = Array.isArray(payload?.albums) ? payload.albums : []
  const items = rows.map(normalizeAlbum).filter((album): album is ApiAlbum => Boolean(album))
  const total =
    typeof payload?.count === 'number' && Number.isFinite(payload.count)
      ? payload.count
      : null
  return { items, total, page, limit }
}

export async function fetchArtistsPage(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<CatalogPagePayload<ApiArtist>> {
  const limit = Math.min(Math.max(options?.limit ?? MUSIC_CATALOG_PAGE_SIZE, 1), 100)
  const page = Math.max(options?.page ?? 1, 1)
  const query = buildQuery({ ...options, limit, page })
  const payload = await apiRequest<{ artists?: unknown[]; count?: number }>(
    `/api/artists?${query.toString()}`,
    signal,
  )
  const rows = Array.isArray(payload?.artists) ? payload.artists : []
  const items = rows
    .map(normalizeArtist)
    .filter((artist): artist is ApiArtist => Boolean(artist))
  const total =
    typeof payload?.count === 'number' && Number.isFinite(payload.count)
      ? payload.count
      : null
  return { items, total, page, limit }
}

export async function fetchSongs(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<ApiSong[]> {
  const page = await fetchSongsPage(options, signal)
  return page.items
}

export async function fetchAlbums(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<ApiAlbum[]> {
  const page = await fetchAlbumsPage(options, signal)
  return page.items
}

export async function fetchArtists(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<ApiArtist[]> {
  const page = await fetchArtistsPage(options, signal)
  return page.items
}

/**
 * Bootstrap first pages only — never downloads the full catalogue.
 */
export async function fetchCatalogBundle(signal?: AbortSignal): Promise<CatalogBundle> {
  const [songs, albums, artists] = await Promise.all([
    fetchSongsPage({ limit: MUSIC_CATALOG_PAGE_SIZE, page: 1 }, signal),
    fetchAlbumsPage({ limit: MUSIC_CATALOG_PAGE_SIZE, page: 1 }, signal),
    fetchArtistsPage({ limit: MUSIC_CATALOG_PAGE_SIZE, page: 1 }, signal),
  ])
  return { songs: songs.items, albums: albums.items, artists: artists.items }
}

function normalizeQuery(query: string) {
  return query.trim().toLowerCase()
}

export function sortSongsList(songs: ApiSong[], sort: SongSort) {
  const list = [...songs]
  if (sort === 'az') {
    return list.sort((a, b) => a.title.localeCompare(b.title))
  }
  return list.sort((a, b) => {
    const bTime = Date.parse(b.createdAt || '') || 0
    const aTime = Date.parse(a.createdAt || '') || 0
    return bTime - aTime
  })
}

export function filterArtistsByQuery(artists: ApiArtist[], query: string) {
  const q = normalizeQuery(query)
  if (!q) return artists
  return artists.filter((artist) => artist.name.toLowerCase().includes(q))
}

export function sortArtistsList(artists: ApiArtist[], sort: ArtistSort) {
  const list = [...artists]
  if (sort === 'tracks') {
    return list.sort((a, b) => b.songCount - a.songCount || a.name.localeCompare(b.name))
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

export function filterAlbumsByQuery(
  albums: ApiAlbum[],
  query: string,
  artistNames: Map<string, string>,
) {
  const q = normalizeQuery(query)
  if (!q) return albums
  return albums.filter((album) => {
    const artistName = album.artistId
      ? artistNames.get(album.artistId) || ''
      : ''
    return (
      album.title.toLowerCase().includes(q) ||
      artistName.toLowerCase().includes(q)
    )
  })
}

export function sortAlbumsList(albums: ApiAlbum[], sort: AlbumSort) {
  const list = [...albums]
  if (sort === 'az') {
    return list.sort((a, b) => a.title.localeCompare(b.title))
  }
  return list.sort((a, b) => {
    const bTime = Date.parse(b.createdAt || '') || 0
    const aTime = Date.parse(a.createdAt || '') || 0
    return bTime - aTime
  })
}

export function buildArtistNameLookup(artists: ApiArtist[]) {
  return new Map(artists.map((artist) => [artist.id, artist.name]))
}
