/**
 * Global search contract checks.
 * Run: node scripts/verify-global-search-contract.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
let failed = 0
function check(label, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const hook = fs.readFileSync(path.join(ROOT, 'src/lib/search/useGlobalDesktopSearch.ts'), 'utf8')
const ui = fs.readFileSync(path.join(ROOT, 'src/components/search/GlobalSearchSections.tsx'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')

check('hook exists', fs.existsSync(path.join(ROOT, 'src/lib/search/useGlobalDesktopSearch.ts')))
check('UI sections exist', fs.existsSync(path.join(ROOT, 'src/components/search/GlobalSearchSections.tsx')))
check('uses AbortController per family batch', hook.includes('AbortController'))
check('stale request guard', hook.includes('requestRef') && hook.includes('requestId !== requestRef.current'))
check('radio bounded q search', hook.includes('fetchRadioStations') && hook.includes('limit: LIMIT'))
check('podcast shows only (no episodes?q=)', hook.includes('fetchPodcastShows') && !hook.includes('/episodes?'))
check('no unscoped episode query string', !/episodes\?q=/.test(hook.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')))
check('audiobooks search', hook.includes('searchAudiobooks'))
check('tv search', hook.includes('searchTvChannels'))
check('motivationals search', hook.includes('searchMotivationals'))
check('library local filter', hook.includes('getLibraryItems'))
check('playlists local filter', hook.includes('listPlaylists'))
check('downloads local filter', hook.includes('listDesktopDownloads'))
check('mature library gated', hook.includes('includeMature: false'))
check('Discover wires GlobalSearchSections', app.includes('GlobalSearchSections'))
check('Discover wires useGlobalDesktopSearch', app.includes('useGlobalDesktopSearch'))
check('UI has Radio section', ui.includes('title="Radio"'))
check('UI has Podcasts section', ui.includes('title="Podcasts"'))
check('UI has Library section', ui.includes('title="Library"'))
check('UI has Playlists section', ui.includes('title="Playlists"'))
check('UI has Downloads section', ui.includes('title="Downloads"'))
check('partial failure isolation (per-family catch)', (hook.match(/\.catch\(/g) || []).length >= 5)

console.log(`\nGlobal search contract: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
