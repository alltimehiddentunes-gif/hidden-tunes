import {
  normalizeMediaType,
  normalizePagination,
  normalizeSeries,
  normalizeSession,
  sortSessions,
} from '../src/lib/lectures/normalization'

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

const snakeSeries = {
  id: 'series-1',
  slug: 'history-course',
  title: 'History Course',
  instructor_name: 'Ada Lovelace',
  category_slug: 'academic-lectures',
  lesson_count: 2,
  artwork_url: 'https://example.com/art.jpg',
  media_type: 'audio',
}

const camelSeries = {
  id: 'series-2',
  slug: 'science-course',
  title: 'Science Course',
  instructorName: 'Charles Darwin',
  categorySlug: 'science',
  lessonCount: 1,
}

const sessionRows = [
  {
    id: 'lesson-b',
    item_id: 'series-1',
    title: 'Lesson B',
    lesson_number: 2,
    media_type: 'audio',
  },
  {
    id: 'lesson-a',
    item_id: 'series-1',
    title: 'Lesson A',
    lesson_number: 1,
    media_type: 'video',
  },
]

const normalizedSeries = normalizeSeries(snakeSeries)
assert(normalizedSeries?.speaker?.name === 'Ada Lovelace', 'speaker normalization failed')
assert(normalizedSeries?.category?.slug === 'academic-lectures', 'category normalization failed')

const normalizedCamel = normalizeSeries(camelSeries as Record<string, unknown>)
assert(normalizedCamel?.title === 'Science Course', 'camelCase title failed')

const sessions = sortSessions(
  sessionRows
    .map((row) => normalizeSession(row, normalizedSeries))
    .filter((session): session is NonNullable<typeof session> => Boolean(session)),
)
assert(sessions[0]?.sessionNumber === 1, 'session ordering failed')
assert(normalizeMediaType('VIDEO') === 'video', 'video media type failed')
assert(normalizeMediaType(undefined) === 'audio', 'default media type failed')

const pagination = normalizePagination(
  { page: 2, limit: 40, hasMore: true, total: null },
  { page: 1, limit: 40, total: null },
)
assert(pagination.page === 2 && pagination.hasMore === true, 'pagination normalization failed')

console.log('lecture normalization tests passed')
