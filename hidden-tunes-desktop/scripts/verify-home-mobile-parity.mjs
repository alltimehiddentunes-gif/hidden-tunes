#!/usr/bin/env node
/**
 * Static verification: desktop Home matches mobile Home section titles/order.
 * Run from hidden-tunes-desktop: node scripts/verify-home-mobile-parity.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${message}`)
  }
}

const homePage = fs.readFileSync(
  path.join(ROOT, 'src/components/home/MusicHomePage.tsx'),
  'utf8',
)
const parityLib = fs.readFileSync(
  path.join(ROOT, 'src/lib/home/mobileHomeParity.ts'),
  'utf8',
)
const css = fs.readFileSync(path.join(ROOT, 'src/App.css'), 'utf8')

const expectedTitlesInOrder = [
  'Search Hidden Tunes...',
  'Emotional Worlds',
  'Mood Rooms',
  'Recently Added',
  'Because You Listened',
  'Smart Music Queue',
  'Creators In Your Orbit',
  'Albums Worth Staying With',
  'Open Rooms',
  'Genre Spotlights',
  'Made for you',
  'All Songs',
]

for (const title of expectedTitlesInOrder) {
  assert(
    homePage.includes(title) || parityLib.includes(`'${title}'`) || parityLib.includes(`"${title}"`),
    `expected mobile title present: ${title}`,
  )
}

const forbidden = [
  'Recommended for You',
  'More to Explore',
  'Radio Picks',
  'Podcast Picks',
  'Jump In',
]

for (const label of forbidden) {
  assert(!homePage.includes(label), `no desktop-invented section: ${label}`)
}

assert(homePage.includes("HOME_UI.shortcuts.radio"), 'family shortcut Radio')
assert(homePage.includes("HOME_UI.shortcuts.podcasts"), 'family shortcut Podcasts')
assert(homePage.includes("HOME_UI.shortcuts.audiobooks"), 'family shortcut Audiobooks')
assert(homePage.includes("HOME_UI.shortcuts.more"), 'family shortcut More')
assert(homePage.includes('music-home-hero-carousel'), 'bounded hero carousel markup')
assert(homePage.includes('data-home-parity="mobile"'), 'parity marker')
assert(homePage.includes('useDesktopPlayback'), 'listening brief uses playback provider')
assert(!homePage.includes('100vh'), 'Home page does not use 100vh')
assert(!/height:\s*100%/.test(homePage), 'Home page does not use height 100% ownership')

assert(homePage.includes('music-home-art'), 'bound HomeArt shells present')
assert(homePage.includes('data-home-layout="content-first"'), 'content-first layout marker')
assert(homePage.includes('data-home-polish="premium"') || homePage.includes('music-home--premium'), 'premium polish marker')
assert(css.includes('.music-home-art'), 'HomeArt shell CSS')
assert(css.includes('music-home--premium'), 'premium polish CSS')
assert(css.includes('max-height: 236px') || css.includes('max-height: 240px'), 'hero max-height bounded')

const appSource = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
assert(
  appSource.includes("context === 'home'") && appSource.includes('setDesktopSelectedTrack(resolved)'),
  'Home play stays on discovery page (no PlayerWorkspace hijack)',
)
assert(
  fs.existsSync(path.join(ROOT, 'src/components/player/DesktopPersistentPlayer.tsx')),
  'persistent player remains',
)
assert(
  fs.existsSync(path.join(ROOT, 'src/context/DesktopPlaybackProvider.tsx')),
  'DesktopPlaybackProvider remains',
)
assert(appSource.includes('PlayerBar') || appSource.includes('player-bar'), 'compact bottom player remains')
assert(appSource.includes('sidebar') || appSource.includes('Sidebar'), 'sidebar shell remains')
assert(!homePage.includes('GlobalTopNav'), 'Home does not embed duplicate top route nav')
assert(css.includes('padding-bottom: calc(var(--footer-player-height'), 'clears bottom player')
assert(css.includes('.music-home-hero-carousel'), 'hero carousel CSS')

const orderAnchors = [
  'music-home-search-launcher',
  'music-home-hero-carousel',
  'music-home-signal-row',
  'music-home-listening-brief',
  'music-home-family-grid',
  "HOME_UI.sections.recentlyAdded",
  'music-home-emotional-worlds',
  "HOME_UI.sections.moodRooms",
  "HOME_UI.sections.becauseYouListened",
  "HOME_UI.sections.smartMusicQueue",
  "HOME_UI.sections.creatorsInOrbit",
  "HOME_UI.sections.albumsWorthStaying",
  "HOME_UI.sections.openRooms",
  'HOME_UI.sections.genres',
  "HOME_UI.sections.allSongs",
]

let lastIndex = -1
for (const anchor of orderAnchors) {
  const idx = homePage.indexOf(anchor)
  assert(idx > lastIndex, `section order preserved around ${anchor}`)
  if (idx > lastIndex) lastIndex = idx
}

if (process.exitCode) {
  console.error('\nHome mobile parity verification failed.')
  process.exit(1)
}
console.log('\nHome mobile parity verification passed.')
