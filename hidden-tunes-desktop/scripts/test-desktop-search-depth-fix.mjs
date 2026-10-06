/**
 * Static + live API verification for Desktop search depth/feedback fix.
 * Read-only against production APIs. Does not publish.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const hook = fs.readFileSync(path.join(root, 'src/lib/search/useGlobalDesktopSearch.ts'), 'utf8')
const sections = fs.readFileSync(path.join(root, 'src/components/search/GlobalSearchSections.tsx'), 'utf8')
const sports = fs.readFileSync(path.join(root, 'src/lib/sports/sportsCatalogApi.ts'), 'utf8')

let passed = 0
function ok(condition, label) {
  assert.ok(condition, label)
  passed += 1
  console.log(`PASS ${label}`)
}

// Enter / feedback
ok(!/setDiscoverQueryFromSearch[\s\S]*?startTransition\(\(\)\s*=>\s*\{\s*setDiscoverQuery/.test(app), 'search commit does not use startTransition')
ok(app.includes('data-search-ack="true"'), 'Searching for query acknowledgement present')
ok(app.includes('Searching for'), 'searching copy present')
ok(app.includes('commitSearchChange(query, true)'), 'Enter flushes debounce immediately')

// Loading no longer waits on microtask before ack
ok(!/await Promise\.resolve\(\)\s*\n\s*if \(gen !== remoteSearchGen\.current\) return\s*\n\s*setRemoteSearchLoading\(true\)/.test(app), 'remote loading not deferred behind Promise.resolve')
ok(app.includes('setRemoteSearchLoading(true)'), 'remote loading set synchronously')

// Preview caps retained on All; expanded shows all loaded
ok(app.includes('SEARCH_SONG_PREVIEW_LIMIT'), 'song preview limit retained')
ok(app.includes("searchTab === 'songs'"), 'songs expanded tab present')
ok(app.includes('visibleSongs.length'), 'expanded songs use loaded length')
ok(app.includes('loadMoreRemoteArtists'), 'artists pagination wired')
ok(app.includes('loadMoreRemoteAlbums'), 'albums pagination wired')
ok(app.includes('See more') || app.includes('See all'), 'See all/more labels present')

// Global families
ok(hook.includes('GLOBAL_SEARCH_INITIAL_LIMIT = 8'), 'initial family page stays small')
ok(hook.includes('loadMoreFamily'), 'family loadMore present')
ok(hook.includes('loadingMore'), 'family loadingMore state present')
ok(hook.includes('hasMore'), 'family hasMore present')
ok(hook.includes('appendUniqueById'), 'dedupe helper present')
ok(hook.includes('queryRef.current !== activeQuery'), 'stale query guard present')
ok(sections.includes('Load more'), 'family Load more UI present')
ok(sections.includes('See all') || sections.includes('See more'), 'family see-all labels present')
ok(sports.includes('page?: number'), 'sports search accepts page')

// Mobile / ios search untouched
ok(!app.includes('/api/ios/search'), 'desktop App does not call /api/ios/search')
ok(!hook.includes('/api/ios/search'), 'global hook does not call /api/ios/search')

async function live() {
  const q = 'a'
  const songs1 = await fetch(`https://api.hiddentunes.com/api/songs?q=${q}&page=1&limit=40`).then((r) => r.json())
  const songs2 = await fetch(`https://api.hiddentunes.com/api/songs?q=${q}&page=2&limit=40`).then((r) => r.json())
  ok(Array.isArray(songs1) && songs1.length === 40, 'live songs page1 returns 40')
  ok(Array.isArray(songs2) && songs2.length === 40, 'live songs page2 returns 40')
  const ids = new Set(songs1.map((s) => s.id))
  const overlap = songs2.filter((s) => ids.has(s.id)).length
  ok(overlap < songs2.length, 'songs page2 is not a full duplicate of page1')

  const artists = await fetch(`https://api.hiddentunes.com/api/artists?q=${q}&page=1&limit=40`).then((r) => r.json())
  ok(Array.isArray(artists.artists) && artists.artists.length > 0, 'live artists search returns rows')

  const radio = await fetch(`https://admin.hiddentunes.com/api/radio/stations?q=${q}&page=1&limit=8`).then((r) => r.json())
  ok(radio.pagination?.hasMore === true, 'live radio hasMore true beyond initial 8')
  ok(Number(radio.pagination?.total) > 8, 'live radio total > 8')

  const podcasts = await fetch(`https://admin.hiddentunes.com/api/podcasts/shows?q=${q}&page=1&limit=8`).then((r) => r.json())
  ok(podcasts.pagination?.hasMore === true, 'live podcasts hasMore true beyond initial 8')

  const radio2 = await fetch(`https://admin.hiddentunes.com/api/radio/stations?q=${q}&page=2&limit=24`).then((r) => r.json())
  const radioIds = new Set((radio.stations || []).map((s) => s.id))
  const radioDupes = (radio2.stations || []).filter((s) => radioIds.has(s.id)).length
  ok((radio2.stations || []).length > 0, 'live radio page2 returns stations')
  ok(radioDupes < (radio2.stations || []).length, 'radio page2 not fully duplicated')
}

await live()
console.log(`\nRESULT ${passed}/${passed} PASS`)
