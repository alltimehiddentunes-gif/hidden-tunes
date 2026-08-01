/**
 * Phase 10 — Premium Home honesty / interaction contracts (static source checks).
 * Run: node scripts/verify-phase10-home.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const homePath = path.join(root, 'src/components/home/MusicHomePage.tsx')
const appPath = path.join(root, 'src/App.tsx')
const parityPath = path.join(root, 'src/lib/home/mobileHomeParity.ts')
const sectionsPath = path.join(root, 'src/lib/home/musicHomeSections.ts')
const home = fs.readFileSync(homePath, 'utf8')
const app = fs.readFileSync(appPath, 'utf8')
const parity = fs.readFileSync(parityPath, 'utf8')
const sections = fs.readFileSync(sectionsPath, 'utf8')

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

check(
  'home-mounted-after-play-context',
  (home.includes("'home'") || home.includes('"home"')) &&
    (app.includes("context === 'home'") || app.includes('context === "home"')),
)
check('idle-mix-column', home.includes('music-home-mix-column') && home.includes('showEditorialMix'))
check('active-session-hides-mix', home.includes('is-active-session') && home.includes('hasActiveMediaSession'))
check('hero-real-item', home.includes('buildHomeHeroCards') && home.includes('playHero'))
check('no-fake-charts', !home.includes('HOME_CHARTS') && !home.includes('Top 100'))
check('recently-added-truthful', home.includes('buildRecentlyAddedSongs') && parity.includes('sortSongsList(songs, \'latest\')'))
check('recently-played-rail', home.includes('resolveRecentlyPlayedSongs') && home.includes('Recently Played'))
check('album-body-opens-details', home.includes('onOpenAlbum(card.album)'))
check('album-play-seeds-queue', home.includes('playAlbumCollection(card)') && home.includes("seedType: 'album'"))
check('genre-canonical-intent', home.includes('createMusicGenreIntent') && home.includes('data-home-genres="canonical"'))
check('mood-rooms-catalog-matched', home.includes('buildMoodRooms') && home.includes('data-home-moods="catalog-matched"'))
check('no-mood-free-text-stub', !home.includes("onBrowseSearch(mood.query)"))
check('emotional-worlds-real', home.includes('buildEmotionalWorldCards') && home.includes("HOME_UI.emotionalWorlds.title"))
check('personal-mix-builder', home.includes('buildPersonalMixes') && sections.includes('export function buildPersonalMixes'))
check('cross-media-family', home.includes('FAMILY_SHORTCUTS') && home.includes('Explore Hidden Tunes'))
check('playing-indicator', home.includes('is-playing') && home.includes('aria-current'))
check('quick-access-library', home.includes("navKey: 'library'") && home.includes("navKey: 'downloads'"))
check('phase9-honesty-untouched-sports-flag', fs.existsSync(path.join(root, 'src/lib/sports/sportsFlags.ts')))
check('phase9-account-gate-present', fs.existsSync(path.join(root, 'src/lib/account/accountGate.ts')))
check('art-bounded-shell', home.includes('music-home-art music-home-art--'))

console.log(`\nPhase 10 Home verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
