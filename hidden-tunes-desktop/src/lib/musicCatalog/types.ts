export const MUSIC_CATALOG_PAGE_SIZE = 40
export const MUSIC_CATALOG_MAX_PAGE_SIZE = 100
export const MUSIC_CATALOG_CACHE_VERSION = 2
export const MUSIC_CATALOG_CACHE_TTL_MS = 1000 * 60 * 60 * 6 // 6 hours
export const MUSIC_CATALOG_CACHE_MAX_ENTRIES = 48
/** Soft byte budget for serialized page cache (~1.5 MB). */
export const MUSIC_CATALOG_CACHE_MAX_BYTES = 1_500_000

export type MusicCatalogResource = 'songs' | 'albums' | 'artists' | 'song-search' | 'genre-songs'

export type MusicCatalogPageRequest = {
  resource: MusicCatalogResource
  page: number
  limit?: number
  query?: string
  signal?: AbortSignal
}

export type MusicCatalogPageResult<T> = {
  items: T[]
  page: number
  limit: number
  /** Present when API wraps with count (albums/artists). */
  total: number | null
  hasMore: boolean
  requestKey: string
  fromCache: boolean
  stale: boolean
}

export type CatalogRequestErrorKind =
  | 'config'
  | 'network'
  | 'timeout'
  | 'http'
  | 'abort'
  | 'unknown'

export class CatalogRequestError extends Error {
  kind: CatalogRequestErrorKind
  status: number | null

  constructor(kind: CatalogRequestErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'CatalogRequestError'
    this.kind = kind
    this.status = status
  }
}

export function clampCatalogPageSize(limit?: number) {
  const n = typeof limit === 'number' && Number.isFinite(limit) ? Math.floor(limit) : MUSIC_CATALOG_PAGE_SIZE
  return Math.min(MUSIC_CATALOG_MAX_PAGE_SIZE, Math.max(1, n))
}

export function buildMusicCatalogRequestKey(input: {
  resource: MusicCatalogResource
  page: number
  limit: number
  query?: string
  /** Express API hostname — prevents production/dev cache collisions. */
  origin?: string | null
}) {
  const q = (input.query || '').trim().toLowerCase()
  const origin = (input.origin || 'unknown').trim().toLowerCase() || 'unknown'
  return `v${MUSIC_CATALOG_CACHE_VERSION}:${origin}:${input.resource}:p${input.page}:l${input.limit}:q=${encodeURIComponent(q)}`
}

export function inferHasMore(itemCount: number, limit: number, total: number | null) {
  if (typeof total === 'number' && Number.isFinite(total)) {
    // When API returns a page whose length equals reported count and count < limit,
    // treat as exhausted (albums probe returned count=len).
    if (itemCount < limit) return false
    // If total equals this page length and page is 1 with full limit, may still have more
    // when total === limit. Prefer itemCount === limit as hasMore signal.
    return itemCount >= limit
  }
  return itemCount >= limit
}
