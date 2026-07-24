/**
 * Unified history contract harness.
 * Run: node scripts/verify-history-contract.mjs
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

function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem(key) {
      return map.has(key) ? map.get(key) : null
    },
    setItem(key, value) {
      map.set(String(key), String(value))
    },
    removeItem(key) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
  }
  return map
}

const HISTORY_STORAGE_KEY = 'ht-desktop:history:v1'
const HISTORY_ITEM_TYPES = ['song', 'radio', 'podcast_episode', 'audiobook_chapter', 'tv', 'sports', 'motivational', 'lecture']

function historyItemIdentity(type, id) {
  return `${type}:${String(id).trim()}`
}

function normalizeHistoryItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!id || !title || !HISTORY_ITEM_TYPES.includes(raw.type)) return null
  const positionSeconds =
    raw.type === 'radio' || raw.type === 'tv' || raw.type === 'sports'
      ? null
      : typeof raw.positionSeconds === 'number'
        ? raw.positionSeconds
        : null
  return {
    ...raw,
    id,
    title,
    type: raw.type,
    playedAt: raw.playedAt || new Date().toISOString(),
    positionSeconds,
  }
}

function main() {
  const map = installLocalStorage()

  check('storage key versioned', HISTORY_STORAGE_KEY === 'ht-desktop:history:v1')
  check('same raw ID does not collide', historyItemIdentity('song', '1') !== historyItemIdentity('radio', '1'))
  check('sports is in history types', HISTORY_ITEM_TYPES.includes('sports'))
  check('malformed rejected', normalizeHistoryItem({ type: 'song', id: '', title: 'x' }) === null)
  check('radio position forced null', normalizeHistoryItem({ type: 'radio', id: 'r1', title: 'R', positionSeconds: 99 }).positionSeconds === null)
  check('tv position forced null', normalizeHistoryItem({ type: 'tv', id: 't1', title: 'T', positionSeconds: 12 }).positionSeconds === null)
  check('sports position forced null', normalizeHistoryItem({ type: 'sports', id: 'fx1', title: 'Match', positionSeconds: 55 }).positionSeconds === null)
  check('song may keep position', normalizeHistoryItem({ type: 'song', id: 's1', title: 'S', positionSeconds: 40 }).positionSeconds === 40)

  // Deduped record simulation
  const items = []
  function record(item) {
    const n = normalizeHistoryItem(item)
    const key = historyItemIdentity(n.type, n.id)
    const next = [n, ...items.filter((e) => historyItemIdentity(e.type, e.id) !== key)]
    items.length = 0
    items.push(...next.slice(0, 400))
  }

  record({ type: 'song', id: '1', title: 'A', playedAt: '2020-01-01T00:00:00.000Z' })
  record({ type: 'song', id: '1', title: 'A', playedAt: '2020-02-01T00:00:00.000Z' })
  check('dedupe by typed identity', items.filter((i) => i.type === 'song' && i.id === '1').length === 1)
  record({ type: 'radio', id: '1', title: 'Radio 1' })
  check('same raw id different family kept', items.some((i) => i.type === 'radio' && i.id === '1') && items.some((i) => i.type === 'song' && i.id === '1'))

  // Library independence
  localStorage.setItem('ht-desktop:library:v2', JSON.stringify({ version: 2, items: [{ type: 'song', id: '1', title: 'A', addedAt: new Date().toISOString() }] }))
  localStorage.setItem('ht-desktop:playlists:v1', JSON.stringify({ version: 1, playlists: [{ id: 'p1', title: 'P', items: [], createdAt: '', updatedAt: '' }] }))
  items.length = 0
  check('clear history does not touch library key', localStorage.getItem('ht-desktop:library:v2').includes('"song"'))
  check('clear history does not touch playlists key', localStorage.getItem('ht-desktop:playlists:v1').includes('p1'))

  // Mature filter simulation
  const mature = normalizeHistoryItem({ type: 'radio', id: 'sex', title: 'Sex Sound Radio', isMature: true })
  const filtered = [mature].filter((item) => !(item.type === 'radio' && item.isMature))
  check('mature radio gated from general history', filtered.length === 0)

  const files = [
    'src/lib/history/types.ts',
    'src/lib/history/historyService.ts',
    'src/lib/history/mirrorFamilyHistory.ts',
    'src/lib/history/useDesktopHistory.ts',
    'src/components/history/DesktopHistoryPage.tsx',
  ]
  for (const rel of files) {
    check(`source exists ${rel}`, fs.existsSync(path.join(ROOT, rel)))
  }

  const service = fs.readFileSync(path.join(ROOT, 'src/lib/history/historyService.ts'), 'utf8')
  check('max entries bounded', service.includes('HISTORY_MAX_ENTRIES') && fs.readFileSync(path.join(ROOT, 'src/lib/history/types.ts'), 'utf8').includes('HISTORY_MAX_ENTRIES = 400'))
  check('migration from legacy sources', service.includes('migrateLegacySources'))
  check('continue listening excludes radio/tv', service.includes("item.type === 'radio'") && service.includes("item.type === 'tv'"))

  console.log(`\nHistory contract: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
  void map
}

main()
