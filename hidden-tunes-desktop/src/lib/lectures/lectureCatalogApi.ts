import { requestCatalogJsonWithFallback } from '../desktopCatalogBridge'
import {
  categoryDisplayName,
  cleanText,
  normalizeCategory,
  normalizeMediaType,
  normalizePagination,
  normalizeSeries,
  normalizeSession,
  sortSessions,
} from './normalization'
import type {
  LectureBrowseResponse,
  LectureCategory,
  LectureItem,
  LecturePagination,
  LecturePlayResolution,
  LectureSearchResponse,
  LectureSeries,
  LectureSeriesDetailResponse,
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

export const LECTURE_CATALOG_BASE_URL = readCatalogBaseUrl()
export const LECTURE_DEFAULT_PAGE_LIMIT = 40
export const LECTURE_MAX_PAGE_LIMIT = 40
export const LECTURE_REQUEST_TIMEOUT_MS = 20_000

export class LectureCatalogError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LectureCatalogError'
    this.status = status
  }
}

function clampPage(page?: number) {
  return Math.max(page ?? 1, 1)
}

function clampLimit(limit?: number) {
  return Math.min(Math.max(limit ?? LECTURE_DEFAULT_PAGE_LIMIT, 1), LECTURE_MAX_PAGE_LIMIT)
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue
    query.set(key, String(value))
  }
  return query
}

function readRequestError(error: unknown, signal?: AbortSignal): LectureCatalogError {
  if (signal?.aborted) return new LectureCatalogError('Lectures request was cancelled.')
  if (error instanceof LectureCatalogError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new LectureCatalogError('Lectures request timed out. Try again.')
  }
  if (error instanceof Error) return new LectureCatalogError(error.message)
  return new LectureCatalogError('Unexpected lectures network error')
}

async function lectureRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new LectureCatalogError('Lectures request was cancelled.')

  try {
    const { payload, status } = await requestCatalogJsonWithFallback(
      LECTURE_CATALOG_BASE_URL,
      path,
      LECTURE_REQUEST_TIMEOUT_MS,
    )
    if (signal?.aborted) throw new LectureCatalogError('Lectures request was cancelled.')
    if (status < 200 || status >= 300) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : null) || `Lectures request failed (${status})`
      throw new LectureCatalogError(message, status)
    }
    return payload as T
  } catch (error) {
    throw readRequestError(error, signal)
  }
}

function assertMetadataOnly(rows: unknown[]) {
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    if (
      'playableUrl' in record
      || 'playable_url' in record
      || 'audio_url' in record
      || 'video_url' in record
      || 'stream_url' in record
      || 'playback_url' in record
    ) {
      throw new LectureCatalogError('Lectures browse response included playback URLs.')
    }
  }
}

function enrichCategory(category: LectureCategory | null): LectureCategory | null {
  if (!category) return null
  return {
    ...category,
    name: category.name === category.slug ? categoryDisplayName(category.slug) : category.name,
  }
}

function normalizeSeriesList(rows: unknown[]): LectureSeries[] {
  assertMetadataOnly(rows)
  return rows
    .map((row) =>
      row && typeof row === 'object' ? normalizeSeries(row as Record<string, unknown>) : null,
    )
    .filter((series): series is LectureSeries => Boolean(series))
    .map((series) => ({
      ...series,
      category: enrichCategory(series.category),
    }))
}

export async function fetchLectureCategories(signal?: AbortSignal): Promise<LectureCategory[]> {
  const payload = await lectureRequest<{ categories?: unknown[] }>(
    '/api/lectures/categories',
    signal,
  )
  return (Array.isArray(payload.categories) ? payload.categories : [])
    .map((row, index) =>
      row && typeof row === 'object'
        ? normalizeCategory(row as Record<string, unknown>, index)
        : null,
    )
    .filter((category): category is LectureCategory => Boolean(category))
    .map((category) => enrichCategory(category)!)
}

export async function fetchLectureItems(
  options?: {
    page?: number
    limit?: number
    category?: string | null
    subject?: string | null
    speaker?: string | null
    language?: string | null
    mediaType?: 'audio' | 'video' | null
  },
  signal?: AbortSignal,
): Promise<{ success: boolean; series: LectureSeries[]; pagination: LecturePagination }> {
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)

  if (options?.category) {
    const response = await fetchLectureCategory(options.category, { page, limit }, signal)
    return {
      success: response.success,
      series: response.series,
      pagination: response.pagination,
    }
  }

  const categories = await fetchLectureCategories(signal)
  const fallbackSlug = categories[0]?.slug ?? 'academic-lectures'
  return fetchLectureCategory(fallbackSlug, { page, limit }, signal).then((response) => ({
    success: response.success,
    series: response.series,
    pagination: response.pagination,
  }))
}

export async function fetchLectureCategory(
  slug: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<LectureBrowseResponse> {
  const cleanSlug = slug.trim()
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ page, limit })

  const payload = await lectureRequest<{
    success?: boolean
    category?: string
    lectures?: unknown[]
    pagination?: unknown
  }>(`/api/lectures/category/${encodeURIComponent(cleanSlug)}?${query.toString()}`, signal)

  const rawRows = Array.isArray(payload.lectures) ? payload.lectures : []
  const series = normalizeSeriesList(rawRows)

  const category: LectureCategory = enrichCategory({
    id: cleanSlug,
    slug: cleanSlug,
    name: categoryDisplayName(cleanSlug),
  })!

  return {
    success: payload.success === true,
    category,
    series,
    pagination: normalizePagination(payload.pagination, { page, limit, total: series.length }),
  }
}

export async function searchLectures(
  queryText: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<LectureSearchResponse> {
  const q = queryText.trim()
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ q, page, limit })

  const payload = await lectureRequest<{
    success?: boolean
    q?: string
    lectures?: unknown[]
    pagination?: unknown
  }>(`/api/lectures/search?${query.toString()}`, signal)

  const rawRows = Array.isArray(payload.lectures) ? payload.lectures : []
  const series = normalizeSeriesList(rawRows)

  return {
    success: payload.success === true,
    query: payload.q ?? q,
    series,
    pagination: normalizePagination(payload.pagination, { page, limit, total: series.length }),
  }
}

export async function fetchLectureSeriesDetails(
  seriesId: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<LectureSeriesDetailResponse | null> {
  const cleanId = seriesId.trim()
  if (!cleanId) return null

  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ page, limit })

  const payload = await lectureRequest<{
    success?: boolean
    lecture?: Record<string, unknown>
    lessons?: unknown[]
    pagination?: unknown
  }>(`/api/lectures/items/${encodeURIComponent(cleanId)}?${query.toString()}`, signal)

  const series =
    payload.lecture && typeof payload.lecture === 'object'
      ? normalizeSeries(payload.lecture)
      : null
  if (!series) return null

  const enrichedSeries = {
    ...series,
    category: enrichCategory(series.category),
  }

  const rawLessons = Array.isArray(payload.lessons) ? payload.lessons : []
  assertMetadataOnly(rawLessons)

  const sessions = sortSessions(
    rawLessons
      .map((row) =>
        row && typeof row === 'object'
          ? normalizeSession(row as Record<string, unknown>, enrichedSeries)
          : null,
      )
      .filter((session): session is LectureItem => Boolean(session)),
  )

  return {
    success: payload.success === true,
    series: enrichedSeries,
    sessions,
    pagination: normalizePagination(payload.pagination, { page, limit, total: sessions.length }),
  }
}

export async function fetchLectureSeriesSessions(
  seriesId: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<{
  series: LectureSeries | null
  sessions: LectureItem[]
  pagination: LecturePagination
} | null> {
  const detail = await fetchLectureSeriesDetails(seriesId, options, signal)
  if (!detail) return null
  return {
    series: detail.series,
    sessions: detail.sessions,
    pagination: detail.pagination,
  }
}

export async function fetchAllLectureSeriesSessions(
  seriesId: string,
  signal?: AbortSignal,
  maxPages = 8,
): Promise<LectureItem[]> {
  const collected: LectureItem[] = []
  let page = 1
  let hasMore = true

  while (hasMore && page <= maxPages) {
    const detail = await fetchLectureSeriesDetails(seriesId, { page, limit: LECTURE_DEFAULT_PAGE_LIMIT }, signal)
    if (!detail) break
    collected.push(...detail.sessions)
    hasMore = detail.pagination.hasMore
    page += 1
  }

  return sortSessions(collected)
}

export async function resolveLecturePlay(
  seriesId: string,
  lessonId: string,
  signal?: AbortSignal,
): Promise<LecturePlayResolution | null> {
  const cleanSeriesId = seriesId.trim()
  const cleanLessonId = lessonId.trim()
  if (!cleanSeriesId || !cleanLessonId) return null

  const query = buildQuery({ lessonId: cleanLessonId })
  const payload = await lectureRequest<{
    success?: boolean
    programId?: string
    sessionId?: string
    title?: string
    mediaType?: string
    playableUrl?: string
    mimeType?: string
    durationSeconds?: number | null
  }>(
    `/api/lectures/items/${encodeURIComponent(cleanSeriesId)}/play?${query.toString()}`,
    signal,
  )

  const playbackUrl = typeof payload.playableUrl === 'string' ? payload.playableUrl.trim() : ''
  if (!playbackUrl.startsWith('http')) return null

  return {
    success: payload.success === true,
    seriesId: payload.programId ?? cleanSeriesId,
    itemId: payload.sessionId ?? cleanLessonId,
    mediaType: normalizeMediaType(payload.mediaType),
    playbackUrl,
    mimeType: cleanText(payload.mimeType, 120),
    durationSeconds: Number.isFinite(Number(payload.durationSeconds))
      ? Math.max(0, Number(payload.durationSeconds))
      : null,
    title: typeof payload.title === 'string' ? payload.title : 'Lecture session',
  }
}

export async function searchLectureContinuation(
  series: LectureSeries,
  excludeSeriesIds: Set<string>,
  signal?: AbortSignal,
): Promise<LectureSeries | null> {
  const speakerName = series.speaker?.name?.trim()
  if (speakerName) {
    const speakerResults = await searchLectures(speakerName, { page: 1, limit: 10 }, signal)
    const match = speakerResults.series.find(
      (candidate) => candidate.id !== series.id && !excludeSeriesIds.has(candidate.id),
    )
    if (match) return match
  }

  const categorySlug = series.category?.slug
  if (categorySlug) {
    const categoryResults = await fetchLectureCategory(categorySlug, { page: 1, limit: 10 }, signal)
    const match = categoryResults.series.find(
      (candidate) => candidate.id !== series.id && !excludeSeriesIds.has(candidate.id),
    )
    if (match) return match
  }

  return null
}
