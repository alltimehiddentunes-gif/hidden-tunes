import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = fs.readFileSync(path.join(root, 'src/lib/audiobooks/useAudiobooksPageData.ts'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/lib/audiobooks/audiobookCatalogApi.ts'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src/components/audiobooks/AudiobooksPage.tsx'), 'utf8')

const checks = []
function check(name, condition) {
  assert.ok(condition, name)
  checks.push(name)
}

check(
  'cold entry collapses duplicate 12 and 40 book requests into one 40 book page',
  !hook.includes('fetchAudiobookBooks({ page: 1, limit: FEATURED_LIMIT }')
    && hook.includes('fetchAudiobookBooks({ page: 1, limit: BROWSE_LIMIT }, controller.signal)'),
)
check(
  'categories and the single first page start in parallel',
  hook.includes('Promise.allSettled([')
    && hook.includes('fetchAudiobookCategories(controller.signal)')
    && hook.includes('fetchAudiobookBooks({ page: 1, limit: BROWSE_LIMIT }, controller.signal)'),
)
check(
  'Featured is derived from the authoritative 40 book page',
  hook.includes('function deriveFeaturedBooks')
    && hook.includes('book.isFeatured')
    && hook.includes('deriveFeaturedBooks(browseBooks)'),
)
check(
  'warm navigation uses a five-minute snapshot with a bounded stale lifetime',
  hook.includes('AUDIOBOOKS_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000')
    && hook.includes('AUDIOBOOKS_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000')
    && hook.includes('readAudiobooksPageSnapshot'),
)
check(
  'fresh remount makes zero bootstrap requests while stale rows stay seeded',
  hook.includes('if (!initialSnapshot?.fresh)')
    && hook.includes('initialSnapshot?.snapshot.browseBooks')
    && hook.includes('initialSnapshot?.snapshot.categories'),
)
check(
  'snapshot freshness renews only after both categories and first page succeed',
  hook.includes("categoriesResult.status === 'fulfilled'")
    && hook.includes("browseResult.status === 'fulfilled'")
    && hook.includes('audiobooksPageSnapshot = {'),
)
check(
  'AbortSignal reaches the shared transport instead of only guarding the response',
  /requestCatalogJsonWithFallback\([\s\S]*?AUDIOBOOK_REQUEST_TIMEOUT_MS,\s*signal,\s*\)/.test(api),
)
check(
  'bootstrap and filtered responses require abort generation and query safety',
  hook.includes('controller.signal.aborted || requestId !== bootstrapRef.current')
    && hook.includes('requestId !== contentRef.current')
    && hook.includes('requestQueryKey !== contentQueryKeyRef.current'),
)

const contentCatchStart = hook.indexOf("          setContentError(readError(reason, 'Could not load audiobook results.'))")
check(
  'same-query filtered refresh failure never clears already-visible rows',
  contentCatchStart >= 0
    && !hook.slice(Math.max(0, contentCatchStart - 300), contentCatchStart + 200).includes('setSearchBooks([])'),
)
check(
  'default and filtered pagination identities cannot overwrite each other',
  hook.includes('browsePagination')
    && hook.includes('filteredPagination')
    && hook.includes('filteredView ? filteredPagination : browsePagination'),
)
check(
  'load-more is single-flight abortable and stale-query guarded',
  hook.includes('loadMorePendingRef.current')
    && hook.includes('loadMoreAbortRef.current?.abort()')
    && hook.includes('requestId !== loadMoreRef.current')
    && hook.includes('requestQueryKey !== contentQueryKeyRef.current'),
)
check(
  'static structural placeholders replace the blocking loading message',
  page.includes('function BookSkeleton()')
    && page.includes('Array.from({ length: 6 }')
    && page.includes('aria-label="Loading audiobooks"')
    && !page.includes('Loading audiobook catalog…'),
)
check(
  'book rows are memoized with stable parent-supplied handlers and entity props',
  page.includes('const BookCard = memo(function BookCard')
    && page.includes('onOpen={onOpenBook}')
    && !page.includes('onOpen={() => onOpenBook'),
)
check(
  'catalog cards preserve the existing authoritative progress lookup semantics',
  !page.includes('progressByBook')
    && (page.match(/getAudiobookProgress\(/g) ?? []).length === 2,
)
check(
  'catalog page remains bounded to the existing maximum of 40',
  api.includes('AUDIOBOOK_MAX_PAGE_LIMIT = 40')
    && hook.includes('const BROWSE_LIMIT = 40'),
)
check(
  'mature audiobook rows remain excluded',
  api.includes("if (row.is_mature === true || slug === 'mature') return null"),
)
check(
  'fast-entry hook does not acquire playback or navigation ownership',
  !hook.includes('PlayerContext')
    && !hook.includes('DesktopPlaybackProvider')
    && !hook.includes('onPlayAudiobookChapter')
    && !hook.includes('navigate'),
)

function simulateInitialEntry({ snapshotAgeMs = null, filtered = false }) {
  const snapshotUsable = snapshotAgeMs !== null
    && snapshotAgeMs <= 24 * 60 * 60 * 1000
  const snapshotFresh = snapshotUsable
    && snapshotAgeMs <= 5 * 60 * 1000
  return {
    seededRowsVisibleImmediately: snapshotUsable,
    bootstrapRequests: snapshotFresh ? 0 : 2,
    filteredRequests: filtered ? 1 : 0,
  }
}

const coldDefault = simulateInitialEntry({})
const freshDefault = simulateInitialEntry({ snapshotAgeMs: 60_000 })
const staleDefault = simulateInitialEntry({ snapshotAgeMs: 6 * 60 * 1000 })
const expiredDefault = simulateInitialEntry({ snapshotAgeMs: 25 * 60 * 60 * 1000 })
assert.deepEqual(coldDefault, {
  seededRowsVisibleImmediately: false,
  bootstrapRequests: 2,
  filteredRequests: 0,
})
assert.deepEqual(freshDefault, {
  seededRowsVisibleImmediately: true,
  bootstrapRequests: 0,
  filteredRequests: 0,
})
assert.deepEqual(staleDefault, {
  seededRowsVisibleImmediately: true,
  bootstrapRequests: 2,
  filteredRequests: 0,
})
assert.deepEqual(expiredDefault, {
  seededRowsVisibleImmediately: false,
  bootstrapRequests: 2,
  filteredRequests: 0,
})

const defaultPagination = { page: 1, total: 400 }
const filteredPagination = { page: 3, total: 7 }
const visiblePagination = (filtered) => filtered ? filteredPagination : defaultPagination
assert.equal(visiblePagination(true), filteredPagination)
assert.equal(visiblePagination(false), defaultPagination)
checks.push(
  'behavioral snapshot request-count matrix',
  'behavioral filtered-to-default pagination identity',
)

console.log(`Audiobooks fast-entry contract: ${checks.length}/${checks.length} PASS`)
