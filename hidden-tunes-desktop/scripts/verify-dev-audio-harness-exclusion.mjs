#!/usr/bin/env node
/**
 * Prove DEV audio harness fixtures stay available via explicit getter exports
 * and are excluded from the public catalog path.
 *
 * Run: node scripts/verify-dev-audio-harness-exclusion.mjs
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

const harness = fs.readFileSync(path.join(ROOT, 'src/lib/devAudioVersionTestHarness.ts'), 'utf8')
const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
const parity = fs.readFileSync(path.join(ROOT, 'src/lib/home/mobileHomeParity.ts'), 'utf8')

assert(harness.includes('export function getDevAudioVersionTestSongs'), 'getter exported for diagnostic access')
assert(harness.includes('export function excludeInternalDevCatalogSongs'), 'public exclusion helper exported')
assert(harness.includes('export function isInternalDevCatalogSong'), 'structured internal marker helper exported')
assert(harness.includes("DEV_AUDIO_VERSION_ID_PREFIX = 'dev-audio-version-'"), 'structured id prefix')
assert(harness.includes("DEV_AUDIO_VERSION_TAG = 'desktop-dev'"), 'structured desktop-dev tag')
assert(
  harness.includes("return excludeInternalDevCatalogSongs(songs)"),
  'legacy withDevAudioVersionTestSongs no longer prepends fixtures',
)
assert(
  !harness.includes('[...missingDevSongs, ...songs]'),
  'harness no longer prepends missingDevSongs into catalog arrays',
)

assert(app.includes('excludeInternalDevCatalogSongs(songs)'), 'App public displaySongs uses exclusion')
assert(!app.includes('withDevAudioVersionTestSongs(songs)'), 'App no longer injects via withDevAudioVersionTestSongs')

assert(parity.includes('seenSongIds'), 'Home hero dedupes by stable song id')

// Runtime-shaped exclusion logic (mirrors harness helpers)
const DEV_AUDIO_VERSION_ID_PREFIX = 'dev-audio-version-'
const DEV_AUDIO_VERSION_TAG = 'desktop-dev'
function isInternalDevCatalogSong(song) {
  const id = String(song.id || '')
  if (id.startsWith(DEV_AUDIO_VERSION_ID_PREFIX)) return true
  return Array.isArray(song.tags) && song.tags.includes(DEV_AUDIO_VERSION_TAG)
}
function excludeInternalDevCatalogSongs(songs) {
  return songs.filter((song) => !isInternalDevCatalogSong(song))
}

const fixtures = [
  { id: 'dev-audio-version-full', title: 'DEV Audio Versions: All Tiers', tags: ['desktop-dev'] },
  { id: 'dev-audio-version-lean', title: 'DEV Audio Versions: Ultra + Standard', tags: ['desktop-dev'] },
]
const mixed = [
  { id: 'real-1', title: 'Genuine Track', tags: ['public'] },
  fixtures[0],
  { id: 'real-2', title: 'Another Track', tags: [] },
]
const filtered = excludeInternalDevCatalogSongs(mixed)
assert(filtered.length === 2, 'exclusion keeps genuine songs')
assert(filtered.every((s) => !isInternalDevCatalogSong(s)), 'no internal songs remain')
assert(!filtered.some((s) => String(s.title).includes('DEV Audio')), 'DEV Audio titles absent from public list')
assert(fixtures.every(isInternalDevCatalogSong), 'fixtures remain identifiable for diagnostic tools')

console.log(
  JSON.stringify(
    {
      fixtureIds: fixtures.map((s) => s.id),
      publicIds: filtered.map((s) => s.id),
    },
    null,
    2,
  ),
)
