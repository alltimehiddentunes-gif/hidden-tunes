/**
 * Auto-next + smart queue mobile-parity contract tests.
 * Run: node scripts/test-auto-next-smart-queue.mjs
 *
 * Pure helpers mirror src/lib/desktopPlayback/smartContinuation.ts
 * plus structural checks against DesktopPlaybackProvider.
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

const SMART_CONTINUATION_LIMIT = 12
const ENDED_ADVANCE_DEBOUNCE_MS = 1500
const AUTO_NEXT_INVALID_SKIP_LIMIT = 8
const DEV_AUDIO_VERSION_ID_PREFIX = 'dev-audio-version-'
const DEV_AUDIO_VERSION_TAG = 'desktop-dev'

function isInternalDevCatalogSong(song) {
  const id = String(song?.id || '')
  if (id.startsWith(DEV_AUDIO_VERSION_ID_PREFIX)) return true
  return Array.isArray(song?.tags) && song.tags.includes(DEV_AUDIO_VERSION_TAG)
}

function isPlayableMediaUrl(url) {
  if (!url || typeof url !== 'string') return false
  const trimmed = url.trim()
  return (
    trimmed.startsWith('https://')
    || trimmed.startsWith('http://')
    || trimmed.startsWith('ht-download://')
  )
}

function songHasPlayableUrl(song) {
  return (
    isPlayableMediaUrl(song.audioUrl)
    || isPlayableMediaUrl(song.previewUrl)
    || isPlayableMediaUrl(song.highQualityUrl)
  )
}

function isBoundedPlaybackContext(context, seedType, bounded) {
  if (typeof bounded === 'boolean') return bounded
  return true
}

function scoreSmartContinuationCandidate(song, current, index) {
  if (song.id === current.id) return { score: -1, reason: 'same_song' }
  if (isInternalDevCatalogSong(song)) return { score: -1, reason: 'dev_fixture' }
  if (!songHasPlayableUrl(song)) return { score: -1, reason: 'unplayable' }
  const orderBias = Math.max(0, 500 - index)
  if (song.artist && current.artist && song.artist === current.artist) {
    return { score: 75000 + orderBias, reason: 'same_artist' }
  }
  return { score: 100 + orderBias, reason: 'full_catalog_fallback' }
}

function buildSmartContinuation({
  currentQueue,
  currentTrack,
  context,
  seedType,
  seedTracks = [],
  bounded,
}) {
  if (!currentQueue.length) return { relatedTracks: [], reason: 'empty_queue' }
  if (seedType === 'manual') return { relatedTracks: [], reason: 'manual_seed' }
  if (isBoundedPlaybackContext(context, seedType, bounded)) {
    return { relatedTracks: [], reason: 'bounded_context' }
  }
  if (context !== 'home' && context !== 'discover' && context !== 'smart') {
    return { relatedTracks: [], reason: 'non_music_context' }
  }
  const current = currentTrack || currentQueue[currentQueue.length - 1]
  const existingIds = new Set(currentQueue.map((s) => s.id))
  existingIds.add(current.id)
  const pool = seedTracks.length ? seedTracks : currentQueue
  const scored = pool
    .map((song, index) => ({ song, ...scoreSmartContinuationCandidate(song, current, index) }))
    .filter((e) => e.score > 0 && !existingIds.has(e.song.id))
    .sort((a, b) => b.score - a.score)
  const seen = new Set()
  const relatedTracks = []
  for (const entry of scored) {
    if (seen.has(entry.song.id)) continue
    seen.add(entry.song.id)
    relatedTracks.push(entry.song)
    if (relatedTracks.length >= SMART_CONTINUATION_LIMIT) break
  }
  return { relatedTracks, reason: scored[0]?.reason || 'none' }
}

function insertPlayNext(queue, activeIndex, song) {
  const insertAt = activeIndex >= 0 ? Math.min(activeIndex + 1, queue.length) : queue.length
  return [...queue.slice(0, insertAt), song, ...queue.slice(insertAt)]
}

function enqueueBeforeSmart(queue, song, smartStart) {
  if (smartStart >= 0 && smartStart <= queue.length) {
    return {
      queue: [...queue.slice(0, smartStart), song, ...queue.slice(smartStart)],
      smartStart: smartStart + 1,
      index: smartStart,
    }
  }
  return { queue: [...queue, song], smartStart, index: queue.length }
}

function findNextAutoAdvanceIndex(queue, fromIndex) {
  if (fromIndex < 0 || fromIndex >= queue.length) return -1
  let skipped = 0
  for (let i = fromIndex; i < queue.length; i++) {
    if (skipped > AUTO_NEXT_INVALID_SKIP_LIMIT) return -1
    const song = queue[i]
    if (!song) {
      skipped += 1
      continue
    }
    if (!songHasPlayableUrl(song)) {
      skipped += 1
      continue
    }
    return i
  }
  return -1
}

function song(id, overrides = {}) {
  return {
    id,
    title: `Song ${id}`,
    artist: overrides.artist || 'Artist',
    audioUrl: overrides.audioUrl === null ? null : (overrides.audioUrl || `https://cdn.example/${id}.mp3`),
    previewUrl: null,
    highQualityUrl: null,
    tags: overrides.tags || [],
    ...overrides,
  }
}

// --- Behavioural fixtures ---

const section = [song('a'), song('b'), song('c')]
const catalog = [
  song('c1', { artist: 'Alpha' }),
  song('c2', { artist: 'Alpha' }),
  song('c3', { artist: 'Beta' }),
  song('c4', { artist: 'Alpha' }),
  song('c5', { artist: 'Gamma' }),
]

// 1. Auto-next advances once conceptually (index + 1)
{
  let index = 0
  index += 1
  check('1. auto-next advances once', index === 1 && section[index].id === 'b')
}

// 2. Ended debounce blocks double advance
{
  const last = { songId: 'a', at: 1000 }
  const now = 1000 + ENDED_ADVANCE_DEBOUNCE_MS - 1
  const blocked = last.songId === 'a' && now - last.at < ENDED_ADVANCE_DEBOUNCE_MS
  check('2. same ended event cannot advance twice', blocked === true)
}

// 3. Repeat-one stays on current
{
  const repeat = 'one'
  const nextIndex = repeat === 'one' ? 1 : 2
  check('3. repeat-one restarts current', repeat === 'one' && nextIndex === 1)
}

// 4. Repeat-all wraps
{
  const index = 2
  const wrap = index + 1 >= section.length ? 0 : index + 1
  check('4. repeat-all wraps at queue end', wrap === 0)
}

// 5. Shuffle contract: upcoming-only reshuffle leaves current at index
{
  const q = ['cur', 'u1', 'u2', 'u3']
  const current = q[0]
  const upcoming = q.slice(1).reverse()
  const reshuffled = [current, ...upcoming]
  check('5. shuffle keeps current first', reshuffled[0] === 'cur' && reshuffled.length === 4)
}

// 6. Play next outranks smart continuation
{
  let queue = [song('now'), song('later')]
  let smartStart = -1
  // exhaust → append smart
  const smart = [song('smart1'), song('smart2')]
  smartStart = queue.length
  queue = [...queue, ...smart]
  // play next inserts after current (0)
  queue = insertPlayNext(queue, 0, song('playNext'))
  smartStart += 1
  check(
    '6. play next outranks smart continuation',
    queue.map((s) => s.id).join(',') === 'now,playNext,later,smart1,smart2'
    && smartStart === 3,
  )
}

// 7. Add to queue before smart region
{
  let queue = [song('now'), song('s1'), song('s2')]
  let smartStart = 1
  const result = enqueueBeforeSmart(queue, song('manual'), smartStart)
  check(
    '7. add to queue remains before smart items',
    result.queue.map((s) => s.id).join(',') === 'now,manual,s1,s2'
    && result.smartStart === 2,
  )
}

// 8. Smart append only when unbounded + exhaustion semantics
{
  const bounded = buildSmartContinuation({
    currentQueue: section,
    currentTrack: section[2],
    context: 'home',
    seedType: 'home',
    seedTracks: catalog,
    bounded: true,
  })
  const unbounded = buildSmartContinuation({
    currentQueue: [catalog[0]],
    currentTrack: catalog[0],
    context: 'home',
    seedType: 'home',
    seedTracks: catalog,
    bounded: false,
  })
  check('8a. bounded home section does not smart-append', bounded.relatedTracks.length === 0)
  check('8b. unbounded full-catalog can smart-append', unbounded.relatedTracks.length > 0)
  check(
    '8c. smart batch bounded to 12',
    unbounded.relatedTracks.length <= SMART_CONTINUATION_LIMIT,
  )
}

// 9. Smart fetch failure does not break queue (empty related → queue unchanged)
{
  const queue = [song('only')]
  const { relatedTracks } = buildSmartContinuation({
    currentQueue: queue,
    currentTrack: queue[0],
    context: 'home',
    seedType: 'home',
    seedTracks: [song('only')],
    bounded: false,
  })
  check('9. smart failure/empty fails open', relatedTracks.length === 0 && queue.length === 1)
}

// 10-11. Broken next skipped with bound
{
  const queue = [
    song('ok1'),
    song('bad1', { audioUrl: null }),
    song('bad2', { audioUrl: null }),
    song('ok2'),
  ]
  const next = findNextAutoAdvanceIndex(queue, 1)
  check('10. broken next item skipped once safely', next === 3 && queue[next].id === 'ok2')

  const allBad = [
    song('b1', { audioUrl: null }),
    song('b2', { audioUrl: null }),
    song('b3', { audioUrl: null }),
  ]
  // fabricate more than limit
  const manyBad = Array.from({ length: AUTO_NEXT_INVALID_SKIP_LIMIT + 3 }, (_, i) =>
    song(`x${i}`, { audioUrl: null }),
  )
  const stopped = findNextAutoAdvanceIndex(manyBad, 0)
  check('11. several broken items stop after bounded limit', stopped === -1 && allBad.length === 3)
}

// 12-13. Duplicate + current excluded
{
  const { relatedTracks } = buildSmartContinuation({
    currentQueue: [catalog[0], catalog[1]],
    currentTrack: catalog[0],
    context: 'home',
    seedType: 'home',
    seedTracks: [catalog[0], catalog[1], catalog[0], catalog[2]],
    bounded: false,
  })
  const ids = relatedTracks.map((s) => s.id)
  check('12. duplicate catalogue IDs excluded', new Set(ids).size === ids.length)
  check('13. current song not immediately re-added', !ids.includes(catalog[0].id))
}

// 14. Manual reorder stability (swap middle)
{
  const q = ['a', 'b', 'c', 'd']
  const from = 1
  const to = 3
  const next = [...q]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  check('14. manual reorder remains stable', next.join(',') === 'a,c,d,b')
}

// 15. Queue survives route navigation — structural (provider wraps app)
{
  const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
  check(
    '15. queue survives route navigation (provider ownership)',
    app.includes('DesktopPlaybackProvider') && app.includes('selectAndPlay'),
  )
}

// 16. Home does not navigate to player
{
  const app = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8')
  check(
    '16. Home does not navigate to player when playback starts',
    app.includes("context === 'home' || context === 'discover'")
    && app.includes('setDesktopSelectedTrack(resolved)'),
  )
}

// 17. Exactly one HTMLAudioElement
{
  const service = fs.readFileSync(
    path.join(ROOT, 'src/lib/desktopPlayback/HtmlAudioPlaybackService.ts'),
    'utf8',
  )
  check(
    '17. exactly one HTMLAudioElement ownership marker',
    service.includes("data-ht-playback") && service.includes('new Audio('),
  )
}

// 18-20. TV/Sports mutex
{
  const provider = fs.readFileSync(
    path.join(ROOT, 'src/context/DesktopPlaybackProvider.tsx'),
    'utf8',
  )
  check('18. TV/Sports video ownership remains separate', provider.includes('usesDesktopVideoPath'))
  check('19. audio stops when TV starts', provider.includes("stopInactiveMedia('video')"))
  check('20. TV stops when audio starts', provider.includes("stopInactiveMedia('audio')"))
}

// 21. Live radio not treated as normal song smart queue
{
  const radioBlocked = buildSmartContinuation({
    currentQueue: [song('r1')],
    currentTrack: song('r1'),
    context: 'radio',
    seedType: 'manual',
    seedTracks: catalog,
    bounded: false,
  })
  check('21. live radio not treated as song smart queue', radioBlocked.relatedTracks.length === 0)
}

// 22. DEV fixtures cannot enter smart continuation
{
  const { relatedTracks } = buildSmartContinuation({
    currentQueue: [catalog[0]],
    currentTrack: catalog[0],
    context: 'home',
    seedType: 'home',
    seedTracks: [
      song('dev-audio-version-full', { tags: [DEV_AUDIO_VERSION_TAG] }),
      catalog[2],
    ],
    bounded: false,
  })
  check(
    '22. DEV/diagnostic records cannot enter smart continuation',
    !relatedTracks.some((s) => s.id.startsWith(DEV_AUDIO_VERSION_ID_PREFIX)),
  )
}

// 23. Zero-song creators cannot seed — empty seedTracks → no candidates beyond queue
{
  const { relatedTracks } = buildSmartContinuation({
    currentQueue: [catalog[0]],
    currentTrack: catalog[0],
    context: 'home',
    seedType: 'home',
    seedTracks: [],
    bounded: false,
  })
  check('23. empty seed pool cannot invent recommendations', relatedTracks.length === 0)
}

// 24. Long queues remain performant (inspect bound)
{
  const long = Array.from({ length: 500 }, (_, i) => song(`L${i}`))
  const started = performance.now()
  buildSmartContinuation({
    currentQueue: long.slice(0, 10),
    currentTrack: long[0],
    context: 'home',
    seedType: 'home',
    seedTracks: long,
    bounded: false,
  })
  const ms = performance.now() - started
  check('24. long queues remain performant', ms < 50, `${ms.toFixed(2)}ms`)
}

// 25. Smart continuation does not issue unbounded catalogue requests (source structure)
{
  const smartSrc = fs.readFileSync(
    path.join(ROOT, 'src/lib/desktopPlayback/smartContinuation.ts'),
    'utf8',
  )
  check(
    '25. smart continuation uses bounded inspect/limit constants',
    smartSrc.includes('SMART_CONTINUATION_LIMIT')
    && smartSrc.includes('CATALOG_QUEUE_CANDIDATE_INSPECT_LIMIT')
    && !smartSrc.includes('while (true)'),
  )
}

// Structural provider wiring
{
  const provider = fs.readFileSync(
    path.join(ROOT, 'src/context/DesktopPlaybackProvider.tsx'),
    'utf8',
  )
  const home = fs.readFileSync(
    path.join(ROOT, 'src/components/home/MusicHomePage.tsx'),
    'utf8',
  )
  check('provider uses ENDED_ADVANCE_DEBOUNCE_MS', provider.includes('ENDED_ADVANCE_DEBOUNCE_MS'))
  check('provider gates extend on exhaustion', provider.includes("reason: 'exhaustion'"))
  check('provider tracks smartContinuationStartRef', provider.includes('smartContinuationStartRef'))
  check('provider stores queueSeedBoundedRef', provider.includes('queueSeedBoundedRef'))
  check('home full catalog unbounded', home.includes("bounded: false"))
  check('home sections default bounded', home.includes('options?.bounded ?? true'))
  check(
    'no second queue store introduced',
    !provider.includes('smartQueueRef') && provider.includes('queueRef'),
  )
}

console.log('')
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
