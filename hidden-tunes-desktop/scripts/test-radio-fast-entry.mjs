import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = fs.readFileSync(path.join(root, 'src/lib/radio/useRadioPageData.ts'), 'utf8')
const page = fs.readFileSync(path.join(root, 'src/components/radio/RadioPage.tsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/lib/radio/radioCatalogApi.ts'), 'utf8')

const checks = []
function check(name, condition) {
  assert.ok(condition, name)
  checks.push(name)
}

check(
  'default first station page is not gated on auxiliary bootstrap loading',
  !hook.includes('if (loading) return'),
)
check(
  'cold entry remains bounded to categories, countries, featured and one 32-row page',
  hook.includes('fetchRadioCategories(controller.signal)')
    && hook.includes('fetchRadioCountries(controller.signal)')
    && hook.includes('fetchRadioStations({ featured: true, limit: 12 }, controller.signal)')
    && hook.includes('limit: 32'),
)
check(
  'warm navigation uses a five-minute snapshot with a bounded stale lifetime',
  hook.includes('RADIO_PAGE_SNAPSHOT_TTL_MS = 5 * 60 * 1000')
    && hook.includes('RADIO_PAGE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000')
    && hook.includes('readRadioPageSnapshot'),
)
check(
  'fresh default snapshot skips duplicate bootstrap and browse requests',
  hook.includes('const timer = initialSnapshot?.fresh')
    && hook.includes('skipInitialBrowseRequestRef')
    && hook.includes('initialSnapshot?.fresh === true && initialDefaultQuery'),
)
check(
  'stale snapshot remains seeded while background refresh runs',
  hook.includes('initialSnapshot?.snapshot.featuredStations')
    && hook.includes('initialSnapshot?.snapshot.browseStations')
    && hook.includes('initialSnapshot?.snapshot.categories')
    && hook.includes('initialSnapshot?.snapshot.countries'),
)
check(
  'snapshot freshness renews only after complete bootstrap and default browse success',
  hook.includes('bootstrapReadyForSnapshot')
    && hook.includes('browseReadyForSnapshot')
    && hook.includes('allBootstrapRequestsSucceeded'),
)
check(
  'bootstrap work is abortable and generation protected',
  hook.includes('bootstrapAbortRef.current?.abort()')
    && hook.includes('requestId !== bootstrapRequestRef.current'),
)
check(
  'effective tab filters prevent stale country or genre transport requests',
  hook.includes("activeTab === 'countries' ? selectedCountry : null")
    && hook.includes("activeTab === 'all' ? selectedGenre : null"),
)
check(
  'late browse responses must match both generation and query identity',
  hook.includes('requestId !== browseRequestRef.current')
    && hook.includes('requestQueryKey !== browseQueryKeyRef.current'),
)
check(
  'retry refreshes auxiliary metadata and the primary station page',
  hook.includes('setBrowseRetryNonce((value) => value + 1)')
    && hook.includes('browseRetryNonce,'),
)

const lastBrowseCatch = hook.lastIndexOf('        } catch (err) {')
const lastBrowseFinally = hook.indexOf('        } finally {', lastBrowseCatch)
const browseFailureBlock = hook.slice(lastBrowseCatch, lastBrowseFinally)
check(
  'same-query refresh failure preserves already-visible station rows',
  lastBrowseCatch >= 0
    && lastBrowseFinally > lastBrowseCatch
    && !browseFailureBlock.includes('setBrowseStations([])'),
)
check(
  'successful primary data clears a fatal auxiliary error',
  hook.includes('setBrowseStations(response.stations)')
    && hook.includes('setError(null)'),
)
check(
  'search never falls back to unrelated featured stations',
  hook.includes('if (trimmedSearch) return browseStations'),
)
check(
  'Radio renders static structural placeholders without blocking loading copy',
  page.includes('function StationSkeleton()')
    && page.includes('Array.from({ length: 6 }')
    && page.includes('aria-label="Loading stations"')
    && !page.includes('Loading radio catalog…'),
)
check(
  'performance work does not weaken mature-station filtering',
  api.includes('filterMatureStations')
    && api.includes('return stations.filter((station) => !station.isMature)'),
)
check(
  'Radio data path remains observation-only and does not import playback ownership',
  !hook.includes('DesktopPlaybackProvider')
    && !hook.includes('PlayerContext')
    && !hook.includes('resolveRadioPlayUrl'),
)

console.log(`Radio fast-entry contract: ${checks.length}/${checks.length} PASS`)
