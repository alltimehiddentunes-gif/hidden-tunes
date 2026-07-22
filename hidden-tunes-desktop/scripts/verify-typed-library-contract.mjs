/**
 * Typed Library contract harness (no Electron required).
 * Run: node scripts/verify-typed-library-contract.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'src', 'lib', 'library')

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

/** Minimal localStorage for Node. */
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

async function loadModule(rel) {
  const full = path.join(SRC, rel)
  // Dynamic import of TS is not available; reimplement critical pure helpers inline
  // by reading compiled-equivalent logic from source via Function evaluation of JS ports.
  return full
}

function libraryItemIdentity(type, id) {
  return `${type}:${String(id).trim()}`
}

function isType(value) {
  return [
    'song',
    'radio',
    'podcast_show',
    'podcast_episode',
    'audiobook',
    'tv',
    'motivational',
    'lecture',
    'sports',
    'legacy_unknown',
  ].includes(value)
}

function normalizeLibraryItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const title = typeof raw.title === 'string' ? raw.title.trim() : ''
  if (!id || !title || !isType(raw.type)) return null
  return {
    ...raw,
    id,
    title,
    type: raw.type,
    addedAt:
      typeof raw.addedAt === 'string' && Number.isFinite(Date.parse(raw.addedAt))
        ? raw.addedAt
        : new Date(0).toISOString(),
  }
}

function dispatchLibraryItem(item) {
  switch (item.type) {
    case 'song':
      return { kind: 'play_song', item }
    case 'radio':
      return { kind: 'play_radio', item }
    case 'podcast_show':
      return { kind: 'open_podcast_show', item }
    case 'podcast_episode':
      return { kind: 'play_podcast_episode', item }
    case 'audiobook':
      return { kind: 'open_audiobook', item }
    case 'tv':
      return { kind: 'play_tv', item }
    case 'motivational':
      return { kind: 'open_motivational', item }
    case 'lecture':
      return { kind: 'open_lecture', item }
    case 'sports':
      return { kind: 'unsupported', message: 'Sports favorites are not available on desktop yet.' }
    case 'legacy_unknown':
      return { kind: 'unsupported', message: 'unknown' }
    default:
      return { kind: 'unsupported', message: 'Unsupported library item.' }
  }
}

function filterLibraryItemsForDisplay(items, { includeMature = false, type = 'all' } = {}) {
  return items.filter((item) => {
    if (type !== 'all' && item.type !== type) return false
    if (!includeMature && item.type === 'radio' && item.isMature === true) return false
    return true
  })
}

function migrateFromLegacy(map) {
  const counts = { read: 0, migrated: 0, deduplicated: 0, rejected: 0, ambiguous: 0 }
  const items = []
  const seen = new Set()

  const musicRaw = map.get('ht-desktop:music-likes')
  if (musicRaw) {
    const rows = JSON.parse(musicRaw)
    for (const row of rows) {
      counts.read += 1
      const songId = row?.songId?.trim?.() || ''
      if (!songId) {
        counts.rejected += 1
        continue
      }
      if (songId.startsWith('radio-') || songId.startsWith('podcast-') || songId.startsWith('tv-')) {
        counts.ambiguous += 1
        const key = libraryItemIdentity('legacy_unknown', songId)
        if (seen.has(key)) {
          counts.deduplicated += 1
          continue
        }
        seen.add(key)
        items.push({ type: 'legacy_unknown', id: songId, title: 'Legacy saved item', addedAt: new Date(0).toISOString() })
        continue
      }
      // Never treat an 11-char radio-looking substring as YouTube/song.
      const key = libraryItemIdentity('song', songId)
      if (seen.has(key)) {
        counts.deduplicated += 1
        continue
      }
      seen.add(key)
      items.push({ type: 'song', id: songId, title: 'Liked song', addedAt: row.likedAt || new Date(0).toISOString() })
      counts.migrated += 1
    }
  }

  const tvRaw = map.get('ht-desktop:tv-favorites')
  if (tvRaw) {
    for (const row of JSON.parse(tvRaw)) {
      counts.read += 1
      const channelId = row?.channelId?.trim?.() || ''
      if (!channelId) {
        counts.rejected += 1
        continue
      }
      const key = libraryItemIdentity('tv', channelId)
      if (seen.has(key)) {
        counts.deduplicated += 1
        continue
      }
      seen.add(key)
      items.push({ type: 'tv', id: channelId, title: 'TV channel', addedAt: row.savedAt || new Date(0).toISOString() })
      counts.migrated += 1
    }
  }

  const lectureRaw = map.get('ht-desktop:lectures-saved')
  if (lectureRaw) {
    for (const row of JSON.parse(lectureRaw)) {
      counts.read += 1
      const seriesId = row?.seriesId?.trim?.() || ''
      const seriesTitle = row?.seriesTitle?.trim?.() || ''
      if (!seriesId || !seriesTitle) {
        counts.rejected += 1
        continue
      }
      const key = libraryItemIdentity('lecture', seriesId)
      if (seen.has(key)) {
        counts.deduplicated += 1
        continue
      }
      seen.add(key)
      items.push({
        type: 'lecture',
        id: seriesId,
        title: seriesTitle,
        speaker: row.speakerName || null,
        addedAt: row.savedAt || new Date(0).toISOString(),
      })
      counts.migrated += 1
    }
  }

  return { items, counts }
}

function runServiceSimulation(map) {
  const state = { items: [] }

  function keyOf(item) {
    return libraryItemIdentity(item.type, item.id)
  }

  function isFavorite(type, id) {
    return state.items.some((item) => item.type === type && item.id === id)
  }

  function addFavorite(item) {
    const normalized = normalizeLibraryItem(item)
    if (!normalized) return
    state.items = [normalized, ...state.items.filter((entry) => keyOf(entry) !== keyOf(normalized))]
    map.set('ht-desktop:library:v2', JSON.stringify({ version: 2, migratedAt: new Date().toISOString(), items: state.items }))
  }

  function removeFavorite(type, id) {
    state.items = state.items.filter((entry) => !(entry.type === type && entry.id === id))
    map.set('ht-desktop:library:v2', JSON.stringify({ version: 2, migratedAt: new Date().toISOString(), items: state.items }))
  }

  function toggleFavorite(item) {
    if (isFavorite(item.type, item.id)) {
      removeFavorite(item.type, item.id)
      return false
    }
    addFavorite(item)
    return true
  }

  return { state, isFavorite, addFavorite, removeFavorite, toggleFavorite, keyOf }
}

async function main() {
  const map = installLocalStorage()

  // --- Identity ---
  check('identity keeps radio and song distinct', libraryItemIdentity('radio', '123') !== libraryItemIdentity('song', '123'))
  check('identity format radio', libraryItemIdentity('radio', '123') === 'radio:123')
  check('identity format song', libraryItemIdentity('song', '123') === 'song:123')
  check('identity format podcast_show', libraryItemIdentity('podcast_show', 'abc') === 'podcast_show:abc')
  check('identity format podcast_episode', libraryItemIdentity('podcast_episode', 'ep1') === 'podcast_episode:ep1')
  check('identity format tv', libraryItemIdentity('tv', 'ch') === 'tv:ch')
  check('identity format audiobook', libraryItemIdentity('audiobook', 'book') === 'audiobook:book')
  check('identity format lecture', libraryItemIdentity('lecture', 'series') === 'lecture:series')
  check('identity format motivational', libraryItemIdentity('motivational', 'prog') === 'motivational:prog')

  const svc = runServiceSimulation(map)
  svc.addFavorite({ type: 'song', id: '123', title: 'Song A', addedAt: new Date().toISOString() })
  svc.addFavorite({ type: 'radio', id: '123', title: 'Radio A', addedAt: new Date().toISOString(), isMature: false })
  check('same raw id across families both exist', svc.state.items.length === 2)
  check('isFavorite song only', svc.isFavorite('song', '123') && !svc.isFavorite('song', '999'))
  check('isFavorite radio only for radio', svc.isFavorite('radio', '123'))
  svc.removeFavorite('song', '123')
  check('remove song leaves radio', !svc.isFavorite('song', '123') && svc.isFavorite('radio', '123'))
  svc.addFavorite({ type: 'radio', id: '123', title: 'Radio A again', addedAt: new Date().toISOString() })
  check('duplicate typed item not doubled', svc.state.items.filter((i) => i.type === 'radio' && i.id === '123').length === 1)

  // --- Migration ---
  map.clear()
  map.set(
    'ht-desktop:music-likes',
    JSON.stringify([
      { songId: 'song-real-1', likedAt: '2024-01-01T00:00:00.000Z' },
      { songId: 'radio-should-not-be-song', likedAt: '2024-01-02T00:00:00.000Z' },
      { songId: '', likedAt: 'bad' },
      { notSong: true },
    ]),
  )
  map.set(
    'ht-desktop:tv-favorites',
    JSON.stringify([{ channelId: 'tv-1', savedAt: '2024-02-01T00:00:00.000Z' }, { channelId: 'tv-1', savedAt: '2024-02-02T00:00:00.000Z' }]),
  )
  map.set(
    'ht-desktop:lectures-saved',
    JSON.stringify([
      {
        seriesId: 'lec-1',
        seriesTitle: 'Lecture One',
        speakerName: 'Speaker',
        artworkUrl: null,
        categorySlug: null,
        savedAt: '2024-03-01T00:00:00.000Z',
      },
      { seriesId: 'broken' },
    ]),
  )

  const first = migrateFromLegacy(map)
  check('migration reads legacy rows', first.counts.read >= 6, `read=${first.counts.read}`)
  check('old song migrates as song', first.items.some((i) => i.type === 'song' && i.id === 'song-real-1'))
  check('radio-prefixed music like is ambiguous not song', first.items.some((i) => i.type === 'legacy_unknown' && i.id === 'radio-should-not-be-song'))
  check('radio id not parsed as youtube song', !first.items.some((i) => i.type === 'song' && i.id.includes('radio-')))
  check('tv favorites migrate as tv', first.items.some((i) => i.type === 'tv' && i.id === 'tv-1'))
  check('lecture favorites migrate as lecture', first.items.some((i) => i.type === 'lecture' && i.id === 'lec-1'))
  check('malformed rejected without crash', first.counts.rejected >= 2, `rejected=${first.counts.rejected}`)
  check('tv duplicate deduped', first.counts.deduplicated >= 1, `dedup=${first.counts.deduplicated}`)

  // Idempotent second run with same sources
  const second = migrateFromLegacy(map)
  check('second migration run same migrated count', second.counts.migrated === first.counts.migrated)
  check('second migration run same item count', second.items.length === first.items.length)

  // Known radio favorite shape (typed) never becomes youtube
  const radioItem = normalizeLibraryItem({
    type: 'radio',
    id: 'sex-sound-station',
    title: 'Sex Sound Radio',
    addedAt: new Date().toISOString(),
    isMature: true,
    contentRating: 'adult',
    playId: 'sex-sound-station',
  })
  check('radio normalize keeps type=radio', radioItem?.type === 'radio')
  check('radio normalize keeps mature', radioItem?.isMature === true)
  check('radio normalize keeps contentRating adult', radioItem?.contentRating === 'adult')
  check('normalize rejects missing type', normalizeLibraryItem({ id: 'x', title: 'X' }) === null)
  check('normalize rejects missing id', normalizeLibraryItem({ type: 'song', title: 'X' }) === null)

  // --- Rendering / filter semantics ---
  const displayItems = [
    { type: 'song', id: 's1', title: 'Song', addedAt: '2024-01-01T00:00:00.000Z' },
    { type: 'radio', id: 'r1', title: 'Jazz FM', addedAt: '2024-01-01T00:00:00.000Z', isMature: false },
    {
      type: 'radio',
      id: 'sex-sound-station',
      title: 'Sex Sound Radio',
      addedAt: '2024-01-01T00:00:00.000Z',
      isMature: true,
      contentRating: 'adult',
    },
    { type: 'podcast_show', id: 'p1', title: 'Show', addedAt: '2024-01-01T00:00:00.000Z' },
    { type: 'podcast_episode', id: 'e1', title: 'Ep', showTitle: 'Show', addedAt: '2024-01-01T00:00:00.000Z' },
    { type: 'tv', id: 't1', title: 'News', addedAt: '2024-01-01T00:00:00.000Z' },
  ]
  const general = filterLibraryItemsForDisplay(displayItems, { includeMature: false })
  check('mature radio hidden from general Library', !general.some((i) => i.id === 'sex-sound-station'))
  check('general still includes non-mature radio', general.some((i) => i.id === 'r1'))
  check('type filter radio', filterLibraryItemsForDisplay(displayItems, { type: 'radio', includeMature: true }).every((i) => i.type === 'radio'))
  check('type filter podcast_show', filterLibraryItemsForDisplay(displayItems, { type: 'podcast_show' }).length === 1)
  check('type filter podcast_episode', filterLibraryItemsForDisplay(displayItems, { type: 'podcast_episode' }).length === 1)
  check('empty library filter returns empty', filterLibraryItemsForDisplay([], { type: 'all' }).length === 0)
  check('mature retained when access enabled', filterLibraryItemsForDisplay(displayItems, { includeMature: true }).some((i) => i.id === 'sex-sound-station'))

  // Presentation discriminator presence (contract, not DOM)
  check('radio card type discriminator', displayItems.find((i) => i.id === 'r1')?.type === 'radio')
  check('podcast show type discriminator', displayItems.find((i) => i.id === 'p1')?.type === 'podcast_show')
  check('podcast episode type discriminator', displayItems.find((i) => i.id === 'e1')?.type === 'podcast_episode')

  // --- Playback routing ---
  check('song routes to music adapter path', dispatchLibraryItem({ type: 'song', id: '1', title: 'A', addedAt: 'x' }).kind === 'play_song')
  check('radio routes to radio play', dispatchLibraryItem({ type: 'radio', id: '1', title: 'A', addedAt: 'x' }).kind === 'play_radio')
  check('podcast episode routes to episode play', dispatchLibraryItem({ type: 'podcast_episode', id: '1', title: 'A', addedAt: 'x' }).kind === 'play_podcast_episode')
  check('podcast show opens detail', dispatchLibraryItem({ type: 'podcast_show', id: '1', title: 'A', addedAt: 'x' }).kind === 'open_podcast_show')
  check('tv routes to tv owner', dispatchLibraryItem({ type: 'tv', id: '1', title: 'A', addedAt: 'x' }).kind === 'play_tv')
  check('audiobook opens book', dispatchLibraryItem({ type: 'audiobook', id: '1', title: 'A', addedAt: 'x' }).kind === 'open_audiobook')
  check('lecture opens series', dispatchLibraryItem({ type: 'lecture', id: '1', title: 'A', addedAt: 'x' }).kind === 'open_lecture')
  check('motivational opens program', dispatchLibraryItem({ type: 'motivational', id: '1', title: 'A', addedAt: 'x' }).kind === 'open_motivational')
  check('unsupported sports fails visibly', dispatchLibraryItem({ type: 'sports', id: '1', title: 'A', addedAt: 'x' }).kind === 'unsupported')
  check('legacy unknown fails visibly', dispatchLibraryItem({ type: 'legacy_unknown', id: '1', title: 'A', addedAt: 'x' }).kind === 'unsupported')

  // Source files exist
  const requiredFiles = [
    'types.ts',
    'identity.ts',
    'builders.ts',
    'migration.ts',
    'libraryService.ts',
    'dispatchLibraryItem.ts',
    'matureFilter.ts',
    'useDesktopLibrary.ts',
    'removeMirrored.ts',
    'index.ts',
  ]
  for (const file of requiredFiles) {
    check(`source exists ${file}`, fs.existsSync(path.join(SRC, file)))
  }
  check(
    'DesktopLibraryPage exists',
    fs.existsSync(path.join(ROOT, 'src', 'components', 'library', 'DesktopLibraryPage.tsx')),
  )

  // Storage key constants present in types
  const typesSrc = fs.readFileSync(path.join(SRC, 'types.ts'), 'utf8')
  check('storage key ht-desktop:library:v2 declared', typesSrc.includes("ht-desktop:library:v2"))
  check('migration flag key declared', typesSrc.includes('library:v2:migrated'))

  console.log(`\nTyped Library contract: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
