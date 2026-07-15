import { requestCatalogJsonWithFallback } from '../desktopCatalogBridge'
import type {
  MotivationalBrowseResponse,
  MotivationalCategoryMeta,
  MotivationalPagination,
  MotivationalPlayResponse,
  MotivationalProgramDetailResponse,
  MotivationalProgramMeta,
  MotivationalProgramsResponse,
  MotivationalSearchResponse,
  MotivationalSessionMeta,
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

export const MOTIVATIONAL_CATALOG_BASE_URL = readCatalogBaseUrl()
export const MOTIVATIONAL_DEFAULT_PAGE_LIMIT = 40
export const MOTIVATIONAL_MAX_PAGE_LIMIT = 40
export const MOTIVATIONAL_REQUEST_TIMEOUT_MS = 20_000

export class MotivationalCatalogError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MotivationalCatalogError'
    this.status = status
  }
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().slice(0, maxLength)
  return cleaned || null
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
}

function cleanDescription(value: unknown, maxLength = 1600): string | null {
  const raw = cleanText(value, maxLength)
  if (!raw) return null
  return decodeEntities(
    raw
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/\s*p\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  ) || null
}

function clampPage(page?: number) {
  return Math.max(page ?? 1, 1)
}

function clampLimit(limit?: number) {
  return Math.min(Math.max(limit ?? MOTIVATIONAL_DEFAULT_PAGE_LIMIT, 1), MOTIVATIONAL_MAX_PAGE_LIMIT)
}

function normalizePagination(
  raw: unknown,
  fallback: { page: number; limit: number; total: number },
): MotivationalPagination {
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

export function normalizeMotivationalProgram(row: Record<string, unknown>): MotivationalProgramMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const slug = cleanText(row.slug, 180) ?? id
  if (!id || !title) return null

  return {
    id,
    slug,
    title,
    subtitle: cleanText(row.subtitle, 300),
    description: cleanDescription(row.description, 1600),
    artworkUrl:
      typeof row.artwork_url === 'string' && row.artwork_url.startsWith('http')
        ? row.artwork_url
        : null,
    creatorId: cleanText(row.creator_id, 80),
    categorySlug: cleanText(row.category_slug, 120),
    language: cleanText(row.language_code ?? row.language, 40),
    country: cleanText(row.country_code ?? row.country, 40),
    contentRating: cleanText(row.content_rating, 40),
    programType: cleanText(row.program_type, 80),
    sessionCount: Number.isFinite(Number(row.session_count))
      ? Math.max(0, Number(row.session_count))
      : 0,
    totalDurationSeconds: Number.isFinite(Number(row.total_duration_seconds))
      ? Math.max(0, Number(row.total_duration_seconds))
      : null,
    isFeatured: row.is_featured === true,
    publishedAt: cleanText(row.published_at, 40),
  }
}

export function normalizeMotivationalSession(row: Record<string, unknown>): MotivationalSessionMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title) return null

  const artwork =
    typeof row.artwork === 'string' && row.artwork.startsWith('http')
      ? row.artwork
      : typeof row.thumbnail_url === 'string' && row.thumbnail_url.startsWith('http')
        ? row.thumbnail_url
        : typeof row.artwork_url === 'string' && row.artwork_url.startsWith('http')
          ? row.artwork_url
          : null

  return {
    id,
    programId: cleanText(row.program_id, 80),
    title,
    description: cleanDescription(row.description, 1000),
    artworkUrl: artwork,
    speakerName:
      cleanText(row.speaker_name, 200)
      ?? cleanText(row.channel_name, 200)
      ?? cleanText(row.creator, 200),
    category: cleanText(row.category, 120),
    subcategory: cleanText(row.subcategory, 120),
    categorySlug: cleanText(row.category_slug, 120),
    language: cleanText(row.language, 40),
    country: cleanText(row.country ?? row.region, 40),
    durationSeconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    seasonNumber: Number.isFinite(Number(row.season_number))
      ? Number(row.season_number)
      : null,
    episodeNumber: Number.isFinite(Number(row.episode_number))
      ? Number(row.episode_number)
      : null,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
    publishedAt: cleanText(row.published_at, 40),
    isFeatured: row.is_featured === true,
  }
}

function normalizeCategory(row: Record<string, unknown>, index: number): MotivationalCategoryMeta | null {
  const slug = cleanText(row.slug, 120)
  const title = cleanText(row.title ?? row.name, 120)
  if (!slug || !title) return null

  return {
    id: cleanText(row.id, 120) ?? slug ?? `motivational-category-${index}`,
    slug,
    name: cleanText(row.name, 120) ?? title,
    title,
    description: cleanDescription(row.description, 500),
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
    itemCount: Number.isFinite(Number(row.item_count)) ? Math.max(0, Number(row.item_count)) : 0,
  }
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }
  return query
}

function readRequestError(error: unknown, signal?: AbortSignal): MotivationalCatalogError {
  if (signal?.aborted) return new MotivationalCatalogError('Motivationals request was cancelled.')
  if (error instanceof MotivationalCatalogError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new MotivationalCatalogError('Motivationals request timed out. Try again.')
  }
  if (error instanceof Error) return new MotivationalCatalogError(error.message)
  return new MotivationalCatalogError('Unexpected motivationals network error')
}

async function motivationalRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new MotivationalCatalogError('Motivationals request was cancelled.')

  try {
    const { payload, status } = await requestCatalogJsonWithFallback(
      MOTIVATIONAL_CATALOG_BASE_URL,
      path,
      MOTIVATIONAL_REQUEST_TIMEOUT_MS,
    )
    if (signal?.aborted) throw new MotivationalCatalogError('Motivationals request was cancelled.')
    if (status < 200 || status >= 300) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : null) || `Motivationals request failed (${status})`
      throw new MotivationalCatalogError(message, status)
    }
    return payload as T
  } catch (error) {
    throw readRequestError(error, signal)
  }
}

function assertMetadataOnlySessions(sessions: MotivationalSessionMeta[], rows: unknown[]) {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    if (
      'stream_url' in record
      || 'audio_url' in record
      || 'source_url' in record
      || (record.playback && typeof record.playback === 'object')
    ) {
      throw new MotivationalCatalogError('Motivationals browse response included playback URLs.')
    }
  }
  void sessions
}

export type MotivationalItemsResponse = {
  success: boolean
  programs: MotivationalProgramMeta[]
  pagination: MotivationalPagination & { nextCursor: string | null }
}

function normalizeCursorPagination(
  raw: unknown,
  fallback: { limit: number; total: number },
  nextCursor: string | null,
  hasMore: boolean,
): MotivationalPagination & { nextCursor: string | null } {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const limit = Number.isFinite(Number(record.limit)) ? Number(record.limit) : fallback.limit
  const total = Number.isFinite(Number(record.total)) ? Number(record.total) : fallback.total
  return {
    page: 1,
    limit,
    total,
    totalPages: hasMore ? 2 : total > 0 ? 1 : 0,
    hasMore,
    nextCursor,
  }
}

export async function fetchMotivationalItems(
  options?: {
    limit?: number
    cursor?: string | null
    category?: string | null
    featuredOnly?: boolean
    searchQuery?: string | null
  },
  signal?: AbortSignal,
): Promise<MotivationalItemsResponse> {
  const limit = clampLimit(options?.limit)
  const query = buildQuery({
    limit,
    cursor: options?.cursor ?? undefined,
    category: options?.category ?? undefined,
    featured: options?.featuredOnly ? 'true' : undefined,
    q: options?.searchQuery ?? undefined,
  })
  const payload = await motivationalRequest<{
    success?: boolean
    items?: unknown[]
    pagination?: unknown
  }>(`/api/motivation/items?${query.toString()}`, signal)

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const sessions = rawItems
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeMotivationalSession(row as Record<string, unknown>)
        : null,
    )
    .filter((session): session is MotivationalSessionMeta => Boolean(session))
  assertMetadataOnlySessions(sessions, rawItems)

  const paginationRaw =
    payload.pagination && typeof payload.pagination === 'object'
      ? (payload.pagination as Record<string, unknown>)
      : {}
  const hasMore = paginationRaw.hasMore === true
  const nextCursor =
    typeof paginationRaw.nextCursor === 'string' ? paginationRaw.nextCursor : null

  return {
    success: payload.success === true,
    programs: sessions.map(sessionToStandaloneProgram),
    pagination: normalizeCursorPagination(
      payload.pagination,
      { limit, total: sessions.length },
      nextCursor,
      hasMore,
    ),
  }
}

export async function fetchMotivationalCategories(signal?: AbortSignal): Promise<MotivationalCategoryMeta[]> {
  const payload = await motivationalRequest<{ categories?: unknown[] }>(
    '/api/motivation/categories',
    signal,
  )
  return (Array.isArray(payload.categories) ? payload.categories : [])
    .map((row, index) =>
      row && typeof row === 'object'
        ? normalizeCategory(row as Record<string, unknown>, index)
        : null,
    )
    .filter((category): category is MotivationalCategoryMeta => Boolean(category))
    .filter((category) => category.itemCount > 0)
}

export async function fetchMotivationalPrograms(
  options?: {
    page?: number
    limit?: number
    category?: string | null
    featuredOnly?: boolean
  },
  signal?: AbortSignal,
): Promise<MotivationalProgramsResponse> {
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({
    page,
    limit,
    category: options?.category ?? undefined,
    featured: options?.featuredOnly ? 'true' : undefined,
  })
  const payload = await motivationalRequest<{
    success?: boolean
    programs?: unknown[]
    pagination?: unknown
  }>(`/api/motivation/programs?${query.toString()}`, signal)

  const programs = (Array.isArray(payload.programs) ? payload.programs : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeMotivationalProgram(row as Record<string, unknown>)
        : null,
    )
    .filter((program): program is MotivationalProgramMeta => Boolean(program))

  return {
    success: payload.success === true,
    programs,
    pagination: normalizePagination(payload.pagination, { page, limit, total: programs.length }),
  }
}

export async function fetchMotivationalCategory(
  slug: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<MotivationalBrowseResponse> {
  const cleanSlug = slug.trim()
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ page, limit })
  const payload = await motivationalRequest<{
    success?: boolean
    category?: string
    title?: string
    items?: unknown[]
    pagination?: unknown
  }>(`/api/motivation/category/${encodeURIComponent(cleanSlug)}?${query.toString()}`, signal)

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const sessions = rawItems
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeMotivationalSession(row as Record<string, unknown>)
        : null,
    )
    .filter((session): session is MotivationalSessionMeta => Boolean(session))
  assertMetadataOnlySessions(sessions, rawItems)

  const programs = sessions.map((session) => sessionToStandaloneProgram(session))

  const category: MotivationalCategoryMeta = {
    id: cleanSlug,
    slug: cleanSlug,
    name: payload.title ?? cleanSlug,
    title: payload.title ?? cleanSlug,
    description: null,
    sortOrder: 0,
    itemCount: programs.length,
  }

  return {
    success: payload.success === true,
    category,
    programs,
    pagination: normalizePagination(payload.pagination, { page, limit, total: programs.length }),
  }
}

export function sessionToStandaloneProgram(session: MotivationalSessionMeta): MotivationalProgramMeta {
  return {
    id: session.id,
    slug: session.id,
    title: session.title,
    subtitle: session.speakerName,
    description: session.description,
    artworkUrl: session.artworkUrl,
    creatorId: null,
    categorySlug: session.categorySlug ?? session.category,
    language: session.language,
    country: session.country,
    contentRating: null,
    programType: null,
    sessionCount: 0,
    totalDurationSeconds: session.durationSeconds,
    isFeatured: session.isFeatured,
    publishedAt: session.publishedAt,
    isStandaloneItem: true,
  }
}

export async function searchMotivationals(
  queryText: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<MotivationalSearchResponse> {
  const q = queryText.trim()
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ q, page, limit })
  const payload = await motivationalRequest<{
    success?: boolean
    items?: unknown[]
    pagination?: unknown
  }>(`/api/motivation/search?${query.toString()}`, signal)

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const sessions = rawItems
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeMotivationalSession(row as Record<string, unknown>)
        : null,
    )
    .filter((session): session is MotivationalSessionMeta => Boolean(session))
  assertMetadataOnlySessions(sessions, rawItems)

  return {
    success: payload.success === true,
    sessions,
    pagination: normalizePagination(payload.pagination, { page, limit, total: sessions.length }),
  }
}

export async function fetchMotivationalProgram(
  programId: string,
  signal?: AbortSignal,
): Promise<MotivationalProgramDetailResponse | null> {
  const cleanId = programId.trim()
  if (!cleanId) return null

  const payload = await motivationalRequest<{
    success?: boolean
    program?: Record<string, unknown>
    items?: unknown[]
    pagination?: unknown
    standalone?: boolean
  }>(`/api/motivation/programs/${encodeURIComponent(cleanId)}`, signal)

  const program =
    payload.program && typeof payload.program === 'object'
      ? normalizeMotivationalProgram(payload.program)
      : null
  if (!program) return null

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const sessions = rawItems
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeMotivationalSession(row as Record<string, unknown>)
        : null,
    )
    .filter((session): session is MotivationalSessionMeta => Boolean(session))
  assertMetadataOnlySessions(sessions, rawItems)

  const page = 1
  const limit = MOTIVATIONAL_DEFAULT_PAGE_LIMIT

  return {
    success: payload.success === true,
    program,
    sessions,
    pagination: normalizePagination(payload.pagination, { page, limit, total: sessions.length }),
    standalone: payload.standalone === true,
  }
}

export async function fetchMotivationalProgramSessions(
  programId: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<{
  program: MotivationalProgramMeta | null
  sessions: MotivationalSessionMeta[]
  pagination: MotivationalPagination
} | null> {
  const cleanId = programId.trim()
  if (!cleanId) return null

  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ page, limit })

  const payload = await motivationalRequest<{
    success?: boolean
    program?: Record<string, unknown>
    items?: unknown[]
    pagination?: unknown
  }>(`/api/motivation/programs/${encodeURIComponent(cleanId)}/items?${query.toString()}`, signal)

  const program =
    payload.program && typeof payload.program === 'object'
      ? normalizeMotivationalProgram(payload.program)
      : null

  const rawItems = Array.isArray(payload.items) ? payload.items : []
  const sessions = rawItems
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeMotivationalSession(row as Record<string, unknown>)
        : null,
    )
    .filter((session): session is MotivationalSessionMeta => Boolean(session))
  assertMetadataOnlySessions(sessions, rawItems)

  return {
    program,
    sessions,
    pagination: normalizePagination(payload.pagination, { page, limit, total: sessions.length }),
  }
}

export async function resolveMotivationalPlay(
  sessionId: string,
  signal?: AbortSignal,
): Promise<MotivationalPlayResponse | null> {
  const cleanId = sessionId.trim()
  if (!cleanId) return null

  const payload = await motivationalRequest<{
    success?: boolean
    item?: Record<string, unknown>
    playback?: Record<string, unknown>
    stream_url?: string
    id?: string
    source_type?: string
    source_id?: string
  }>(`/api/motivation/items/${encodeURIComponent(cleanId)}/play`, signal)

  const playback = payload.playback && typeof payload.playback === 'object'
    ? payload.playback
    : null
  const item = payload.item && typeof payload.item === 'object' ? payload.item : null

  const audioUrl = (
    typeof playback?.url === 'string' ? playback.url.trim()
      : typeof payload.stream_url === 'string' ? payload.stream_url.trim()
        : ''
  )

  if (!audioUrl.startsWith('http')) return null

  return {
    success: payload.success === true,
    sessionId: typeof item?.id === 'string' ? item.id : cleanId,
    audioUrl,
    durationSeconds: Number.isFinite(Number(item?.duration_seconds))
      ? Math.max(0, Number(item?.duration_seconds))
      : null,
    artworkUrl:
      typeof item?.artwork_url === 'string' && item.artwork_url.startsWith('http')
        ? item.artwork_url
        : null,
    title: typeof item?.title === 'string' ? item.title : 'Motivational session',
    speakerName:
      cleanText(item?.creator, 200)
      ?? cleanText(item?.speaker_name, 200)
      ?? cleanText(item?.channel_name, 200),
  }
}
