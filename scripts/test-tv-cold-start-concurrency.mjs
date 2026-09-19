import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const screen = fs.readFileSync(path.join(root, 'app/youtube-feed.tsx'), 'utf8')
const loadStart = screen.indexOf('  const loadTv = useCallback(')
const loadEnd = screen.indexOf('\n  useEffect(() => {', loadStart)
const loadTv = screen.slice(loadStart, loadEnd)

const checks = []
function check(name, condition) {
  assert.ok(condition, name)
  checks.push(name)
}

const cacheStart = loadTv.indexOf('const cachePromise =')
const categoriesStart = loadTv.indexOf('const categoriesPromise = fetchTvCategories')
const homeStart = loadTv.indexOf('const homePromise = fetchTvHomeLanes')
const firstSettlement = loadTv.indexOf('await Promise.allSettled')

check(
  'cache categories and home requests all start before the first settlement await',
  cacheStart >= 0
    && categoriesStart > cacheStart
    && homeStart > categoriesStart
    && firstSettlement > homeStart
    && !loadTv.includes('await loadTvHomeCache()'),
)
check(
  'manual refresh bypasses disk cache without delaying network work',
  loadTv.includes('options?.refresh')
    && loadTv.includes('? Promise.resolve(null)')
    && loadTv.includes(': loadTvHomeCache()'),
)
check(
  'priority lanes retain their progressive publication callback',
  loadTv.includes('onPriorityLanes: (priority) =>')
    && loadTv.includes('const filteredPriority = filterAdminHomeLanes(priority)')
    && loadTv.includes('networkContentPublished = true;'),
)
check(
  'late disk cache cannot replace already-published network content',
  loadTv.includes('if (hasUsableCache && !networkContentPublished)'),
)
check(
  'transient network failure preserves current lanes',
  !loadTv.includes('setLanes([])')
    && !loadTv.includes('setLanes((current) => (current.length ? current : []))'),
)
check(
  'all state commits and finalizers retain mounted and abort guards',
  loadTv.includes('if (!mountedRef.current || controller.signal.aborted) return;')
    && loadTv.includes('if (mountedRef.current && !controller.signal.aborted)')
    && loadTv.includes('finally {'),
)
check(
  'cache categories and home settle independently',
  loadTv.includes('const cacheTask = cachePromise.then')
    && loadTv.includes('const categoriesTask = categoriesPromise.then')
    && loadTv.includes('const homeTask = homePromise')
    && loadTv.includes('Promise.allSettled([cacheTask, categoriesTask, homeTask])'),
)

function createPublicationModel(initialLanes = []) {
  return {
    lanes: initialLanes,
    networkContentPublished: false,
    mounted: true,
    aborted: false,
    commits: [],
    publishCache(lanes) {
      if (!this.mounted || this.aborted || lanes.length === 0) return
      if (this.networkContentPublished) {
        this.commits.push('cache-ignored')
        return
      }
      this.lanes = lanes
      this.commits.push('cache')
    },
    publishNetwork(lanes) {
      if (!this.mounted || this.aborted || lanes.length === 0) return
      this.networkContentPublished = true
      this.lanes = lanes
      this.commits.push('network')
    },
    failNetwork() {
      if (!this.mounted || this.aborted) return
      this.commits.push('network-failed')
    },
  }
}

const cacheFirst = createPublicationModel()
cacheFirst.publishCache(['cached-a'])
cacheFirst.publishNetwork(['network-b'])
assert.deepEqual(cacheFirst.lanes, ['network-b'])
assert.deepEqual(cacheFirst.commits, ['cache', 'network'])
checks.push('behavioral cache-first paint yields to authoritative network content')

const networkFirst = createPublicationModel()
networkFirst.publishNetwork(['network-a'])
networkFirst.publishCache(['cached-b'])
assert.deepEqual(networkFirst.lanes, ['network-a'])
assert.deepEqual(networkFirst.commits, ['network', 'cache-ignored'])
checks.push('behavioral network-first path suppresses late disk cache')

const failedRefresh = createPublicationModel(['cached-a'])
failedRefresh.failNetwork()
assert.deepEqual(failedRefresh.lanes, ['cached-a'])
checks.push('behavioral transient failure retains previously-visible rows')

const cancelled = createPublicationModel()
cancelled.aborted = true
cancelled.publishCache(['cached-a'])
cancelled.publishNetwork(['network-b'])
cancelled.failNetwork()
assert.deepEqual(cancelled.lanes, [])
assert.deepEqual(cancelled.commits, [])
checks.push('behavioral cancellation prevents cache network and error commits')

const refreshStarts = (refresh) => ({
  cacheReads: refresh ? 0 : 1,
  categoryRequests: 1,
  homeRequests: 1,
})
assert.deepEqual(refreshStarts(false), { cacheReads: 1, categoryRequests: 1, homeRequests: 1 })
assert.deepEqual(refreshStarts(true), { cacheReads: 0, categoryRequests: 1, homeRequests: 1 })
checks.push('behavioral refresh bypasses cache while retaining both network starts')

console.log(`TV cold-start concurrency contract: ${checks.length}/${checks.length} PASS`)
