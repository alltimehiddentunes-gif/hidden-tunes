import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const api = read('src/lib/lectures/lectureCatalogApi.ts')
const hook = read('src/lib/lectures/useLecturesPageData.ts')
const page = read('src/components/lectures/LecturesPage.tsx')

const checks = []

function check(label, condition) {
  assert.ok(condition, label)
  checks.push(label)
}

check(
  'global browse uses the authoritative items endpoint and payload',
  api.includes('`/api/lectures/items?${query.toString()}`')
    && api.includes('Array.isArray(payload.items) ? payload.items : []'),
)

check(
  'catalog requests forward AbortSignal into the shared transport',
  /requestCatalogJsonWithFallback\([\s\S]{0,180}LECTURE_REQUEST_TIMEOUT_MS,\s*signal,/.test(api),
)

check(
  'cold home has only the categories and global-items request paths',
  hook.includes('fetchLectureCategories(controller.signal)')
    && hook.includes('fetchLectureItems(\n            { page: 1, limit: BROWSE_LIMIT }')
    && !hook.includes('sampleSlugs')
    && !hook.includes('categoryPages'),
)

check(
  'categories and items start as independent concurrent tasks',
  hook.includes('const categoriesRequest = (async () =>')
    && hook.includes('const itemsRequest = (async () =>')
    && hook.includes('Promise.allSettled([categoriesRequest, itemsRequest])'),
)

check(
  'bounded snapshot supports fresh reuse and stale-while-revalidate',
  hook.includes('LECTURES_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000')
    && hook.includes('LECTURES_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000')
    && hook.includes('if (initialSnapshot?.fresh && bootstrapRetryNonce === 0) return')
    && hook.includes('browseSeriesRef.current.length > 0'),
)

check(
  'snapshot renews only from a successful authoritative page response',
  /const response = await fetchLectureItems[\s\S]{0,700}lecturesPageSnapshot = \{[\s\S]{0,220}cachedAt: Date\.now\(\)/.test(hook),
)

check(
  'default and filtered pagination are isolated',
  hook.includes('const [browsePagination, setBrowsePagination]')
    && hook.includes('const [filteredPagination, setFilteredPagination]')
    && hook.includes('const pagination = filteredView ? filteredPagination : browsePagination'),
)

check(
  'media and language filters apply to initial and appended pages',
  (hook.match(/applyVisibleFilters\(/g) ?? []).length >= 3
    && hook.includes('const visibleSeries = applyVisibleFilters(series, mediaFilter, languageFilter)'),
)

check(
  'load-more is abortable, generation guarded, and source-aware',
  hook.includes('loadMoreAbortRef.current?.abort()')
    && hook.includes('if (requestId !== loadMoreRef.current) return')
    && hook.includes('setFilteredPagination(nextPagination)')
    && hook.includes('setBrowsePagination(nextPagination)'),
)

check(
  'refresh and load-more failures retain existing rows',
  hook.includes('if (browseSeriesRef.current.length > 0)')
    && hook.includes("setBrowseError(readError(reason, 'We couldn\\u2019t load Lectures right now.'))")
    && !hook.includes("setFilteredSeries([])\n        } catch"),
)

check(
  'unmount invalidates every non-bootstrap catalog continuation',
  hook.includes('browseRef.current += 1')
    && hook.includes('loadMoreRef.current += 1')
    && hook.includes('loadMoreAbortRef.current?.abort()'),
)

check(
  'clearing filters cancels and invalidates filtered page and load-more work',
  /if \(!filteredView\) \{[\s\S]{0,320}browseAbortRef\.current\?\.abort\(\)[\s\S]{0,320}loadMoreAbortRef\.current\?\.abort\(\)[\s\S]{0,320}browseRef\.current \+= 1[\s\S]{0,320}loadMoreRef\.current \+= 1/.test(hook),
)

check(
  'an aborted bootstrap cannot commit loading state in finally',
  hook.includes('requestId === bootstrapRef.current && !controller.signal.aborted'),
)

check(
  'retry stays inside the hook and never reloads the document or misuses load-more',
  page.includes('<LectureErrorState message={error} onRetry={retry} />')
    && page.includes('<LectureErrorState message={contentError} onRetry={retry} />')
    && !page.includes('window.location.reload()')
    && !page.includes('message={contentError} onRetry={loadMore}'),
)

console.log(`Lectures fast-entry contract: ${checks.length}/${checks.length} PASS`)
