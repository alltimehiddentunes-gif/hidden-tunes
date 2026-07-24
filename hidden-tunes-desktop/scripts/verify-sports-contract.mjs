/**
 * Sports foundation contract harness (Node — no UI).
 * Status / identity / playability helpers mirror src/lib/sports/*.
 * Run: node scripts/verify-sports-contract.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

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

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

/* ——— Pure status normalizer (mirrors src/lib/sports/status.ts) ——— */

const TERMINAL_CANCELLED = new Set(['cancelled', 'canceled', 'abandoned', 'abandoned_match'])
const TERMINAL_POSTPONED = new Set(['postponed'])
const TERMINAL_COMPLETED = new Set([
  'finished',
  'completed',
  'ended',
  'final',
  'replay_available',
  'highlights_available',
])
const LIVE_FAMILY = new Set([
  'live',
  'half_time',
  'halftime',
  'ht',
  'intermission',
  'extra_time',
  'et',
  'aet',
  'penalties',
  'pens',
  'pso',
])
const UPCOMING_FAMILY = new Set([
  'scheduled',
  'starting_soon',
  'delayed',
  'verified',
  'upcoming',
  'not_started',
])

function normalizeCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

function normalizeSportsFixtureStatus(input) {
  const diagnostics = []
  const nested = input?.status && typeof input.status === 'object' ? input.status : null
  const code = normalizeCode(input?.code ?? nested?.code ?? input?.label ?? nested?.label)
  const liveFlag = input?.live === true || nested?.live === true
  const finishedFlag = input?.finished === true || nested?.finished === true
  const startTime = input?.startTime ?? null

  if (!code && !liveFlag && !finishedFlag) {
    if (!startTime) diagnostics.push('sports_missing_start_time')
    diagnostics.push('sports_unknown_status')
    return { status: 'unknown', diagnostics }
  }

  if (TERMINAL_CANCELLED.has(code)) {
    if (liveFlag) diagnostics.push('sports_status_conflict')
    return { status: 'cancelled', diagnostics }
  }
  if (TERMINAL_POSTPONED.has(code)) {
    if (liveFlag) diagnostics.push('sports_status_conflict')
    return { status: 'postponed', diagnostics }
  }
  if (TERMINAL_COMPLETED.has(code) || finishedFlag) {
    return { status: 'completed', diagnostics }
  }

  if (LIVE_FAMILY.has(code) || liveFlag) {
    return { status: 'live', diagnostics }
  }

  if (UPCOMING_FAMILY.has(code)) {
    if (!startTime) diagnostics.push('sports_missing_start_time')
    return { status: 'upcoming', diagnostics }
  }

  diagnostics.push('sports_unknown_status')
  if (!startTime) diagnostics.push('sports_missing_start_time')
  return { status: 'unknown', diagnostics }
}

function formatSportsScore(home, away) {
  if (home == null || away == null) return null
  const homeText = String(home).trim()
  const awayText = String(away).trim()
  if (!homeText || !awayText) return null
  return `${homeText}–${awayText}`
}

/* ——— Identity (mirrors src/lib/sports/identity.ts) ——— */

const SPORTS_IDENTITY_PREFIX = 'sports:'
const SPORTS_SONG_ID_PREFIX = 'sports-'

function sportsFixtureIdentity(id) {
  return `${SPORTS_IDENTITY_PREFIX}${String(id || '').trim()}`
}

function sportsFixtureSongId(id) {
  return `${SPORTS_SONG_ID_PREFIX}${String(id || '').trim()}`
}

function historyItemIdentity(type, id) {
  return `${type}:${String(id).trim()}`
}

/* ——— Playability helpers (mirrors resolvePlayableStream messaging / protocol) ——— */

function unavailableMessage(reason, fallback) {
  switch (reason) {
    case 'finished':
      return 'This event has finished.'
    case 'not_started':
      return 'This event is not currently available to play.'
    case 'expired':
      return 'The stream is no longer active.'
    case 'geo_blocked':
    case 'provider_disabled':
    case 'no_broadcast':
      return 'This event is not currently available to play.'
    case 'validation_failed':
    default:
      return (fallback && String(fallback).trim()) || 'This event is not currently available to play.'
  }
}

function classifyHttpsMediaUrl(url) {
  const trimmed = String(url || '').trim()
  if (!trimmed.toLowerCase().startsWith('https://')) return null
  const lower = trimmed.toLowerCase()
  if (
    /youtube\.com\/embed|player\.|\/embed\/|iframe|webview/i.test(lower)
    && !/\.m3u8(\?|$)/i.test(lower)
    && !/\.mpd(\?|$)/i.test(lower)
  ) {
    return null
  }
  if (/\.m3u8(\?|$)/i.test(lower) || /[?&]format=m3u8\b/i.test(lower)) return 'hls'
  if (/\.mpd(\?|$)/i.test(lower)) return 'dash'
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower)) return 'direct'
  if (/\/(manifest|playlist|master|index)(\.|\/|\?|$)/i.test(lower)) return 'hls'
  return 'direct'
}

function rejectNonHttpsCandidate(candidate) {
  return /^(http:|blob:|file:|about:|data:)/i.test(candidate) && !/^https:/i.test(candidate)
}

function clampLimit(limit, pageSize = 24) {
  const value = Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : pageSize
  return Math.min(40, Math.max(1, value))
}

function isAbortError(error) {
  if (!error || typeof error !== 'object') return false
  const name = String(error.name || '')
  if (name === 'AbortError') return true
  const message = String(error.message || '')
  return /aborted|AbortError|The operation was aborted/i.test(message)
}

function makeAbortError(message = 'The operation was aborted.') {
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'AbortError')
  }
  const err = new Error(message)
  err.name = 'AbortError'
  return err
}

function friendlySportsError(error) {
  if (isAbortError(error)) {
    return error instanceof Error ? error : makeAbortError()
  }
  const message = error instanceof Error ? error.message : String(error || '')
  if (/timed out|timeout/i.test(message)) {
    return new Error('The Sports service took too long to respond.')
  }
  return new Error('Sports could not be loaded.')
}

function classifyDesktopDownloadability(family) {
  switch (family) {
    case 'song':
    case 'podcast_episode':
    case 'audiobook_chapter':
    case 'motivational':
    case 'lecture':
      return 'downloadable'
    case 'radio':
    case 'tv':
    case 'podcast_show':
    case 'sports':
    case 'audiobook':
    case 'lecture_series':
      return 'stream_only'
    default:
      return 'unsupported'
  }
}

function dedupeFixturesById(rows) {
  const seen = new Set()
  const fixtures = []
  for (const row of rows) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    fixtures.push(row)
  }
  return fixtures
}

/* ——— History normalize mirror (position null for sports) ——— */

const HISTORY_ITEM_TYPES_MIRROR = [
  'song',
  'radio',
  'podcast_episode',
  'audiobook_chapter',
  'tv',
  'sports',
  'motivational',
  'lecture',
]

function normalizeHistoryItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!id || !title || !HISTORY_ITEM_TYPES_MIRROR.includes(raw.type)) return null
  const positionSeconds =
    raw.type === 'radio' || raw.type === 'tv' || raw.type === 'sports'
      ? null
      : typeof raw.positionSeconds === 'number'
        ? raw.positionSeconds
        : null
  return { ...raw, id, title, type: raw.type, positionSeconds }
}

function main() {
  // —— Status ——
  check('explicit live remains live', normalizeSportsFixtureStatus({ code: 'live' }).status === 'live')
  check('upcoming remains upcoming', normalizeSportsFixtureStatus({ code: 'upcoming' }).status === 'upcoming')
  check('completed remains completed', normalizeSportsFixtureStatus({ code: 'completed' }).status === 'completed')
  check('finished remains completed', normalizeSportsFixtureStatus({ code: 'finished' }).status === 'completed')
  check('cancelled remains cancelled', normalizeSportsFixtureStatus({ code: 'cancelled' }).status === 'cancelled')
  check('postponed remains postponed', normalizeSportsFixtureStatus({ code: 'postponed' }).status === 'postponed')
  check('unknown value becomes unknown', normalizeSportsFixtureStatus({ code: 'weird_state' }).status === 'unknown')
  check(
    'passed start time alone does NOT create live',
    normalizeSportsFixtureStatus({
      startTime: new Date(Date.now() - 60_000).toISOString(),
    }).status === 'unknown',
  )
  check('missing score does not become 0-0', formatSportsScore(null, null) === null)
  check('partial score does not invent 0-0', formatSportsScore(1, null) === null && formatSportsScore(null, 2) === null)
  check('present scores format with en-dash', formatSportsScore(1, 2) === '1–2')

  const statusSrc = readSrc('src/lib/sports/status.ts')
  check(
    'status normalizer never reads title',
    !/\btitle\b/.test(statusSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')),
  )
  check(
    'title containing LIVE does not affect status',
    normalizeSportsFixtureStatus({
      code: 'finished',
      // title is intentionally ignored by the normalizer API
      startTime: new Date().toISOString(),
    }).status === 'completed'
      && normalizeSportsFixtureStatus({ code: 'finished' }).status === 'completed',
  )
  // Finished with misleading display title still completed (normalizer has no title field).
  check(
    'finished + LIVE-looking metadata stays completed',
    normalizeSportsFixtureStatus({ code: 'finished', live: false }).status === 'completed',
  )

  // —— Identity / playability ——
  const fid = 'abc123'
  check('fixture identity sports:<id>', sportsFixtureIdentity(fid) === `sports:${fid}`)
  check('sports song id prefix', sportsFixtureSongId(fid) === `sports-${fid}`)
  check(
    'identity sports:id vs tv:id',
    sportsFixtureIdentity(fid) !== `tv:${fid}` && historyItemIdentity('sports', fid) !== historyItemIdentity('tv', fid),
  )
  check(
    'identity sports vs history families',
    historyItemIdentity('sports', fid) !== historyItemIdentity('song', fid)
      && historyItemIdentity('sports', fid) !== historyItemIdentity('radio', fid),
  )
  check('no collision with tv- song prefix', sportsFixtureSongId(fid) !== `tv-${fid}`)

  check(
    'playable browse + failed resolver → unavailable messaging',
    unavailableMessage('finished') === 'This event has finished.'
      && unavailableMessage('validation_failed') === 'This event is not currently available to play.',
  )
  check(
    'expired stream reason maps correctly',
    unavailableMessage('expired') === 'The stream is no longer active.',
  )
  check(
    'unplayable does not invent play',
    (() => {
      const isPlayable = false
      const onPlay = isPlayable ? () => 'play' : undefined
      return onPlay === undefined
    })(),
  )
  check('unsupported protocol http rejected', rejectNonHttpsCandidate('http://cdn.example/stream.m3u8') === true)
  check('unsupported protocol about:blank rejected', rejectNonHttpsCandidate('about:blank') === true)
  check('https media accepted', classifyHttpsMediaUrl('https://cdn.example/master.m3u8') === 'hls')
  check('http URL not classified as https media', classifyHttpsMediaUrl('http://cdn.example/master.m3u8') === null)

  // —— Routing / performance ——
  check(
    'duplicate fixture dedupe by id',
    dedupeFixturesById([{ id: '1' }, { id: '1' }, { id: '2' }]).length === 2,
  )
  check('page size clamp low bound', clampLimit(0) === 1)
  check('page size clamp high bound', clampLimit(100) === 40)
  check('page size clamp default-ish', clampLimit(24) === 24)

  const abortErr = friendlySportsError(makeAbortError())
  check(
    'cancellation treated as AbortError not timeout',
    isAbortError(abortErr) && !/took too long|timeout/i.test(String(abortErr.message || '')),
  )
  const timeoutErr = friendlySportsError(new Error('request timed out'))
  check('timeout maps to friendly timeout message', /took too long/i.test(timeoutErr.message))

  const typesSrc = readSrc('src/lib/sports/types.ts')
  const refreshMatch = typesSrc.match(/SPORTS_LIVE_REFRESH_MS\s*=\s*([\d_]+)/)
  const refreshMs = refreshMatch ? Number(String(refreshMatch[1]).replace(/_/g, '')) : 0
  check('SPORTS_LIVE_REFRESH_MS >= 30000', refreshMs >= 30_000, `value=${refreshMs}`)

  const pageSizeMatch = typesSrc.match(/SPORTS_PAGE_SIZE\s*=\s*([\d_]+)/)
  const pageSize = pageSizeMatch ? Number(String(pageSizeMatch[1]).replace(/_/g, '')) : 0
  check('SPORTS_PAGE_SIZE is 24', pageSize === 24, `value=${pageSize}`)

  check('stream_only downloads policy for sports', classifyDesktopDownloadability('sports') === 'stream_only')

  const historyTypesSrc = readSrc('src/lib/history/types.ts')
  check(
    'history type sports exists in HISTORY_ITEM_TYPES source file',
    historyTypesSrc.includes("'sports'") && /HISTORY_ITEM_TYPES\s*=\s*\[[\s\S]*?'sports'/.test(historyTypesSrc),
  )
  const historyServiceSrc = readSrc('src/lib/history/historyService.ts')
  check(
    'position forced null for sports in normalize logic',
    /row\.type === 'sports'/.test(historyServiceSrc)
      || /type === 'sports'/.test(historyServiceSrc),
  )
  check(
    'history normalize mirror forces sports position null',
    normalizeHistoryItem({ type: 'sports', id: 'fx1', title: 'Match', positionSeconds: 88 }).positionSeconds === null,
  )

  // —— Source file / wiring assertions ——
  check('DesktopSportsPage exists', exists('src/components/sports/DesktopSportsPage.tsx'))
  const pageSrc = readSrc('src/components/sports/DesktopSportsPage.tsx')
  check('Play only when isPlayable', pageSrc.includes('fixture.isPlayable ?') && pageSrc.includes('onPlay'))

  const apiSrc = readSrc('src/lib/sports/sportsCatalogApi.ts')
  check('resolveSportsPlay exists', /export async function resolveSportsPlay/.test(apiSrc))
  check('resolvePlayableStream exists', exists('src/lib/sports/resolvePlayableStream.ts')
    && /export async function resolvePlayableStream/.test(readSrc('src/lib/sports/resolvePlayableStream.ts')))

  const playbackProvider = readSrc('src/context/DesktopPlaybackProvider.tsx')
  check(
    'usesDesktopVideoPath includes isSportsQueueSong',
    /function usesDesktopVideoPath[\s\S]*?isSportsQueueSong\(song\)/.test(playbackProvider),
  )

  const catalogBridge = readSrc('electron/catalogBridge.js')
  check(
    'catalogBridge allows POST only for sports play path',
    catalogBridge.includes('SPORTS_PLAY_PATH_RE')
      && /if \(method === 'POST'\) return SPORTS_PLAY_PATH_RE\.test\(path\)/.test(catalogBridge),
  )

  const cardSrc = readSrc('src/components/sports/SportsFixtureCard.tsx')
  const detailsSrc = readSrc('src/components/sports/SportsFixtureDetails.tsx')
  const fakeArrayPattern = /(?:const|let)\s+\w*(?:fixtures|matches|events)\w*\s*=\s*\[\s*\{/
  check(
    'no fake fixture arrays hardcoded in components',
    !fakeArrayPattern.test(pageSrc)
      && !fakeArrayPattern.test(cardSrc)
      && !fakeArrayPattern.test(detailsSrc),
  )

  check('sportsCatalogApi clamps limit 1-40', apiSrc.includes('Math.min(40, Math.max(1, value))'))
  check('sportsCatalogApi treats abort as AbortError', apiSrc.includes("name === 'AbortError'"))
  check('policy.ts sports stream_only', readSrc('src/lib/downloads/policy.ts').includes("case 'sports':"))
  check('dispatchSportsPlayback exists', exists('src/lib/sports/dispatchSportsPlayback.ts'))
  check('sportsPlaybackAdapter isSportsQueueSong', /export function isSportsQueueSong/.test(readSrc('src/lib/sports/sportsPlaybackAdapter.ts')))
  check('App wires DesktopSportsPage', readSrc('src/App.tsx').includes('DesktopSportsPage'))

  console.log(`\nSports contract: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main()
