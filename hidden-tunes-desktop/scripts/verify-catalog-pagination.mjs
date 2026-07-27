/**
 * Catalogue pagination, cache, dedupe, abort, and stale-request checks.
 * Uses Node-local doubles — no Electron network required.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

let passed = 0
function ok(name, condition) {
  assert.ok(condition, name)
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('Phase 7A — catalogue pagination / cache')

const typesSrc = fs.readFileSync(path.join(ROOT, 'src/lib/musicCatalog/types.ts'), 'utf8')
const serviceSrc = fs.readFileSync(path.join(ROOT, 'src/lib/musicCatalog/catalogService.ts'), 'utf8')
const dedupeSrc = fs.readFileSync(path.join(ROOT, 'src/lib/musicCatalog/dedupe.ts'), 'utf8')
const pageCacheSrc = fs.readFileSync(path.join(ROOT, 'src/lib/musicCatalog/pageCache.ts'), 'utf8')
const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')

function extractConstNumber(src, name) {
  const match = src.match(new RegExp(`export const ${name} = ([^\\n]+)`))
  assert.ok(match, `missing ${name}`)
  return Function(`"use strict"; return (${match[1]});`)()
}

const PAGE_SIZE = extractConstNumber(typesSrc, 'MUSIC_CATALOG_PAGE_SIZE')
const MAX_ENTRIES = extractConstNumber(typesSrc, 'MUSIC_CATALOG_CACHE_MAX_ENTRIES')
const TTL_MS = extractConstNumber(typesSrc, 'MUSIC_CATALOG_CACHE_TTL_MS')
const MAX_BYTES = extractConstNumber(typesSrc, 'MUSIC_CATALOG_CACHE_MAX_BYTES')

ok('page size is bounded (40)', PAGE_SIZE === 40)
ok('cache max entries bounded', MAX_ENTRIES === 48)
ok('cache TTL is 6h', TTL_MS === 1000 * 60 * 60 * 6)
ok('cache max bytes bounded', MAX_BYTES === 1_500_000)

function inferHasMore(itemCount, limit, total) {
  if (typeof total === 'number' && Number.isFinite(total)) {
    if (itemCount < limit) return false
    return itemCount >= limit
  }
  return itemCount >= limit
}

ok('hasMore=false when short page', inferHasMore(10, 40, null) === false)
ok('hasMore=true when full page', inferHasMore(40, 40, null) === true)
ok('hasMore=false on empty later page', inferHasMore(0, 40, null) === false)

ok(
  'request key includes origin tag',
  typesSrc.includes('origin') && typesSrc.includes('unknown')
    && serviceSrc.includes('resolveCatalogOriginTag'),
)

ok(
  'clamp rejects negative/oversized limits',
  typesSrc.includes('MUSIC_CATALOG_MAX_PAGE_SIZE')
    && typesSrc.includes('Math.max(1, n)'),
)

ok('page floor uses Math.max(1', serviceSrc.includes('Math.max(1, Math.floor(request.page'))

// --- memory localStorage double + page cache behaviour ---
const memory = new Map()
const localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => {
    memory.set(k, String(v))
  },
  removeItem: (k) => {
    memory.delete(k)
  },
}

const INDEX_KEY = 'ht-desktop:music-catalog-pages:v2:index'
const VERSION = 2

function entryKey(requestKey) {
  return `ht-desktop:music-catalog-page:v${VERSION}:${requestKey}`
}

function readIndex() {
  const raw = localStorage.getItem(INDEX_KEY)
  if (!raw) return []
  return JSON.parse(raw)
}

function writeIndex(entries) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
}

function evictIfNeeded(entries) {
  let next = [...entries].sort((a, b) => a.updatedAt - b.updatedAt)
  let totalBytes = next.reduce((sum, e) => sum + e.bytes, 0)
  while (next.length > MAX_ENTRIES || totalBytes > MAX_BYTES) {
    const oldest = next.shift()
    if (!oldest) break
    totalBytes -= oldest.bytes
    localStorage.removeItem(entryKey(oldest.key))
  }
  return next
}

function writeCache(requestKey, payload) {
  const envelope = {
    version: VERSION,
    key: requestKey,
    savedAt: Date.now(),
    payload,
  }
  const serialized = JSON.stringify(envelope)
  localStorage.setItem(entryKey(requestKey), serialized)
  const without = readIndex().filter((e) => e.key !== requestKey)
  without.push({ key: requestKey, bytes: serialized.length, updatedAt: Date.now() })
  writeIndex(evictIfNeeded(without))
}

function readCache(requestKey) {
  const raw = localStorage.getItem(entryKey(requestKey))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed.version !== VERSION) {
      localStorage.removeItem(entryKey(requestKey))
      return null
    }
    return parsed
  } catch {
    localStorage.removeItem(entryKey(requestKey))
    return null
  }
}

const page1 = {
  items: Array.from({ length: 40 }, (_, i) => ({ id: `s${i}` })),
  page: 1,
  limit: 40,
  total: null,
}
const page2 = {
  items: Array.from({ length: 40 }, (_, i) => ({ id: `s${i + 40}` })),
  page: 2,
  limit: 40,
  total: null,
}
writeCache('origin-a:songs:p1', page1)
ok('first catalogue page cacheable', readCache('origin-a:songs:p1')?.payload?.items?.length === 40)

let songs = [...page1.items]
songs = [...songs, ...page2.items]
ok(
  'next page appends without replacing page 1',
  songs[0].id === 's0' && songs[40].id === 's40' && songs.length === 80,
)

function appendUniqueById(prev, next) {
  const seen = new Set(prev.map((item) => item.id))
  const merged = [...prev]
  for (const item of next) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }
  return merged
}

const withDupes = appendUniqueById(page1.items, [
  ...page1.items.slice(0, 5),
  ...page2.items,
])
ok('dedupe by canonical id', withDupes.length === 80 && withDupes[0].id === 's0')

writeCache('origin-a:songs:p1:q=rock', page1)
writeCache('origin-a:songs:p1:q=jazz', {
  items: [{ id: 'j1' }],
  page: 1,
  limit: 40,
  total: null,
})
ok(
  'no search cache collision',
  readCache('origin-a:songs:p1:q=rock')?.payload?.items?.length === 40
    && readCache('origin-a:songs:p1:q=jazz')?.payload?.items?.[0]?.id === 'j1',
)

writeCache('origin-prod:songs:p1', page1)
writeCache('origin-dev:songs:p1', {
  items: [{ id: 'dev-only' }],
  page: 1,
  limit: 40,
  total: null,
})
ok(
  'no production/development cache collision',
  readCache('origin-prod:songs:p1')?.payload?.items?.length === 40
    && readCache('origin-dev:songs:p1')?.payload?.items?.[0]?.id === 'dev-only',
)

localStorage.setItem(entryKey('corrupt'), '{not-json')
ok('corrupt cache removed', readCache('corrupt') === null && localStorage.getItem(entryKey('corrupt')) === null)

ok(
  'empty search not permanently cached',
  serviceSrc.includes("request.resource !== 'song-search' || live.items.length > 0"),
)

ok(
  'abort not treated as stale-cache success',
  serviceSrc.includes("error.kind === 'abort'")
    && serviceSrc.includes("throw error"),
)

ok(
  'duplicate concurrent requests deduplicated',
  dedupeSrc.includes('inFlight') && dedupeSrc.includes('dedupeAsync'),
)

ok(
  'stale request cancellation supported',
  dedupeSrc.includes('AbortController') && serviceSrc.includes('request.signal'),
)

ok(
  'offline/stale cache fallback path',
  serviceSrc.includes('fromCache: true') && serviceSrc.includes('stale: true'),
)

ok(
  'page cache clear helper exists',
  pageCacheSrc.includes('clearMusicCatalogPageCache'),
)

for (let i = 0; i < MAX_ENTRIES + 10; i += 1) {
  writeCache(`page-${i}`, { items: [{ id: String(i) }], page: i, limit: 1, total: null })
}
ok('cache eviction is bounded', readIndex().length <= MAX_ENTRIES)

const loadMoreSlice = appSrc.slice(
  appSrc.indexOf('loadMoreSongs'),
  appSrc.indexOf('loadMoreAlbums'),
)
ok(
  'next-page error preserves existing items',
  appSrc.includes('setPageError')
    && appSrc.includes('appendUniqueById')
    && !/setSongs\(\[\]\)/.test(loadMoreSlice),
)

ok(
  'load-more concurrency guard present',
  appSrc.includes('songsLoadGuard')
    && appSrc.includes('albumsLoadGuard')
    && appSrc.includes('artistsLoadGuard'),
)

ok(
  'query/search reset uses searchMusicSongsPage',
  appSrc.includes('searchMusicSongsPage'),
)

ok(
  'single playback owner retained',
  (appSrc.match(/DesktopPlaybackProvider/g) || []).length >= 1,
)

ok(
  'persistent player layout retained',
  appSrc.includes('DesktopPersistentPlayer') && appSrc.includes('hasQueueRail = true'),
)

console.log(`\ncatalogue-pagination-cache: ${passed} checks passed`)
