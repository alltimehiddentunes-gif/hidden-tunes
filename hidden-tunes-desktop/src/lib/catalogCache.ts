import type { ApiAlbum, ApiArtist, ApiSong, CatalogBundle } from './api'

const STORAGE_KEY = 'ht-desktop:catalog-cache'

export type CachedCatalogRecord = {
  songs: ApiSong[]
  albums: ApiAlbum[]
  artists: ApiArtist[]
  cachedAt: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function sanitizeArtwork(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('http')) return null
  return trimmed
}

function sanitizeAudioUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed.startsWith('http')) return null
  return trimmed
}

function sanitizeDurationSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function sanitizeSong(raw: unknown): ApiSong | null {
  const record = asRecord(raw)
  if (!record || typeof record.id !== 'string' || typeof record.title !== 'string') {
    return null
  }

  return {
    id: record.id,
    title: record.title,
    artist: typeof record.artist === 'string' ? record.artist.trim() : '',
    artistId:
      typeof record.artistId === 'string'
        ? record.artistId
        : typeof record.artist_id === 'string'
          ? record.artist_id
          : null,
    album: typeof record.album === 'string' ? record.album : '',
    genre:
      typeof record.genre === 'string'
        ? record.genre
        : typeof record.category === 'string'
          ? record.category
          : null,
    artwork: sanitizeArtwork(record.artwork),
    audioUrl:
      sanitizeAudioUrl(record.audioUrl) ??
      sanitizeAudioUrl(record.url) ??
      sanitizeAudioUrl(record.audio_url),
    durationSeconds: sanitizeDurationSeconds(record.durationSeconds),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
  }
}

function sanitizeAlbum(raw: unknown): ApiAlbum | null {
  const record = asRecord(raw)
  if (!record || typeof record.id !== 'string' || typeof record.title !== 'string') {
    return null
  }

  return {
    id: record.id,
    title: record.title,
    artwork: sanitizeArtwork(record.artwork),
    releaseYear: typeof record.releaseYear === 'number' ? record.releaseYear : null,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
    artistId: typeof record.artistId === 'string' ? record.artistId : null,
  }
}

function sanitizeArtist(raw: unknown): ApiArtist | null {
  const record = asRecord(raw)
  if (!record || typeof record.id !== 'string' || typeof record.name !== 'string') {
    return null
  }

  const tracks = sanitizeList(record.tracks, sanitizeSong)

  return {
    id: record.id,
    name: record.name.trim(),
    artwork: sanitizeArtwork(record.artwork),
    songCount:
      typeof record.songCount === 'number' ? record.songCount : tracks.length,
    tracks,
  }
}

function sanitizeList<T>(
  value: unknown,
  sanitize: (raw: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) return []
  const items: T[] = []
  for (const entry of value) {
    const parsed = sanitize(entry)
    if (parsed) items.push(parsed)
  }
  return items
}

function sanitizeBundle(bundle: CatalogBundle): CachedCatalogRecord {
  return {
    songs: sanitizeList(bundle.songs, sanitizeSong),
    albums: sanitizeList(bundle.albums, sanitizeAlbum),
    artists: sanitizeList(bundle.artists, sanitizeArtist),
    cachedAt: new Date().toISOString(),
  }
}

function parseCachedCatalog(raw: unknown): CachedCatalogRecord | null {
  const record = asRecord(raw)
  if (!record || typeof record.cachedAt !== 'string') return null
  if (Number.isNaN(Date.parse(record.cachedAt))) return null

  const songs = sanitizeList(record.songs, sanitizeSong)
  const albums = sanitizeList(record.albums, sanitizeAlbum)
  const artists = sanitizeList(record.artists, sanitizeArtist)

  if (songs.length === 0 && albums.length === 0 && artists.length === 0) {
    return null
  }

  return { songs, albums, artists, cachedAt: record.cachedAt }
}

export function readCachedCatalog(): CachedCatalogRecord | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const item = localStorage.getItem(STORAGE_KEY)
    if (!item) return null
    return parseCachedCatalog(JSON.parse(item))
  } catch {
    return null
  }
}

export function writeCachedCatalog(bundle: CatalogBundle): void {
  try {
    if (typeof localStorage === 'undefined') return
    const sanitized = sanitizeBundle(bundle)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized))
  } catch {
    // Storage may be unavailable or full — ignore safely.
  }
}

export function clearCachedCatalog(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore removal failures.
  }
}

export function cachedCatalogToBundle(record: CachedCatalogRecord): CatalogBundle {
  return {
    songs: record.songs,
    albums: record.albums,
    artists: record.artists,
  }
}
