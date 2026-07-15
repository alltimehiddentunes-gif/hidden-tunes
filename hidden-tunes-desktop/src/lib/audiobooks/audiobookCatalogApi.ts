import { requestCatalogJsonWithFallback } from '../desktopCatalogBridge'
import type {
  AudiobookBookMeta,
  AudiobookBooksResponse,
  AudiobookCategoryMeta,
  AudiobookChapterMeta,
  AudiobookChapterPlayItem,
  AudiobookChapterPlayResponse,
  AudiobookDetailResponse,
  AudiobookPagination,
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

export const AUDIOBOOK_CATALOG_BASE_URL = readCatalogBaseUrl()
export const AUDIOBOOK_DEFAULT_PAGE_LIMIT = 40
export const AUDIOBOOK_MAX_PAGE_LIMIT = 40
export const AUDIOBOOK_REQUEST_TIMEOUT_MS = 20_000

export class AudiobookCatalogError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AudiobookCatalogError'
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

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 12)
}

function clampPage(page?: number) {
  return Math.max(page ?? 1, 1)
}

function clampLimit(limit?: number) {
  return Math.min(Math.max(limit ?? AUDIOBOOK_DEFAULT_PAGE_LIMIT, 1), AUDIOBOOK_MAX_PAGE_LIMIT)
}

function normalizePagination(
  raw: unknown,
  fallback: { page: number; limit: number; total: number },
): AudiobookPagination {
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

export function normalizeAudiobookBook(row: Record<string, unknown>): AudiobookBookMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const slug = cleanText(row.slug, 180) ?? id
  if (!id || !title) return null
  if (row.is_mature === true || slug === 'mature') return null

  return {
    id,
    slug,
    title,
    subtitle: cleanText(row.subtitle, 300),
    description: cleanDescription(row.description, 1600),
    coverUrl:
      typeof row.cover_url === 'string' && row.cover_url.startsWith('http')
        ? row.cover_url
        : null,
    authorName: cleanText(row.author_name, 200),
    narratorName: cleanText(row.narrator_name, 200),
    seriesTitle: cleanText(row.series_title, 200),
    seriesPosition: Number.isFinite(Number(row.series_position))
      ? Number(row.series_position)
      : null,
    categorySlug: cleanText(row.category_slug, 120),
    categories: normalizeStringArray(row.categories),
    language: cleanText(row.language, 40),
    publisher: cleanText(row.publisher, 200),
    durationSeconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    chapterCount: Number.isFinite(Number(row.chapter_count))
      ? Math.max(0, Number(row.chapter_count))
      : 0,
    isFeatured: row.is_featured === true,
    isVerified: row.is_verified === true,
    publishedAt: cleanText(row.published_at, 40),
    createdAt: cleanText(row.created_at, 40),
  }
}

export function normalizeAudiobookChapter(row: Record<string, unknown>): AudiobookChapterMeta | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const bookId = typeof row.audiobook_id === 'string' ? row.audiobook_id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !bookId || !title) return null

  return {
    id,
    bookId,
    title,
    description: cleanDescription(row.description, 1000),
    chapterNumber: Number.isFinite(Number(row.chapter_number))
      ? Number(row.chapter_number)
      : null,
    durationSeconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    publishedAt: cleanText(row.published_at, 40),
    createdAt: cleanText(row.created_at, 40),
  }
}

function normalizeCategory(row: Record<string, unknown>, index: number): AudiobookCategoryMeta | null {
  const slug = cleanText(row.slug, 120)
  const title = cleanText(row.title ?? row.name, 120)
  if (!slug || !title) return null
  if (slug === 'mature') return null

  return {
    id: cleanText(row.id, 120) ?? slug ?? `audiobook-category-${index}`,
    slug,
    name: cleanText(row.name, 120) ?? title,
    title,
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

function readRequestError(error: unknown, signal?: AbortSignal): AudiobookCatalogError {
  if (signal?.aborted) return new AudiobookCatalogError('Audiobook request was cancelled.')
  if (error instanceof AudiobookCatalogError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new AudiobookCatalogError('Audiobook request timed out. Try again.')
  }
  if (error instanceof Error) return new AudiobookCatalogError(error.message)
  return new AudiobookCatalogError('Unexpected audiobook network error')
}

async function audiobookRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new AudiobookCatalogError('Audiobook request was cancelled.')

  try {
    const { payload, status } = await requestCatalogJsonWithFallback(
      AUDIOBOOK_CATALOG_BASE_URL,
      path,
      AUDIOBOOK_REQUEST_TIMEOUT_MS,
    )
    if (signal?.aborted) throw new AudiobookCatalogError('Audiobook request was cancelled.')
    if (status < 200 || status >= 300) {
      const message =
        (payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : null) || `Audiobook request failed (${status})`
      throw new AudiobookCatalogError(message, status)
    }
    return payload as T
  } catch (error) {
    throw readRequestError(error, signal)
  }
}

export async function fetchAudiobookCategories(signal?: AbortSignal): Promise<AudiobookCategoryMeta[]> {
  const payload = await audiobookRequest<{ categories?: unknown[] }>(
    '/api/audiobooks/categories',
    signal,
  )
  return (Array.isArray(payload.categories) ? payload.categories : [])
    .map((row, index) =>
      row && typeof row === 'object'
        ? normalizeCategory(row as Record<string, unknown>, index)
        : null,
    )
    .filter((category): category is AudiobookCategoryMeta => Boolean(category))
    .filter((category) => category.itemCount > 0)
}

export async function fetchAudiobookBooks(
  options?: { page?: number; limit?: number; category?: string | null },
  signal?: AbortSignal,
): Promise<AudiobookBooksResponse> {
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({
    page,
    limit,
    category: options?.category ?? undefined,
  })
  const payload = await audiobookRequest<{
    success?: boolean
    category?: Record<string, unknown>
    audiobooks?: unknown[]
    pagination?: unknown
  }>(`/api/audiobooks?${query.toString()}`, signal)

  const books = (Array.isArray(payload.audiobooks) ? payload.audiobooks : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeAudiobookBook(row as Record<string, unknown>)
        : null,
    )
    .filter((book): book is AudiobookBookMeta => Boolean(book))

  const categoryRow = payload.category
  const category =
    categoryRow && typeof categoryRow === 'object'
      ? normalizeCategory(categoryRow as Record<string, unknown>, 0)
      : null

  return {
    success: payload.success === true,
    category,
    books,
    pagination: normalizePagination(payload.pagination, { page, limit, total: books.length }),
  }
}

export async function fetchAudiobookCategory(
  slug: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<AudiobookBooksResponse> {
  const cleanSlug = slug.trim()
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ page, limit })
  const payload = await audiobookRequest<{
    success?: boolean
    category?: Record<string, unknown>
    audiobooks?: unknown[]
    pagination?: unknown
  }>(`/api/audiobooks/category/${encodeURIComponent(cleanSlug)}?${query.toString()}`, signal)

  const books = (Array.isArray(payload.audiobooks) ? payload.audiobooks : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeAudiobookBook(row as Record<string, unknown>)
        : null,
    )
    .filter((book): book is AudiobookBookMeta => Boolean(book))

  const categoryRow = payload.category
  const category =
    categoryRow && typeof categoryRow === 'object'
      ? normalizeCategory(categoryRow as Record<string, unknown>, 0)
      : null

  return {
    success: payload.success === true,
    category,
    books,
    pagination: normalizePagination(payload.pagination, { page, limit, total: books.length }),
  }
}

export async function searchAudiobooks(
  queryText: string,
  options?: { page?: number; limit?: number },
  signal?: AbortSignal,
): Promise<AudiobookBooksResponse> {
  const q = queryText.trim()
  const page = clampPage(options?.page)
  const limit = clampLimit(options?.limit)
  const query = buildQuery({ q, page, limit })
  const payload = await audiobookRequest<{
    success?: boolean
    audiobooks?: unknown[]
    pagination?: unknown
  }>(`/api/audiobooks/search?${query.toString()}`, signal)

  const books = (Array.isArray(payload.audiobooks) ? payload.audiobooks : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeAudiobookBook(row as Record<string, unknown>)
        : null,
    )
    .filter((book): book is AudiobookBookMeta => Boolean(book))

  return {
    success: payload.success === true,
    category: null,
    books,
    pagination: normalizePagination(payload.pagination, { page, limit, total: books.length }),
  }
}

export async function fetchAudiobookDetail(
  bookId: string,
  signal?: AbortSignal,
): Promise<AudiobookDetailResponse | null> {
  const cleanId = bookId.trim()
  if (!cleanId) return null

  const payload = await audiobookRequest<{
    success?: boolean
    audiobook?: Record<string, unknown>
    chapters?: unknown[]
  }>(`/api/audiobooks/${encodeURIComponent(cleanId)}`, signal)

  const audiobook =
    payload.audiobook && typeof payload.audiobook === 'object'
      ? normalizeAudiobookBook(payload.audiobook)
      : null
  if (!audiobook) return null

  const chapters = (Array.isArray(payload.chapters) ? payload.chapters : [])
    .map((row) =>
      row && typeof row === 'object'
        ? normalizeAudiobookChapter(row as Record<string, unknown>)
        : null,
    )
    .filter((chapter): chapter is AudiobookChapterMeta => Boolean(chapter))
    .sort((left, right) => {
      const leftNum = left.chapterNumber ?? Number.MAX_SAFE_INTEGER
      const rightNum = right.chapterNumber ?? Number.MAX_SAFE_INTEGER
      if (leftNum !== rightNum) return leftNum - rightNum
      return left.title.localeCompare(right.title)
    })

  return {
    success: payload.success === true,
    audiobook,
    chapters,
  }
}

export async function resolveAudiobookChapterPlay(
  bookId: string,
  fromChapterId: string,
  signal?: AbortSignal,
): Promise<AudiobookChapterPlayResponse | null> {
  const cleanBookId = bookId.trim()
  const cleanChapterId = fromChapterId.trim()
  if (!cleanBookId || !cleanChapterId) return null

  const query = buildQuery({ from: cleanChapterId })
  const payload = await audiobookRequest<{
    success?: boolean
    audiobook_id?: string
    audiobook?: Record<string, unknown>
    from_chapter_id?: string
    start_index?: number
    chapters?: unknown[]
  }>(
    `/api/audiobooks/${encodeURIComponent(cleanBookId)}/chapters/play?${query.toString()}`,
    signal,
  )

  const audiobook =
    payload.audiobook && typeof payload.audiobook === 'object'
      ? normalizeAudiobookBook(payload.audiobook)
      : null
  if (!audiobook) return null

  const chapters: AudiobookChapterPlayItem[] = (Array.isArray(payload.chapters) ? payload.chapters : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const chapter = normalizeAudiobookChapter(row as Record<string, unknown>)
      if (!chapter) return null
      const audioUrl =
        typeof (row as Record<string, unknown>).audio_url === 'string'
          ? String((row as Record<string, unknown>).audio_url).trim()
          : ''
      if (!audioUrl.startsWith('http')) return null
      return { ...chapter, audioUrl }
    })
    .filter((chapter): chapter is AudiobookChapterPlayItem => Boolean(chapter))

  if (chapters.length === 0) return null

  return {
    success: payload.success === true,
    bookId: typeof payload.audiobook_id === 'string' ? payload.audiobook_id : cleanBookId,
    audiobook,
    fromChapterId: typeof payload.from_chapter_id === 'string' ? payload.from_chapter_id : cleanChapterId,
    startIndex: Number.isFinite(Number(payload.start_index)) ? Number(payload.start_index) : 0,
    chapters,
  }
}
