import type { ApiAlbum, ApiArtist, ApiSong } from '../api'
import {
  fetchAlbumsPage,
  fetchArtistsPage,
  fetchSongsPage,
} from '../api'
import { getDesktopRuntimeConfig, getExpressCatalogBaseUrlOrThrow } from '../config/desktopRuntimeConfig'
import { dedupeAsync } from './dedupe'
import {
  readMusicCatalogPageCache,
  writeMusicCatalogPageCache,
} from './pageCache'
import {
  buildMusicCatalogRequestKey,
  CatalogRequestError,
  clampCatalogPageSize,
  inferHasMore,
  MUSIC_CATALOG_PAGE_SIZE,
  type MusicCatalogPageRequest,
  type MusicCatalogPageResult,
  type MusicCatalogResource,
} from './types'

type PagePayload<T> = {
  items: T[]
  total: number | null
  page: number
  limit: number
}

function resolveCatalogOriginTag() {
  try {
    const base = getDesktopRuntimeConfig().expressCatalogBaseUrl
    if (!base) return 'unconfigured'
    return new URL(base).hostname.toLowerCase()
  } catch {
    return 'unknown'
  }
}

function ensureConfig() {
  try {
    getExpressCatalogBaseUrlOrThrow()
  } catch (error) {
    throw new CatalogRequestError(
      'config',
      error instanceof Error ? error.message : 'Music catalog is not configured.',
    )
  }
}

async function fetchLivePage(
  resource: MusicCatalogResource,
  page: number,
  limit: number,
  query: string | undefined,
  signal: AbortSignal,
): Promise<PagePayload<ApiSong | ApiAlbum | ApiArtist>> {
  ensureConfig()
  try {
    if (resource === 'songs' || resource === 'song-search' || resource === 'genre-songs') {
      const result = await fetchSongsPage(
        {
          page,
          limit,
          query: resource === 'song-search' ? query : undefined,
          genre: resource === 'genre-songs' ? query : undefined,
        },
        signal,
      )
      return result
    }
    if (resource === 'albums') {
      return fetchAlbumsPage({ page, limit }, signal)
    }
    return fetchArtistsPage({ page, limit }, signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new CatalogRequestError('abort', 'Catalogue request cancelled.')
    }
    if (error instanceof CatalogRequestError) throw error
    const message = error instanceof Error ? error.message : 'Catalogue request failed.'
    if (/timed out/i.test(message)) {
      throw new CatalogRequestError('timeout', message)
    }
    if (/Failed to fetch|NetworkError|network/i.test(message)) {
      throw new CatalogRequestError('network', message)
    }
    throw new CatalogRequestError('unknown', message)
  }
}

/**
 * Load one music catalogue page with cache, dedupe, and cancellation.
 * Empty search results are not written to cache.
 */
export async function loadMusicCatalogPage<T extends ApiSong | ApiAlbum | ApiArtist>(
  request: MusicCatalogPageRequest,
): Promise<MusicCatalogPageResult<T>> {
  const page = Math.max(1, Math.floor(request.page || 1))
  const limit = clampCatalogPageSize(request.limit ?? MUSIC_CATALOG_PAGE_SIZE)
  const query = request.query?.trim() || undefined
  const origin = resolveCatalogOriginTag()
  const requestKey = buildMusicCatalogRequestKey({
    resource: request.resource,
    page,
    limit,
    query,
    origin,
  })

  const cached = readMusicCatalogPageCache<PagePayload<T>>(requestKey)
  if (cached && !cached.stale) {
    return {
      items: cached.payload.items,
      page: cached.payload.page,
      limit: cached.payload.limit,
      total: cached.payload.total,
      hasMore: inferHasMore(
        cached.payload.items.length,
        cached.payload.limit,
        cached.payload.total,
      ),
      requestKey,
      fromCache: true,
      stale: false,
    }
  }

  try {
    const live = await dedupeAsync(
      requestKey,
      (signal) =>
        fetchLivePage(request.resource, page, limit, query, signal) as Promise<
          PagePayload<T>
        >,
      request.signal,
    )

    const shouldCache =
      request.resource !== 'song-search' || live.items.length > 0

    if (shouldCache) {
      writeMusicCatalogPageCache(requestKey, live)
    }

    return {
      items: live.items,
      page: live.page,
      limit: live.limit,
      total: live.total,
      hasMore: inferHasMore(live.items.length, live.limit, live.total),
      requestKey,
      fromCache: false,
      stale: false,
    }
  } catch (error) {
    if (error instanceof CatalogRequestError && error.kind === 'abort') {
      throw error
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new CatalogRequestError('abort', 'Catalogue request cancelled.')
    }
    // Transport/config failures may fall back to stale cache when available.
    if (cached) {
      return {
        items: cached.payload.items,
        page: cached.payload.page,
        limit: cached.payload.limit,
        total: cached.payload.total,
        hasMore: inferHasMore(
          cached.payload.items.length,
          cached.payload.limit,
          cached.payload.total,
        ),
        requestKey,
        fromCache: true,
        stale: true,
      }
    }
    throw error
  }
}

export async function loadMusicCatalogBootstrap(signal?: AbortSignal) {
  const [songs, albums, artists] = await Promise.all([
    loadMusicCatalogPage<ApiSong>({
      resource: 'songs',
      page: 1,
      limit: MUSIC_CATALOG_PAGE_SIZE,
      signal,
    }),
    loadMusicCatalogPage<ApiAlbum>({
      resource: 'albums',
      page: 1,
      limit: MUSIC_CATALOG_PAGE_SIZE,
      signal,
    }),
    loadMusicCatalogPage<ApiArtist>({
      resource: 'artists',
      page: 1,
      limit: MUSIC_CATALOG_PAGE_SIZE,
      signal,
    }),
  ])

  return { songs, albums, artists }
}

export async function searchMusicSongsPage(input: {
  query: string
  page?: number
  limit?: number
  signal?: AbortSignal
}) {
  const query = input.query.trim()
  if (!query) {
    return loadMusicCatalogPage<ApiSong>({
      resource: 'songs',
      page: input.page ?? 1,
      limit: input.limit,
      signal: input.signal,
    })
  }
  return loadMusicCatalogPage<ApiSong>({
    resource: 'song-search',
    page: input.page ?? 1,
    limit: input.limit ?? MUSIC_CATALOG_PAGE_SIZE,
    query,
    signal: input.signal,
  })
}

export async function loadMusicGenreSongsPage(input: {
  genre: string
  page?: number
  limit?: number
  signal?: AbortSignal
}) {
  const genre = input.genre.trim()
  if (!genre) throw new CatalogRequestError('config', 'Genre is required.')
  return loadMusicCatalogPage<ApiSong>({
    resource: 'genre-songs',
    page: input.page ?? 1,
    limit: input.limit ?? MUSIC_CATALOG_PAGE_SIZE,
    query: genre,
    signal: input.signal,
  })
}
