import { requestCatalogJsonWithFallback } from '../desktopCatalogBridge'
import type {
  PodcastCategoryMeta,
  PodcastEpisodeMeta,
  PodcastEpisodesResponse,
  PodcastPagination,
  PodcastPlayResponse,
  PodcastShowDetailResponse,
  PodcastShowMeta,
  PodcastShowsResponse,
} from './types'

function readCatalogBaseUrl() {
  const fromVite =
    typeof import.meta !== 'undefined'
    && import.meta.env
    && typeof import.meta.env.VITE_CATALOG_ADMIN_API_URL === 'string'
      ? import.meta.env.VITE_CATALOG_ADMIN_API_URL.trim().replace(/\/+$/, '')
      : ''
  return fromVite || 'https://admin.hiddentunes.com'
}

/**
 * Public catalog API (Next.js admin) — same host as Radio/TV/Motivationals.
 * Override with VITE_CATALOG_ADMIN_API_URL at build time.
 * In Electron, requests route through the main-process catalog bridge to avoid CORS.
 */
export const PODCAST_CATALOG_BASE_URL = readCatalogBaseUrl()

export const PODCAST_DEFAULT_PAGE_LIMIT = 20
export const PODCAST_MAX_PAGE_LIMIT = 40
export const PODCAST_REQUEST_TIMEOUT_MS = 20_000

export class PodcastCatalogError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'PodcastCatalogError'
    this.status = status
  }
}

type PaginationOptions = {
  page?: number
  limit?: number
}

function clampPageLimit(limit?: number) {
  return Math.min(Math.max(limit ?? PODCAST_DEFAULT_PAGE_LIMIT, 1), PODCAST_MAX_PAGE_LIMIT)
}

function clampPage(page?: number) {
  return Math.max(page ?? 1, 1)
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().slice(0, maxLength)
  return cleaned || null
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 12)
    }
    return []
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
}

function normalizePagination(
  raw: unknown,
  fallback: { page: number; limit: number; total: number },
): PodcastPagination {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const page = Number.isFinite(Number(record.page)) ? Number(record.page) : fallback.page
  const limit = Number.isFinite(Number(record.limit)) ? Number(record.limit) : fallback.limit
  const total = Number.isFinite(Number(record.total)) ? Number(record.total) : fallback.total
  const totalPages = Number.isFinite(Number(record.totalPages))
    ? Number(record.totalPages)
    : total > 0
      ? Math.ceil(total / limit)
      : 0
  const hasMore = typeof record.hasMore === 'boolean'
    ? record.hasMore
    : page < totalPages

  return { page, limit, total, totalPages, hasMore }
}

function normalizeShow(row: Record<string, unknown>): PodcastShowMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title) return null

  return {
    id,
    slug: cleanText(row.slug, 160) ?? id,
    title,
    description: cleanText(row.description, 1200),
    artworkUrl:
      typeof row.artwork_url === 'string' && row.artwork_url.startsWith('http')
        ? row.artwork_url
        : null,
    hostName: cleanText(row.host_name, 120),
    primaryCategory: cleanText(row.primary_category, 120),
    categories: normalizeStringArray(row.categories),
    language: cleanText(row.language, 40),
    publisher: cleanText(row.publisher, 160),
    episodeCount: Number.isFinite(Number(row.episode_count))
      ? Math.max(0, Number(row.episode_count))
      : 0,
    isFeatured: row.is_featured === true,
    isExclusive: row.is_exclusive === true,
    isVerified: row.is_verified === true,
    lastCheckedAt: cleanText(row.last_checked_at, 40),
  }
}

function normalizeEpisode(
  row: Record<string, unknown>,
  showTitleById?: Map<string, string>,
): PodcastEpisodeMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const showId = typeof row.show_id === 'string' ? row.show_id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title) return null

  return {
    id,
    showId,
    showTitle: showId ? showTitleById?.get(showId) ?? null : null,
    title,
    description: cleanText(row.description, 1200),
    artworkUrl:
      typeof row.artwork_url === 'string' && row.artwork_url.startsWith('http')
        ? row.artwork_url
        : null,
    durationSeconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    publishedAt: cleanText(row.published_at, 40),
    episodeNumber: Number.isFinite(Number(row.episode_number))
      ? Number(row.episode_number)
      : null,
    seasonNumber: Number.isFinite(Number(row.season_number))
      ? Number(row.season_number)
      : null,
    isVerified: row.is_verified === true,
    lastCheckedAt: cleanText(row.last_checked_at, 40),
  }
}

function buildQuery(
  params: Record<string, string | number | boolean | null | undefined>,
) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }
  return query
}

function readPodcastRequestError(error: unknown, signal?: AbortSignal): PodcastCatalogError {
  if (signal?.aborted) {
    return new PodcastCatalogError('Podcast request was cancelled.')
  }
  if (error instanceof PodcastCatalogError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new PodcastCatalogError('Podcast request timed out. Try again.')
  }
  if (error instanceof Error) {
    return new PodcastCatalogError(error.message)
  }
  return new PodcastCatalogError('Unexpected podcast network error')
}

async function podcastRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    throw new PodcastCatalogError('Podcast request was cancelled.')
  }

  try {
    const { payload, status } = await requestCatalogJsonWithFallback(
      PODCAST_CATALOG_BASE_URL,
      path,
      PODCAST_REQUEST_TIMEOUT_MS,
    )

    if (signal?.aborted) {
      throw new PodcastCatalogError('Podcast request was cancelled.')
    }

    if (status < 200 || status >= 300) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : null) || `Podcast request failed (${status})`
      throw new PodcastCatalogError(message, status)
    }

    return payload as T
  } catch (error) {
    throw readPodcastRequestError(error, signal)
  }
}

function buildShowTitleMap(shows: PodcastShowMeta[]) {
  return new Map(shows.map((show) => [show.id, show.title]))
}

function enrichEpisodesWithShowTitles(
  episodes: PodcastEpisodeMeta[],
  shows: PodcastShowMeta[],
): PodcastEpisodeMeta[] {
  if (shows.length === 0) return episodes
  const showTitleById = buildShowTitleMap(shows)
  return episodes.map((episode) => ({
    ...episode,
    showTitle: episode.showTitle ?? showTitleById.get(episode.showId) ?? null,
  }))
}

export async function fetchPodcastCategories(signal?: AbortSignal): Promise<PodcastCategoryMeta[]> {
  const payload = await podcastRequest<{ success?: boolean; categories?: unknown[] }>(
    '/api/podcasts/categories',
    signal,
  )

  const rows = Array.isArray(payload.categories) ? payload.categories : []
  return rows
    .map((row) => {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : null
      if (!record) return null
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      const name = typeof record.name === 'string' ? record.name.trim() : id
      const slug = cleanText(record.slug, 120) ?? id
      if (!id || !name) return null
      return {
        id,
        name,
        slug,
        description: cleanText(record.description, 500),
        sortOrder: Number.isFinite(Number(record.sort_order))
          ? Number(record.sort_order)
          : 0,
      }
    })
    .filter((entry): entry is PodcastCategoryMeta => Boolean(entry))
}

export type FetchPodcastShowsOptions = PaginationOptions & {
  query?: string | null
  category?: string | null
  featured?: boolean | null
}

export async function fetchPodcastFeaturedShows(
  options?: PaginationOptions,
  signal?: AbortSignal,
): Promise<PodcastShowsResponse> {
  const page = clampPage(options?.page)
  const limit = clampPageLimit(options?.limit)
  const query = buildQuery({ page, limit })

  const payload = await podcastRequest<{
    success?: boolean
    shows?: unknown[]
    pagination?: PodcastPagination
  }>(`/api/podcasts/featured?${query.toString()}`, signal)

  const shows = (Array.isArray(payload.shows) ? payload.shows : [])
    .map((row) =>
      row && typeof row === 'object' ? normalizeShow(row as Record<string, unknown>) : null,
    )
    .filter((show): show is PodcastShowMeta => Boolean(show))

  return {
    success: payload.success === true,
    shows,
    pagination: normalizePagination(payload.pagination, {
      page,
      limit,
      total: shows.length,
    }),
  }
}

export async function fetchPodcastShows(
  options?: FetchPodcastShowsOptions,
  signal?: AbortSignal,
): Promise<PodcastShowsResponse> {
  const page = clampPage(options?.page)
  const limit = clampPageLimit(options?.limit)
  const query = buildQuery({
    page,
    limit,
    q: options?.query?.trim() || undefined,
    category: options?.category?.trim() || undefined,
    is_featured: options?.featured === true ? 'true' : undefined,
  })

  const payload = await podcastRequest<{
    success?: boolean
    shows?: unknown[]
    pagination?: PodcastPagination
  }>(`/api/podcasts/shows?${query.toString()}`, signal)

  const shows = (Array.isArray(payload.shows) ? payload.shows : [])
    .map((row) =>
      row && typeof row === 'object' ? normalizeShow(row as Record<string, unknown>) : null,
    )
    .filter((show): show is PodcastShowMeta => Boolean(show))

  return {
    success: payload.success === true,
    shows,
    pagination: normalizePagination(payload.pagination, {
      page,
      limit,
      total: shows.length,
    }),
  }
}

export async function fetchPodcastShow(
  showId: string,
  signal?: AbortSignal,
): Promise<PodcastShowDetailResponse> {
  const cleanId = showId.trim()
  if (!cleanId) {
    throw new PodcastCatalogError('Podcast show id is required.')
  }

  const payload = await podcastRequest<{
    success?: boolean
    show?: unknown
  }>(`/api/podcasts/shows/${encodeURIComponent(cleanId)}`, signal)

  const record =
    payload.show && typeof payload.show === 'object'
      ? (payload.show as Record<string, unknown>)
      : null
  const show = record ? normalizeShow(record) : null

  if (!show) {
    throw new PodcastCatalogError('Podcast show not found.', 404)
  }

  return {
    success: payload.success === true,
    show,
  }
}

export type FetchPodcastEpisodesOptions = PaginationOptions & {
  showId?: string | null
  query?: string | null
  category?: string | null
}

export async function fetchPodcastEpisodes(
  options?: FetchPodcastEpisodesOptions,
  signal?: AbortSignal,
): Promise<PodcastEpisodesResponse> {
  const page = clampPage(options?.page)
  const limit = clampPageLimit(options?.limit)
  const query = buildQuery({
    page,
    limit,
    show_id: options?.showId?.trim() || undefined,
    q: options?.query?.trim() || undefined,
    category: options?.category?.trim() || undefined,
  })

  const payload = await podcastRequest<{
    success?: boolean
    episodes?: unknown[]
    shows?: unknown[]
    pagination?: PodcastPagination
  }>(`/api/podcasts/episodes?${query.toString()}`, signal)

  const shows = (Array.isArray(payload.shows) ? payload.shows : [])
    .map((row) =>
      row && typeof row === 'object' ? normalizeShow(row as Record<string, unknown>) : null,
    )
    .filter((show): show is PodcastShowMeta => Boolean(show))

  const showTitleById = buildShowTitleMap(shows)

  const episodes = (Array.isArray(payload.episodes) ? payload.episodes : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeEpisode(row as Record<string, unknown>, showTitleById)
        : null,
    )
    .filter((episode): episode is PodcastEpisodeMeta => Boolean(episode))

  return {
    success: payload.success === true,
    episodes: enrichEpisodesWithShowTitles(episodes, shows),
    shows,
    pagination: normalizePagination(payload.pagination, {
      page,
      limit,
      total: episodes.length,
    }),
  }
}

export async function resolvePodcastPlayUrl(
  episodeId: string,
  signal?: AbortSignal,
): Promise<PodcastPlayResponse | null> {
  const cleanId = episodeId.trim()
  if (!cleanId) return null

  const payload = await podcastRequest<{
    success?: boolean
    episode_id?: string
    show_id?: string
    title?: string
    audio_url?: string
    duration_seconds?: number | null
    published_at?: string | null
  }>(`/api/podcasts/episodes/${encodeURIComponent(cleanId)}/play`, signal)

  const audioUrl = typeof payload.audio_url === 'string' ? payload.audio_url.trim() : ''
  if (!audioUrl.startsWith('http')) return null

  return {
    success: payload.success === true,
    episodeId: typeof payload.episode_id === 'string' ? payload.episode_id : cleanId,
    showId: typeof payload.show_id === 'string' ? payload.show_id : '',
    title: typeof payload.title === 'string' ? payload.title : 'Untitled',
    audioUrl,
    durationSeconds: Number.isFinite(Number(payload.duration_seconds))
      ? Math.max(0, Number(payload.duration_seconds))
      : null,
    publishedAt: cleanText(payload.published_at, 40),
  }
}
