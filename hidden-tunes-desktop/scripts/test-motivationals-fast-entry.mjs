import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hook = fs.readFileSync(
  path.join(root, 'src/lib/motivationals/useMotivationalsPageData.ts'),
  'utf8',
)
const api = fs.readFileSync(
  path.join(root, 'src/lib/motivationals/motivationalCatalogApi.ts'),
  'utf8',
)
const page = fs.readFileSync(
  path.join(root, 'src/components/motivationals/MotivationalsPage.tsx'),
  'utf8',
)

const checks = []
function check(name, condition) {
  assert.ok(condition, name)
  checks.push(name)
}

const primaryStart = hook.indexOf('const [programsResult, itemsResult]')
const primaryEnd = hook.indexOf('\n  useEffect(() => {', primaryStart)
assert.ok(primaryStart >= 0 && primaryEnd > primaryStart, 'primary bootstrap block must exist')
const primaryBootstrap = hook.slice(primaryStart, primaryEnd)

check(
  'categories load independently from primary content',
  hook.indexOf('await fetchMotivationalCategories(controller.signal)') < primaryStart
    && !primaryBootstrap.includes('fetchMotivationalCategories'),
)
check(
  'primary bootstrap waits only for programs and items',
  primaryBootstrap.includes('Promise.allSettled([')
    && (primaryBootstrap.match(/fetchMotivationalPrograms\(/g) || []).length === 1
    && (primaryBootstrap.match(/fetchMotivationalItems\(/g) || []).length === 1,
)
check(
  'bootstrap has no redundant featured/audio/video request',
  !primaryBootstrap.includes('featuredOnly')
    && !primaryBootstrap.includes("mediaType: 'audio'")
    && !primaryBootstrap.includes("mediaType: 'video'"),
)
check(
  'non-empty programs win and fulfilled items provide the fallback',
  primaryBootstrap.includes("programsResult.status === 'fulfilled' && programsResult.value.programs.length > 0")
    && primaryBootstrap.includes("itemsResult.status === 'fulfilled'")
    && primaryBootstrap.includes("source = 'programs'")
    && primaryBootstrap.includes("source = 'items'"),
)
check(
  'featured/audio/video rails derive from the chosen primary page',
  primaryBootstrap.includes('nextPrograms.filter((program) => program.isFeatured)')
    && primaryBootstrap.includes('nextPrograms.filter(isAudioProgram)')
    && primaryBootstrap.includes('nextPrograms.filter(isVideoProgram)'),
)
check(
  'catalog source stays pending until primary source resolution',
  hook.includes("useState<CatalogSource | null>(null)")
    && hook.includes("type FilterSource = CatalogSource | 'search' | null")
    && hook.includes('if (!filterSource)'),
)
check(
  'base and filtered pagination/cursors cannot overwrite each other',
  hook.includes('browsePagination')
    && hook.includes('filteredPagination')
    && hook.includes('browseCursor')
    && hook.includes('filteredCursor')
    && hook.includes('filteredView ? filteredPagination : browsePagination'),
)
check(
  'filter identity change clears prior filtered rows before the next request',
  hook.includes('setFilteredPrograms([])')
    && hook.includes('setFilteredPagination(null)')
    && hook.includes('setFilteredCursor(null)'),
)
check(
  'load-more work is aborted and generation-invalidated on filter lifecycle changes',
  hook.includes('loadMoreAbortRef.current?.abort()')
    && hook.includes('loadMoreRef.current += 1')
    && hook.includes('controller.signal.aborted || requestId !== loadMoreRef.current'),
)
check(
  'Motivationals transport forwards AbortSignal to the shared request layer',
  /MOTIVATIONAL_REQUEST_TIMEOUT_MS,\s*signal,\s*\)/.test(api),
)
check(
  'filtered loading renders before error/empty branches',
  page.indexOf('contentLoading && visiblePrograms.length === 0') >= 0
    && page.indexOf('contentLoading && visiblePrograms.length === 0')
      < page.indexOf('contentError && visiblePrograms.length === 0'),
)
check(
  'initial entry keeps the shell mounted and uses structural card skeletons',
  !page.includes('<p>Loading Motivationals…</p>')
    && page.includes('skeleton-grid skeleton-grid--card')
    && page.includes('className="skeleton-card"')
    && page.includes('Array.from({ length: 8 }'),
)
check(
  'existing detail and playback handlers remain wired',
  page.includes('onOpen={onOpenProgram}')
    && page.includes('onPlay={() => playProgram(program)}')
    && page.includes('onPlayMotivationalSession('),
)

console.log(`Motivationals fast-entry contract: ${checks.length}/${checks.length} PASS`)
