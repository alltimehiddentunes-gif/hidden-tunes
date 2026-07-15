import { requestCatalogJsonWithFallback } from '../desktopCatalogBridge'
import type {
  TvCatalogResponse,
  TvCategoryMeta,
  TvChannelMeta,
  TvPagination,
  TvPlayResponse,
  TvRegionMeta,
} from './types'

/**
 * Public catalog API (Next.js admin) — same host as Radio/Podcasts.
 * Browse: /api/tv/channels (alias /api/tv/stations)
 * Play: /api/tv/channels/{id}/play
 */
export const TV_CATALOG_BASE_URL =
  import.meta.env.VITE_CATALOG_ADMIN_API_URL?.trim().replace(/\/+$/, '')
  || 'https://admin.hiddentunes.com'

export const TV_REQUEST_TIMEOUT_MS = 20_000

type PaginationOptions = {
  page?: number
  limit?: number
}

type FetchTvChannelsOptions = PaginationOptions & {
  category?: string | null
  country?: string | null
  featured?: boolean | null
  query?: string | null
  signal?: AbortSignal
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

async function tvRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  const { payload, status } = await requestCatalogJsonWithFallback(
    TV_CATALOG_BASE_URL,
    path,
    TV_REQUEST_TIMEOUT_MS,
  )

  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }

  if (status < 200 || status >= 300) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : null) || `TV request failed (${status})`
    throw new Error(message)
  }

  return payload as T
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 16)
}

function normalizeChannel(row: Record<string, unknown>): TvChannelMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title) return null

  const logo =
    typeof row.logo === 'string' && row.logo.startsWith('http')
      ? row.logo
      : typeof row.thumbnail_url === 'string' && row.thumbnail_url.startsWith('http')
        ? row.thumbnail_url
        : null

  const categories = normalizeStringArray(row.categories)
  if (categories.length === 0) {
    for (const key of ['category', 'genre', 'mood', 'format'] as const) {
      const value = typeof row[key] === 'string' ? row[key].trim() : ''
      if (value) categories.push(value)
    }
  }

  return {
    id,
    title,
    channelName:
      typeof row.channel_name === 'string' ? row.channel_name.trim() : null,
    artworkUrl: logo,
    country:
      typeof row.country === 'string'
        ? row.country.trim()
        : typeof row.region === 'string'
          ? row.region.trim()
          : null,
    language: typeof row.language === 'string' ? row.language.trim() : null,
    categories,
    tags: normalizeStringArray(row.tags),
    isFeatured: row.is_featured === true,
    reliabilityScore: Number.isFinite(Number(row.reliability_score))
      ? Number(row.reliability_score)
      : 0,
    streamProtocol:
      typeof row.stream_protocol === 'string' ? row.stream_protocol.trim() : null,
    streamIsHttps: row.stream_is_https === true,
    description:
      typeof row.description === 'string' ? row.description.trim() : null,
  }
}

function normalizePagination(
  raw: unknown,
  fallback: PaginationOptions,
  resultCount: number,
): TvPagination {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const page = Number(record.page || fallback.page || 1)
  const limit = Number(record.limit || fallback.limit || 20)
  const total = Number(record.total ?? resultCount)
  const totalPages = Number(record.totalPages || (total > 0 ? Math.ceil(total / limit) : 0))
  const hasMore = Boolean(record.hasMore ?? page < totalPages)

  return { page, limit, total, totalPages, hasMore }
}

export async function fetchTvCategories(signal?: AbortSignal): Promise<TvCategoryMeta[]> {
  const payload = await tvRequest<{
    success?: boolean
    categories?: unknown[]
  }>('/api/tv/categories', signal)

  const rows = Array.isArray(payload.categories) ? payload.categories : []
  return rows
    .map((row) => {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : null
      if (!record) return null
      const name = typeof record.name === 'string' ? record.name.trim() : ''
      const slug =
        typeof record.slug === 'string'
          ? record.slug.trim()
          : typeof record.id === 'string'
            ? record.id.trim()
            : ''
      if (!name || !slug) return null
      return {
        id: slug,
        name,
        slug,
        parentSlug:
          typeof record.parent_slug === 'string' ? record.parent_slug.trim() : null,
        count: 0,
      } satisfies TvCategoryMeta
    })
    .filter((entry): entry is TvCategoryMeta => Boolean(entry))
}

export async function fetchTvCategoryCount(
  categoryName: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetchTvChannels({
    category: categoryName,
    limit: 1,
    page: 1,
    signal,
  })
  return response.pagination.total
}

export async function fetchTvCountryCount(
  country: string,
  signal?: AbortSignal,
): Promise<number> {
  const response = await fetchTvChannels({
    country,
    limit: 1,
    page: 1,
    signal,
  })
  return response.pagination.total
}

export async function fetchTvRegionsFromCountries(
  countries: string[],
  signal?: AbortSignal,
): Promise<TvRegionMeta[]> {
  const unique = [...new Set(countries.map((entry) => entry.trim()).filter(Boolean))]
  const results = await Promise.all(
    unique.map(async (country) => {
      try {
        const count = await fetchTvCountryCount(country, signal)
        if (count <= 0) return null
        return {
          id: country.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: country,
          code: null,
          count,
        } as TvRegionMeta
      } catch {
        return null
      }
    }),
  )

  return results
    .filter((entry): entry is TvRegionMeta => Boolean(entry))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12)
}

export async function fetchTvChannels(
  options?: FetchTvChannelsOptions,
): Promise<TvCatalogResponse> {
  const query = buildQuery({
    page: options?.page ?? 1,
    limit: Math.min(Math.max(options?.limit ?? 24, 1), 40),
    category: options?.category ?? undefined,
    country: options?.country ?? undefined,
    featured: options?.featured === true ? 'true' : undefined,
    q: options?.query?.trim() || undefined,
  })

  const payload = await tvRequest<{
    success?: boolean
    videos?: unknown[]
    pagination?: TvPagination
  }>(`/api/tv/channels?${query.toString()}`, options?.signal)

  const channels = (Array.isArray(payload.videos) ? payload.videos : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeChannel(row as Record<string, unknown>)
        : null,
    )
    .filter((channel): channel is TvChannelMeta => Boolean(channel))

  return {
    success: payload.success === true,
    channels,
    pagination: normalizePagination(payload.pagination, options ?? {}, channels.length),
  }
}

export async function searchTvChannels(
  query: string,
  options?: PaginationOptions & { signal?: AbortSignal },
): Promise<TvCatalogResponse> {
  const trimmed = query.trim()
  if (trimmed.length < 2) {
    return {
      success: true,
      channels: [],
      pagination: {
        page: 1,
        limit: options?.limit ?? 24,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
    }
  }

  const params = buildQuery({
    q: trimmed,
    page: options?.page ?? 1,
    limit: Math.min(Math.max(options?.limit ?? 24, 1), 40),
  })

  const payload = await tvRequest<{
    success?: boolean
    videos?: unknown[]
    pagination?: TvPagination
  }>(`/api/tv/search?${params.toString()}`, options?.signal)

  const channels = (Array.isArray(payload.videos) ? payload.videos : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeChannel(row as Record<string, unknown>)
        : null,
    )
    .filter((channel): channel is TvChannelMeta => Boolean(channel))

  return {
    success: payload.success !== false,
    channels,
    pagination: normalizePagination(payload.pagination, options ?? {}, channels.length),
  }
}

export async function resolveTvPlayUrl(
  channelId: string,
): Promise<{ streamUrl: string; embedUrl: string | null; sourceType: string | null } | null> {
  const cleanId = channelId.trim()
  if (!cleanId) return null

  const payload = await tvRequest<TvPlayResponse>(
    `/api/tv/channels/${encodeURIComponent(cleanId)}/play`,
  )

  const streamUrl = typeof payload.stream_url === 'string' ? payload.stream_url.trim() : ''
  if (!streamUrl.startsWith('http')) return null

  return {
    streamUrl,
    embedUrl:
      typeof payload.embed_url === 'string' && payload.embed_url.startsWith('http')
        ? payload.embed_url.trim()
        : null,
    sourceType:
      typeof payload.source_type === 'string' ? payload.source_type.trim() : null,
  }
}
