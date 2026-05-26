export const API_BASE_URL = 'https://hidden-tunes-api.onrender.com'

const REQUEST_TIMEOUT_MS = 20_000

export type ApiSong = {
  id: string
  title: string
  artist: string
  album: string
  artwork: string | null
}

export type ApiAlbum = {
  id: string
  title: string
  artwork: string | null
  releaseYear: number | null
}

export type ApiArtist = {
  id: string
  name: string
  artwork: string | null
  songCount: number
}

type PaginationOptions = {
  limit?: number
  page?: number
}

function buildQuery(options?: PaginationOptions) {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100)
  const page = Math.max(options?.page ?? 1, 1)
  return new URLSearchParams({
    limit: String(limit),
    page: String(page),
  })
}

function pickArtwork(row: Record<string, unknown>): string | null {
  const candidates = [
    row.artwork,
    row.cover,
    row.cover_url,
    row.thumbnail,
    row.image_url,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().startsWith('http')) {
      return value.trim()
    }
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function normalizeSong(row: unknown): ApiSong | null {
  const record = asRecord(row)
  if (!record || record.id == null) return null

  return {
    id: String(record.id),
    title: String(record.title || 'Untitled'),
    artist: String(
      record.artist || record.artist_name || 'Unknown Artist',
    ),
    album: String(record.album || record.album_title || 'Singles'),
    artwork: pickArtwork(record),
  }
}

function normalizeAlbum(row: unknown): ApiAlbum | null {
  const record = asRecord(row)
  if (!record || record.id == null) return null

  const releaseYear =
    typeof record.release_year === 'number' ? record.release_year : null

  return {
    id: String(record.id),
    title: String(record.title || 'Untitled Album'),
    artwork: pickArtwork(record),
    releaseYear,
  }
}

function normalizeArtist(row: unknown): ApiArtist | null {
  const record = asRecord(row)
  if (!record || record.id == null) return null

  const songCount =
    typeof record.songCount === 'number'
      ? record.songCount
      : Array.isArray(record.tracks)
        ? record.tracks.length
        : 0

  return {
    id: String(record.id),
    name: String(record.name || 'Unknown Artist'),
    artwork: pickArtwork(record),
    songCount,
  }
}

async function apiRequest<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
      throw new Error('Request timed out — the API may be waking up. Try again.')
    }
    if (error instanceof Error) throw error
    throw new Error('Unexpected network error')
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function fetchSongs(
  options?: PaginationOptions,
): Promise<ApiSong[]> {
  const query = buildQuery(options)
  const payload = await apiRequest<unknown>(`/api/songs?${query.toString()}`)
  const rows = Array.isArray(payload) ? payload : []
  return rows.map(normalizeSong).filter((song): song is ApiSong => Boolean(song))
}

export async function fetchAlbums(
  options?: PaginationOptions,
): Promise<ApiAlbum[]> {
  const query = buildQuery(options)
  const payload = await apiRequest<{ albums?: unknown[] }>(
    `/api/albums?${query.toString()}`,
  )
  const rows = Array.isArray(payload?.albums) ? payload.albums : []
  return rows.map(normalizeAlbum).filter((album): album is ApiAlbum => Boolean(album))
}

export async function fetchArtists(
  options?: PaginationOptions,
): Promise<ApiArtist[]> {
  const query = buildQuery({ ...options, limit: options?.limit ?? 48 })
  const payload = await apiRequest<{ artists?: unknown[] }>(
    `/api/artists?${query.toString()}`,
  )
  const rows = Array.isArray(payload?.artists) ? payload.artists : []
  return rows
    .map(normalizeArtist)
    .filter((artist): artist is ApiArtist => Boolean(artist))
}
