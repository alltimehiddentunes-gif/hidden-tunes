/**
 * Phase 11 — Music deep-browse honesty contracts (static).
 * Run: node scripts/verify-phase11-music.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

const subNav = read('src/components/music/MusicSubNav.tsx')
const discover = read('src/components/music/MusicDiscoverPage.tsx')
const section = read('src/components/music/MusicSectionContent.tsx')
const workspace = read('src/components/music/MusicWorkspace.tsx')
const types = read('src/lib/music/types.ts')
const genres = read('src/lib/musicGenres.ts')
const pages = read('src/lib/music/musicPageSections.ts')
const app = read('src/App.tsx')
const player = read('src/components/player/PremiumFullscreenShell.tsx')
const accountGate = read('src/lib/account/accountGate.ts')
const home = read('src/components/home/MusicHomePage.tsx')

let passed = 0
let failed = 0
function check(label, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

check('music-section-moods-id', types.includes("'moods'"))
check('subnav-liked-recent-moods', /id: 'liked'/.test(subNav) && /id: 'recent'/.test(subNav) && /id: 'moods'/.test(subNav))
check('subnav-scenes-honest', subNav.includes("label: 'Scenes'"))
check('discover-liked-wired', !discover.includes('void _onNavigateLiked') && discover.includes('onNavigateLiked'))
check('discover-downloads-quick', discover.includes('onNavigateDownloads'))
check('discover-album-open', discover.includes("release.kind === 'album'") && discover.includes('onOpenAlbum'))
check('moods-section', section.includes("case 'moods'") && section.includes('data-music-moods'))
check('genres-canonical-page', section.includes('data-music-genres="canonical"'))
check('genre-intent-not-free-text-only', section.includes('createMusicGenreIntent'))
check('genre-registry-present', genres.includes('MUSIC_GENRES') && genres.includes('afrobeats'))
check('genre-pagination-honest', app.includes('genreDefinition') && app.includes('Math.max(visibleSongs.length'))
check('genre-catalogue-marker', app.includes('data-music-genre-catalogue'))
check('charts-not-most-played-claim', !pages.includes('Most played in this genre'))
check('playlists-editorial-honest', section.includes('data-music-playlists="editorial-scenes"'))
check('downloads-real-owner', workspace.includes('onOpenDownloads') && section.includes('onOpenDownloads'))
check('follow-still-gated', accountGate.includes("'follow'"))
check('expanded-player-synced', player.includes('useDesktopPlayback') || fs.existsSync(path.join(root, 'src/components/player/usePlayerShellHooks.ts')))
check('phase10-home-intact', home.includes('buildEmotionalWorldCards') && home.includes('resolveRecentlyPlayedSongs'))
check('phase9-downloads-honesty', !section.includes('Offline downloads are not available on desktop yet'))
check('workspace-context-discover', discover.includes("'discover'") || workspace.includes('discover'))

console.log(`\nPhase 11 Music verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
