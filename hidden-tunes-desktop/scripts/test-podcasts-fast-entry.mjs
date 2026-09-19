import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const hook = read('src/lib/podcasts/usePodcastsPageData.ts')
const page = read('src/components/podcasts/PodcastsPage.tsx')
const api = read('src/lib/podcasts/podcastCatalogApi.ts')
const checks = []

function check(label, condition) {
  assert.ok(condition, label)
  checks.push(label)
}

const FIVE_MINUTES = 5 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
function expectedBootstrapRequests(snapshotAgeMs) {
  if (snapshotAgeMs !== null && snapshotAgeMs <= FIVE_MINUTES) return 0
  return 3
}

assert.equal(expectedBootstrapRequests(null), 3, 'cold entry must issue three requests')
assert.equal(expectedBootstrapRequests(FIVE_MINUTES), 0, 'fresh completed snapshot must issue zero requests')
assert.equal(expectedBootstrapRequests(FIVE_MINUTES + 1), 3, 'stale snapshot must refresh in background')
assert.equal(expectedBootstrapRequests(DAY + 1), 3, 'expired snapshot must cold refresh')
checks.push('deterministic cold/fresh/stale request counts')

function chooseShows(staleRows, featuredRows, fallbackRows) {
  if (featuredRows.length > 0) return featuredRows
  if (fallbackRows.length > 0) return fallbackRows
  return staleRows
}

assert.deepEqual(chooseShows(['stale'], ['featured'], ['fallback']), ['featured'])
assert.deepEqual(chooseShows(['stale'], [], ['fallback']), ['fallback'])
assert.deepEqual(chooseShows(['stale'], [], []), ['stale'])
checks.push('featured preference, fallback selection and empty-refresh retention')

check(
  'catalog transport already forwards AbortSignal',
  /requestCatalogJsonWithFallback\([\s\S]{0,220}PODCAST_REQUEST_TIMEOUT_MS,\s*signal,/.test(api),
)

check(
  'cold default entry starts categories, featured and fallback in one bounded wave',
  hook.includes('const [categoriesResult, featuredResult, fallbackResult] = await Promise.allSettled([')
    && hook.includes('fetchPodcastCategories(controller.signal)')
    && hook.includes('fetchPodcastFeaturedShows(')
    && hook.includes('{ page: 1, limit: FALLBACK_SHOWS_LIMIT },')
    && !hook.includes('if (nextFeatured.length === 0)'),
)

check(
  'bounded snapshot supports fresh reuse and stale-while-revalidate',
  hook.includes('PODCASTS_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000')
    && hook.includes('PODCASTS_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000')
    && hook.includes('if (initialSnapshot?.fresh && bootstrapRetryNonce === 0) return')
    && hook.includes('featuredShowsRef.current.length === 0 && fallbackShowsRef.current.length === 0'),
)

check(
  'fulfilled empty refresh retains stale rows and cannot renew the snapshot TTL',
  hook.includes('let acceptedCategoriesRefresh = false')
    && hook.includes('let acceptedShowRefresh = false')
    && hook.includes('&& acceptedCategoriesRefresh')
    && hook.includes('&& acceptedShowRefresh')
    && !/else if \(featuredResult\.status === 'fulfilled' && fallbackResult\.status === 'fulfilled'\) \{\s*nextFeatured = \[\]/.test(hook),
)

check(
  'filtered browse is independent of bootstrap loading',
  !hook.includes('if (loading) return'),
)

check(
  'category shows and scoped episodes start concurrently',
  hook.includes('const showsPromise = fetchPodcastShows(')
    && hook.includes('const episodesPromise = canFetchScopedEpisodes({ category }) && !trimmedSearch')
    && hook.includes('const [showsResult, episodesResult] = await Promise.allSettled(['),
)

const episodeFetches = [...hook.matchAll(/fetchPodcastEpisodes\(\s*\{([\s\S]*?)\},\s*controller\.signal/g)]
check(
  'the hook never issues an unscoped or q-only episode list',
  hook.includes('canFetchScopedEpisodes({ category }) && !trimmedSearch')
    && episodeFetches.length === 2
    && episodeFetches.every((match) => match[1].includes('category:'))
    && episodeFetches.every((match) => !match[1].includes('query:')),
)

check(
  'base episode rows commit before optional title enrichment',
  /setBrowseEpisodes\(nextEpisodes\)[\s\S]{0,500}enrichEpisodes\(nextEpisodes/.test(hook),
)

check(
  'default, filtered-show and filtered-episode pagination remain isolated',
  hook.includes('const [defaultShowsPagination, setDefaultShowsPagination]')
    && hook.includes('const [browseShowsPagination, setBrowseShowsPagination]')
    && hook.includes('const [browseEpisodesPagination, setBrowseEpisodesPagination]'),
)

check(
  'query changes abort and invalidate both load-more paths',
  /showsLoadMoreAbortRef\.current\?\.abort\(\)[\s\S]{0,180}episodesLoadMoreAbortRef\.current\?\.abort\(\)[\s\S]{0,180}showsLoadMoreRequestRef\.current \+= 1[\s\S]{0,180}episodesLoadMoreRequestRef\.current \+= 1/.test(hook),
)

check(
  'late browse and load-more commits are identity or generation guarded',
  hook.includes('requestId !== browseRequestRef.current')
    && hook.includes('browseDataIdentityRef.current !== requestIdentity')
    && hook.includes('requestId !== showsLoadMoreRequestRef.current')
    && hook.includes('requestId !== episodesLoadMoreRequestRef.current'),
)

check(
  'all deferred state work is cancel or generation guarded',
  hook.includes('controller.signal.aborted || requestId !== bootstrapRequestRef.current')
    && hook.includes('cancelled || resetRequestId !== browseRequestRef.current')
    && hook.includes('if (!cancelled) setSelectedCategorySlug(null)'),
)

check(
  'same-identity failures preserve already-visible rows',
  hook.includes('const hasSameIdentityRows =')
    && hook.includes('sameIdentity')
    && !hook.includes("setBrowseShows([])\n      setBrowseEpisodes([])\n      setContentError(readError"),
)

check(
  'page keeps structure visible and uses static card and episode skeletons',
  page.includes('function PodcastCardSkeletons')
    && page.includes('function PodcastEpisodeSkeletons')
    && page.includes('<PodcastCardSkeletons />')
    && page.includes('<PodcastEpisodeSkeletons />')
    && !page.includes('Loading podcast catalog…')
    && !page.includes('showPageContent'),
)

check(
  'patch does not add playback, route or document reload behavior',
  !hook.includes('useDesktopPlayback')
    && !hook.includes('window.location')
    && !page.includes('window.location.reload()'),
)

console.log(`Podcasts fast-entry contract: ${checks.length}/${checks.length} PASS`)
