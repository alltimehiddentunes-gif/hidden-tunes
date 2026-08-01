/**
 * Phase 3: Home Recently Added must never overlay fake editorial identity
 * on real catalogue songs.
 *
 * Run: node scripts/verify-recently-added-truthfulness.mjs
 *   or: npm run verify:recently-added
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function readSrc(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function pass(condition, message) {
  assert.ok(condition, message)
  console.log(`PASS: ${message}`)
}

const homePage = readSrc('src/components/home/MusicHomePage.tsx')
const parity = readSrc('src/lib/home/mobileHomeParity.ts')
const api = readSrc('src/lib/api.ts')

// --- Fake overlay removed ---
pass(!/\bHOME_RELEASES\b/.test(homePage), 'HOME_RELEASES fake release array is removed')
pass(!/Sunset Dreams/.test(homePage), 'Fake title “Sunset Dreams” is gone from Home')
pass(!/Jaden Moore/.test(homePage), 'Fake artist “Jaden Moore” is gone from Home')
pass(!/release-sunset-dreams\.webp/.test(homePage), 'Fake reference artwork is not used on Recently Added')
pass(
  !/HOME_RELEASES\.map[\s\S]{0,200}recentlyAdded\[index/.test(homePage),
  'No index-based fake→real song overlay remains',
)

// --- Real catalogue source ---
pass(
  /buildRecentlyAddedSongs\(songs,\s*HOME_SECTION_PREVIEW_LIMIT\)/.test(homePage),
  'Recently Added uses buildRecentlyAddedSongs from production catalogue songs',
)
pass(
  /export function buildRecentlyAddedSongs/.test(parity),
  'buildRecentlyAddedSongs helper exists',
)
pass(
  /sortSongsList\(songs,\s*'latest'\)\.slice\(0,\s*limit\)/.test(parity),
  'Recently Added ordering is createdAt-latest (sortSongsList latest)',
)
pass(
  /Date\.parse\(b\.createdAt/.test(api) && /sort === 'az'/.test(api),
  'sortSongsList latest compares createdAt timestamps',
)

// --- Visible identity === playable identity ---
pass(
  /recentlyAdded\.map\(\(song,\s*index\)\s*=>/.test(homePage),
  'Rail maps recentlyAdded songs directly',
)
pass(
  /playFromQueue\(song,\s*recentlyAdded,\s*HOME_UI\.sections\.recentlyAdded\)/.test(homePage),
  'Click dispatches the same song object shown in the card',
)
pass(
  /key=\{song\.id\}/.test(homePage),
  'Card key is the catalogue song id',
)
pass(
  /src=\{song\.artwork\}/.test(homePage) && /label=\{title\}/.test(homePage),
  'Artwork and label come from the real song',
)
pass(
  /<strong title=\{title\}>\{title\}<\/strong>/.test(homePage),
  'Visible title is the real song title',
)
pass(
  /<small title=\{artist\}>\{artist\}<\/small>/.test(homePage),
  'Visible artist is the real song artist',
)
pass(
  /song\.title\?\.trim\(\)\s*\|\|\s*'Untitled'/.test(homePage),
  'Missing title uses honest Untitled fallback',
)
pass(
  /song\.artist\?\.trim\(\)\s*\|\|\s*'Unknown artist'/.test(homePage),
  'Missing artist uses honest Unknown artist fallback',
)

// --- Empty / loading honesty ---
pass(
  /recentlyAdded\.length === 0[\s\S]{0,120}music-home-section-empty/.test(homePage)
    || /HOME_UI\.recentlyAddedEmpty/.test(homePage),
  'Empty state uses honest empty copy, not fake cards',
)
pass(
  /loading=\{showCatalogSkeleton && recentlyAdded\.length === 0\}/.test(homePage),
  'Loading flag is tied to skeleton + empty list (no fake clickable cards)',
)

// --- Label truth ---
pass(
  /recentlyAdded:\s*'Recently Added'/.test(parity),
  'Section label remains Recently Added',
)
pass(
  /sortSongsList\(songs,\s*'latest'\)/.test(parity),
  'Label matches createdAt-latest ordering evidence',
)

console.log('Recently Added truthfulness checks passed.')
