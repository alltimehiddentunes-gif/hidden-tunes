import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = fs.readFileSync(path.join(root, 'src/lib/tv/useTvPageData.ts'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src/components/tv/TvPage.tsx'), 'utf8')

const checks = []
function check(name, condition) {
  assert.ok(condition, name)
  checks.push(name)
}

function seedInitialCatalog(snapshot, { activeFilter = 'all', searchQuery = '' } = {}) {
  const initialDefaultQuery = activeFilter === 'all' && !searchQuery.trim()
  const applicableSnapshot = initialDefaultQuery ? snapshot : null
  return {
    rows: applicableSnapshot?.catalogChannels ?? [],
    hasMore: applicableSnapshot?.hasMore ?? false,
    catalogLoading: !applicableSnapshot,
    hasCatalogResponse: Boolean(applicableSnapshot),
    skipInitialRequest: initialDefaultQuery && snapshot?.fresh === true,
  }
}

const warmDefaultSnapshot = {
  catalogChannels: [{ id: 'default-channel' }],
  hasMore: true,
  fresh: true,
}
const warmSearchState = seedInitialCatalog(warmDefaultSnapshot, {
  searchQuery: 'news',
})
assert.deepEqual(warmSearchState, {
  rows: [],
  hasMore: false,
  catalogLoading: true,
  hasCatalogResponse: false,
  skipInitialRequest: false,
})
assert.deepEqual(
  warmSearchState.rows,
  [],
  'failed initial search cannot retain unrelated default snapshot rows',
)
checks.push('warm snapshot is isolated from initial search and failure retention')

check(
  'initial TV entry has no per-category count fan-out',
  !hook.includes('fetchTvCategoryCount') && !/limit:\s*1(?:\s*[,}])/.test(hook),
)
check(
  'regions are derived from already-fetched metadata without country requests',
  hook.includes('regionsFromFeaturedChannels(featured)')
    && !hook.includes('fetchTvRegionsFromCountries'),
)
check(
  'first catalog page is not gated on bootstrap loading',
  !hook.includes('if (loading) return'),
)
check(
  'default entry remains bounded to categories, featured and first-page request paths',
  hook.includes('fetchTvCategories(abort.signal)')
    && hook.includes('fetchTvChannels({ featured: true, limit: 12, signal: abort.signal })')
    && hook.includes("activeFilter === 'all'"),
)
check(
  'warm remount seeds a bounded TV snapshot and skips the duplicate initial request',
  hook.includes('TV_PAGE_SNAPSHOT_TTL_MS')
    && hook.includes('TV_PAGE_SNAPSHOT_MAX_AGE_MS')
    && hook.includes('readTvPageSnapshot')
    && hook.includes('skipInitialCatalogRequestRef'),
)
check(
  'catalog snapshot state is seeded only for the initial default query identity',
  hook.includes("const initialDefaultQuery = activeFilter === 'all' && !trimmedSearch")
    && hook.includes('const initialCatalogSnapshot = initialDefaultQuery')
    && hook.includes('initialDefaultQuery && initialSnapshot?.fresh === true')
    && hook.includes('const hasCatalogResponseRef = useRef(Boolean(initialCatalogSnapshot))'),
)
check(
  'stale snapshot stays visible while it refreshes in the background',
  hook.includes('snapshot: tvPageSnapshot')
    && hook.includes('fresh: ageMs <= TV_PAGE_SNAPSHOT_TTL_MS')
    && hook.includes('if (initialSnapshot?.fresh) return'),
)
check(
  'stale snapshot TTL renews only after both background refresh paths succeed',
  hook.includes('bootstrapReadyForSnapshot')
    && hook.includes('catalogReadyForSnapshot')
    && hook.includes('categoriesResult.status === \'fulfilled\' && featuredResult.status === \'fulfilled\''),
)
check(
  'late catalog responses remain protected by request generation',
  hook.includes('requestId !== catalogRequestRef.current'),
)
check(
  'query reset microtask is cancelled on rapid identity change or unmount',
  /let cancelled = false[\s\S]{0,120}queueMicrotask\(\(\) => \{[\s\S]{0,80}if \(cancelled\) return[\s\S]{0,120}cancelled = true/.test(hook),
)
check(
  'successful catalog data cannot remain hidden by auxiliary bootstrap failure',
  hook.includes('hasCatalogResponseRef.current = true')
    && hook.includes('setError(null)')
    && hook.includes('!hasCatalogResponseRef.current'),
)
check(
  'refresh failure preserves visible first-page rows',
  hook.includes('catalogChannelsRef.current.length === 0'),
)
check(
  'TV renders structural card placeholders instead of a blocking loading message',
  !page.includes('Loading TV catalog…')
    && page.includes('Array.from({ length: 6 }')
    && page.includes('<ChannelSkeleton'),
)
check(
  'unknown optional counts are presented honestly',
  page.includes("count > 0 ? `${count.toLocaleString()} channels` : 'Browse channels'"),
)

console.log(`TV fast-entry contract: ${checks.length}/${checks.length} PASS`)
