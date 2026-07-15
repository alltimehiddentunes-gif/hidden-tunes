import type {
  LectureCategory,
  LectureInstitution,
  LectureItem,
  LectureMediaType,
  LecturePagination,
  LectureSeries,
  LectureSpeaker,
} from './types'

export function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim().slice(0, maxLength)
  return cleaned || null
}

export function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
}

export function cleanDescription(value: unknown, maxLength = 1600): string | null {
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

export function normalizeMediaType(value: unknown): LectureMediaType {
  const cleaned = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return cleaned === 'video' ? 'video' : 'audio'
}

export function normalizeArtworkUrl(...candidates: unknown[]): string | null {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().startsWith('http')) {
      return value.trim()
    }
  }
  return null
}

export function normalizeSpeaker(row: Record<string, unknown>): LectureSpeaker | null {
  const name =
    cleanText(row.instructor_name, 200)
    ?? cleanText(row.speaker_name, 200)
    ?? cleanText(row.creator_name, 200)
  if (!name) return null
  return {
    name,
    artworkUrl: null,
    biography: null,
  }
}

export function normalizeInstitution(row: Record<string, unknown>): LectureInstitution | null {
  const name = cleanText(row.creator_name, 200)
  if (!name) return null
  return { name, artworkUrl: null }
}

export function normalizeCategory(
  row: Record<string, unknown>,
  index = 0,
): LectureCategory | null {
  const slug = cleanText(row.slug, 120)
  const name = cleanText(row.name ?? row.title, 120)
  if (!slug || !name) return null
  return {
    id: cleanText(row.id, 120) ?? slug,
    slug,
    name,
    description: cleanDescription(row.description, 500),
    itemCount: Number.isFinite(Number(row.item_count))
      ? Math.max(0, Number(row.item_count))
      : undefined,
    sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : index,
  }
}

export function normalizeSeries(row: Record<string, unknown>): LectureSeries | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  if (!id || !title) return null

  const categorySlug = cleanText(row.category_slug, 120)
  const categories = Array.isArray(row.categories)
    ? row.categories.map((entry) => cleanText(entry, 120)).filter(Boolean) as string[]
    : []

  const category: LectureCategory | null = categorySlug
    ? {
        id: categorySlug,
        slug: categorySlug,
        name: categorySlug,
      }
    : categories[0]
      ? { id: categories[0], slug: categories[0], name: categories[0] }
      : null

  const topicTags = Array.isArray(row.topic_tags)
    ? row.topic_tags.map((entry) => cleanText(entry, 80)).filter(Boolean) as string[]
    : []

  return {
    id,
    slug: cleanText(row.slug, 180) ?? id,
    title,
    subtitle: cleanText(row.subtitle, 300),
    description: cleanDescription(row.description, 1600),
    artworkUrl: normalizeArtworkUrl(row.artwork_url, row.cover_url),
    speaker: normalizeSpeaker(row),
    institution: normalizeInstitution(row),
    category,
    subject: topicTags[0] ?? category?.slug ?? null,
    language: cleanText(row.language, 40),
    country: null,
    sessionCount: Number.isFinite(Number(row.lesson_count))
      ? Math.max(0, Number(row.lesson_count))
      : 0,
    totalDurationSeconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    isFeatured: row.is_featured === true,
    isVerified: row.is_verified === true,
    publishedAt: cleanText(row.published_at, 40),
    difficulty: cleanText(row.difficulty, 80),
    topicTags,
    mediaType: null,
  }
}

export function normalizeSession(
  row: Record<string, unknown>,
  series?: LectureSeries | null,
): LectureItem | null {
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const title = typeof row.title === 'string' ? row.title.trim() : ''
  const seriesId =
    cleanText(row.item_id, 80)
    ?? series?.id
    ?? ''
  if (!id || !title || !seriesId) return null

  return {
    id,
    seriesId,
    title,
    description: null,
    artworkUrl: series?.artworkUrl ?? null,
    mediaType: normalizeMediaType(row.media_type),
    durationSeconds: Number.isFinite(Number(row.duration_seconds))
      ? Math.max(0, Number(row.duration_seconds))
      : null,
    publishedAt: cleanText(row.created_at, 40),
    speaker: series?.speaker ?? null,
    institution: series?.institution ?? null,
    category: series?.category ?? null,
    subject: series?.subject ?? null,
    seriesTitle: series?.title ?? null,
    sessionNumber: Number.isFinite(Number(row.lesson_number))
      ? Number(row.lesson_number)
      : null,
    language: series?.language ?? null,
    country: series?.country ?? null,
    playable: true,
    sortOrder: Number.isFinite(Number(row.lesson_number))
      ? Number(row.lesson_number)
      : 0,
  }
}

export function normalizePagination(
  raw: unknown,
  fallback: { page: number; limit: number; total: number | null },
): LecturePagination {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const page = Number.isFinite(Number(record.page)) ? Number(record.page) : fallback.page
  const limit = Number.isFinite(Number(record.limit)) ? Number(record.limit) : fallback.limit
  const total = Number.isFinite(Number(record.total)) ? Number(record.total) : fallback.total
  const totalPages = Number.isFinite(Number(record.totalPages))
    ? Number(record.totalPages)
    : total != null && total > 0
      ? Math.ceil(total / limit)
      : null
  const hasMore = typeof record.hasMore === 'boolean'
    ? record.hasMore
    : totalPages != null
      ? page < totalPages
      : false

  return { page, limit, total, totalPages, hasMore }
}

export function sortSessions(sessions: LectureItem[]) {
  return [...sessions].sort((a, b) => {
    if (a.sessionNumber != null && b.sessionNumber != null && a.sessionNumber !== b.sessionNumber) {
      return a.sessionNumber - b.sessionNumber
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    const aDate = a.publishedAt ? Date.parse(a.publishedAt) : 0
    const bDate = b.publishedAt ? Date.parse(b.publishedAt) : 0
    if (aDate !== bDate) return aDate - bDate
    return a.id.localeCompare(b.id)
  })
}

export function categoryDisplayName(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
