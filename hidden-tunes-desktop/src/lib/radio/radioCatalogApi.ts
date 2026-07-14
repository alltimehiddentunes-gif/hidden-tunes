import { requestCatalogJsonWithFallback } from '../desktopCatalogBridge'
import type {
  RadioCategoryMeta,
  RadioCountryMeta,
  RadioPlayResponse,
  RadioStationMeta,
  RadioStationsResponse,
} from './types'

/**
 * Public catalog API (Next.js admin) — same host as TV/Motivationals mobile adapters.
 * Override with VITE_CATALOG_ADMIN_API_URL at build time.
 * In Electron, requests route through the main-process catalog bridge to avoid CORS.
 */
export const RADIO_CATALOG_BASE_URL =
  import.meta.env.VITE_CATALOG_ADMIN_API_URL?.trim().replace(/\/+$/, '')
  || 'https://admin.hiddentunes.com'

export const RADIO_REQUEST_TIMEOUT_MS = 20_000

type PaginationOptions = {
  page?: number
  limit?: number
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

async function radioRequest<T>(path: string): Promise<T> {
  const { payload, status } = await requestCatalogJsonWithFallback(
    RADIO_CATALOG_BASE_URL,
    path,
    RADIO_REQUEST_TIMEOUT_MS,
  )

  if (status < 200 || status >= 300) {
    const message =
      (payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : null) || `Radio request failed (${status})`
    throw new Error(message)
  }

  return payload as T
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
}

function normalizeStation(row: Record<string, unknown>): RadioStationMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!id || !name) return null

  const popularity =
    row.popularity && typeof row.popularity === 'object'
      ? (row.popularity as Record<string, unknown>)
      : {}

  return {
    id,
    name,
    artworkUrl:
      typeof row.artwork_url === 'string' && row.artwork_url.startsWith('http')
        ? row.artwork_url
        : null,
    country: typeof row.country === 'string' ? row.country : null,
    countryCode:
      typeof row.country_code === 'string' ? row.country_code.toUpperCase() : null,
    language: typeof row.language === 'string' ? row.language : null,
    tags: normalizeStringArray(row.tags),
    categories: normalizeStringArray(row.categories),
    bitrate: Number.isFinite(Number(row.bitrate)) ? Number(row.bitrate) : null,
    codec: typeof row.codec === 'string' ? row.codec : null,
    qualityScore: Number.isFinite(Number(row.quality_score))
      ? Number(row.quality_score)
      : 0,
    reliabilityScore: Number.isFinite(Number(row.reliability_score))
      ? Number(row.reliability_score)
      : 0,
    isFeatured: row.is_featured === true,
    popularity: {
      votes: Math.max(0, Math.floor(Number(popularity.votes) || 0)),
      clickCount: Math.max(0, Math.floor(Number(popularity.click_count) || 0)),
    },
  }
}

export async function fetchRadioCategories(): Promise<RadioCategoryMeta[]> {
  const payload = await radioRequest<{ success?: boolean; categories?: unknown[] }>(
    '/api/radio/categories',
  )
  const rows = Array.isArray(payload.categories) ? payload.categories : []
  return rows
    .map((row) => {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : null
      if (!record) return null
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      const name = typeof record.name === 'string' ? record.name.trim() : id
      const count = Number.isFinite(Number(record.count)) ? Number(record.count) : 0
      if (!id || count <= 0) return null
      return { id, name, count }
    })
    .filter((entry): entry is RadioCategoryMeta => Boolean(entry))
}

export async function fetchRadioCountries(): Promise<RadioCountryMeta[]> {
  const payload = await radioRequest<{ success?: boolean; countries?: unknown[] }>(
    '/api/radio/countries',
  )
  const rows = Array.isArray(payload.countries) ? payload.countries : []
  return rows
    .map((row) => {
      const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : null
      if (!record) return null
      const id = typeof record.id === 'string' ? record.id.trim() : ''
      const name = typeof record.name === 'string' ? record.name.trim() : id
      const code = typeof record.code === 'string' ? record.code.toUpperCase() : null
      const count = Number.isFinite(Number(record.count)) ? Number(record.count) : 0
      if (!id || count <= 0) return null
      return { id, name, code, count }
    })
    .filter((entry): entry is RadioCountryMeta => Boolean(entry))
}

export type FetchRadioStationsOptions = PaginationOptions & {
  category?: string | null
  country?: string | null
  featured?: boolean | null
  query?: string | null
}

export async function fetchRadioStations(
  options?: FetchRadioStationsOptions,
): Promise<RadioStationsResponse> {
  const query = buildQuery({
    page: options?.page ?? 1,
    limit: Math.min(Math.max(options?.limit ?? 24, 1), 40),
    category: options?.category ?? undefined,
    country: options?.country ?? undefined,
    featured: options?.featured === true ? 'true' : undefined,
    q: options?.query?.trim() || undefined,
  })

  const payload = await radioRequest<{
    success?: boolean
    stations?: unknown[]
    pagination?: RadioStationsResponse['pagination']
  }>(`/api/radio/stations?${query.toString()}`)

  const stations = (Array.isArray(payload.stations) ? payload.stations : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeStation(row as Record<string, unknown>)
        : null,
    )
    .filter((station): station is RadioStationMeta => Boolean(station))

  return {
    success: payload.success === true,
    stations,
    pagination: payload.pagination ?? {
      page: options?.page ?? 1,
      limit: options?.limit ?? 24,
      total: stations.length,
      totalPages: stations.length > 0 ? 1 : 0,
      hasMore: false,
    },
  }
}

export async function resolveRadioPlayUrl(stationId: string): Promise<string | null> {
  const cleanId = stationId.trim()
  if (!cleanId) return null

  const payload = await radioRequest<RadioPlayResponse>(
    `/api/radio/stations/${encodeURIComponent(cleanId)}/play`,
  )

  const streamUrl = typeof payload.stream_url === 'string' ? payload.stream_url.trim() : ''
  return streamUrl.startsWith('http') ? streamUrl : null
}
