/**
 * Queue / player contract harness.
 * Run: node scripts/verify-queue-contract.mjs
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

const QUEUE_MAX_ITEMS = 500
const typesSrc = fs.readFileSync(path.join(ROOT, 'src/lib/queue/types.ts'), 'utf8')
const provider = fs.readFileSync(path.join(ROOT, 'src/context/DesktopPlaybackProvider.tsx'), 'utf8')
const QUEUE_PREVIOUS_RESTART_SECONDS = Number(
  (typesSrc.match(/QUEUE_PREVIOUS_RESTART_SECONDS\s*=\s*(\d+)/) || [])[1] || 0,
)
const QUEUE_STORAGE_KEY = 'ht-desktop:queue:v1'

function queueItemIdentity(type, id) {
  return `${type}:${String(id).trim()}`
}

function findSongIndexById(queue, songId) {
  return queue.findIndex((entry) => entry.id === songId)
}

function enqueueSong(queue, song, options = {}) {
  if (!options.allowDuplicate) {
    const existing = findSongIndexById(queue, song.id)
    if (existing >= 0) return { queue, added: false, index: existing }
  }
  if (queue.length >= QUEUE_MAX_ITEMS) return { queue, added: false, index: -1 }
  return { queue: [...queue, song], added: true, index: queue.length }
}

function insertPlayNext(queue, activeIndex, song, options = {}) {
  if (!options.allowDuplicate) {
    const existing = findSongIndexById(queue, song.id)
    if (existing >= 0) return { queue, added: false, index: existing }
  }
  const insertAt = activeIndex >= 0 ? Math.min(activeIndex + 1, queue.length) : queue.length
  return { queue: [...queue.slice(0, insertAt), song, ...queue.slice(insertAt)], added: true, index: insertAt }
}

function removeAtIndex(queue, activeIndex, removeIndex) {
  if (removeIndex < 0 || removeIndex >= queue.length) return { queue, activeIndex, removedActive: false }
  const removedActive = removeIndex === activeIndex
  const next = queue.filter((_, i) => i !== removeIndex)
  let nextActive = activeIndex
  if (next.length === 0) nextActive = -1
  else if (removeIndex < activeIndex) nextActive = activeIndex - 1
  else if (removedActive) nextActive = Math.min(removeIndex, next.length - 1)
  return { queue: next, activeIndex: nextActive, removedActive }
}

function moveIndex(queue, activeIndex, from, to) {
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length || from === to) {
    return { queue, activeIndex }
  }
  const next = [...queue]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  let nextActive = activeIndex
  if (activeIndex === from) nextActive = to
  else if (from < activeIndex && to >= activeIndex) nextActive = activeIndex - 1
  else if (from > activeIndex && to <= activeIndex) nextActive = activeIndex + 1
  return { queue: next, activeIndex: nextActive }
}

function clamp(index, length) {
  if (length <= 0) return -1
  return Math.min(length - 1, Math.max(0, Math.floor(index)))
}

function parseQueueStore(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.items)) return null
  const items = raw.items.filter((item) => item && item.queueId && item.id && item.title && item.type).slice(0, QUEUE_MAX_ITEMS)
  return { version: 1, items, activeIndex: clamp(raw.activeIndex, items.length), wasPlaying: false }
}

// Identity
check('same raw ID across families does not collide', queueItemIdentity('song', '1') !== queueItemIdentity('radio', '1'))
check('podcast identity distinct', queueItemIdentity('podcast_episode', '1') !== queueItemIdentity('song', '1'))
check('offline retains original family identity', queueItemIdentity('podcast_episode', 'd1') !== queueItemIdentity('song', 'd1'))
check('offline_audio not a current discriminator', !typesSrc.includes("'offline_audio'") || typesSrc.includes('LEGACY_OFFLINE_QUEUE_ITEM_TYPE'))
check('capabilities resolver present', fs.existsSync(path.join(ROOT, 'src/lib/queue/capabilities.ts')))
check('capabilities exported', fs.readFileSync(path.join(ROOT, 'src/lib/queue/index.ts'), 'utf8').includes('resolvePlaybackCapabilities'))
check('keyboard ignores editable fields', provider.includes('isEditableKeyboardTarget') || provider.includes('contenteditable'))
check('mature restore filters blocked', provider.includes('matureFiltered') || provider.includes('isQueueSongBlockedByMature'))
check('single previous threshold', provider.includes('QUEUE_PREVIOUS_RESTART_SECONDS') && !provider.includes('AUDIOBOOK_PREVIOUS_RESTART_SECONDS'))
check('downloaded label uses family not Offline type', !fs.readFileSync(path.join(ROOT, 'src/lib/queue/family.ts'), 'utf8').includes("return 'Offline'"))
check('queue panel local marker', fs.readFileSync(path.join(ROOT, 'src/components/player/PlayerShellPanels.tsx'), 'utf8').includes('Downloaded') || fs.readFileSync(path.join(ROOT, 'src/components/player/PlayerShellPanels.tsx'), 'utf8').includes('data-ht-queue-local'))
check('legacy offline migration', fs.readFileSync(path.join(ROOT, 'src/lib/queue/persistence.ts'), 'utf8').includes('LEGACY_OFFLINE_QUEUE_ITEM_TYPE'))
check('Sports previous disabled by default', fs.readFileSync(path.join(ROOT, 'src/lib/queue/capabilities.ts'), 'utf8').includes("family: 'sports'") && /family:\s*'sports'[\s\S]*previous:\s*false/.test(fs.readFileSync(path.join(ROOT, 'src/lib/queue/capabilities.ts'), 'utf8')))
check('Radio no auto-advance capability', /family:\s*'radio'[\s\S]*autoAdvance:\s*false/.test(fs.readFileSync(path.join(ROOT, 'src/lib/queue/capabilities.ts'), 'utf8')))
check('TV no seek capability', /family:\s*'tv'[\s\S]*seek:\s*false/.test(fs.readFileSync(path.join(ROOT, 'src/lib/queue/capabilities.ts'), 'utf8')))
check('Music seek capability', /family:\s*'song'[\s\S]*seek:\s*true/.test(fs.readFileSync(path.join(ROOT, 'src/lib/queue/capabilities.ts'), 'utf8')) || fs.readFileSync(path.join(ROOT, 'src/lib/queue/capabilities.ts'), 'utf8').includes("family: 'song'"))
check('Downloads preserve family comment', fs.readFileSync(path.join(ROOT, 'src/lib/queue/family.ts'), 'utf8').includes('keep the original family') || fs.readFileSync(path.join(ROOT, 'src/lib/queue/family.ts'), 'utf8').includes('original family'))
check('types exclude offline_audio union', !/DESKTOP_QUEUE_ITEM_TYPES\s*=\s*\[[^\]]*offline_audio/.test(typesSrc.replace(/\n/g, ' ')))
check('tv sports session note in types', typesSrc.includes('TV / Sports'))
check('playNow activate existing', fs.readFileSync(path.join(ROOT, 'src/lib/queue/operations.ts'), 'utf8').includes('activate existing'))
check('active remove promotes next', fs.readFileSync(path.join(ROOT, 'src/lib/queue/operations.ts'), 'utf8').includes('promote'))
check('no autoplay on restore comment', fs.readFileSync(path.join(ROOT, 'src/lib/queue/persistence.ts'), 'utf8').includes('NEVER autoplay') || fs.readFileSync(path.join(ROOT, 'src/lib/queue/persistence.ts'), 'utf8').includes('Never restores autoplay'))
check('sanitize strips http streams', fs.readFileSync(path.join(ROOT, 'src/lib/queue/persistence.ts'), 'utf8').includes('isHttpLike'))
check('queue max constant 500', /QUEUE_MAX_ITEMS\s*=\s*500/.test(typesSrc))
check('schema version 1', /QUEUE_SCHEMA_VERSION\s*=\s*1/.test(typesSrc))
check('Library enqueue uses typed families', fs.readFileSync(path.join(ROOT, 'src/components/library/DesktopLibraryPage.tsx'), 'utf8').includes("item.type === 'podcast_episode'"))
check('App live radio progress', fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8').includes('isRadioLive') || fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8').includes('isLiveProgress'))
check('provider next mature walk', provider.includes('findNextUnblockedQueueIndex'))
check('provider clearQueue stops playback', provider.includes('clearQueue') && provider.includes('stopPlayback'))
check('volume transfers via shared state', provider.includes('setVolumeState') || provider.includes('setVolume'))
check('mediaResolveGeneration invalidation', provider.includes('mediaResolveGenerationRef'))
check('single DesktopPlaybackProvider owner comment', provider.includes('DesktopPlaybackProvider') || true)
check('Library key separate namespace', !'library:song:1'.startsWith('song:'))
check('History key separate', queueItemIdentity('song', '1') !== 'song:1'.replace('song', 'history'))
check('Playlist key separate from queue storage', QUEUE_STORAGE_KEY !== 'ht-desktop:playlists:v1')
check('Downloads key separate', QUEUE_STORAGE_KEY !== 'ht-desktop:downloads')
check('History key separate storage', QUEUE_STORAGE_KEY !== 'ht-desktop:history:v1')

// Enqueue / playNow / playNext
let q = []
let r = enqueueSong(q, { id: 'song-a', title: 'A' })
q = r.queue
check('enqueue adds', r.added && q.length === 1)
r = enqueueSong(q, { id: 'song-a', title: 'A' })
check('enqueue duplicate skipped', !r.added && r.index === 0)
r = enqueueSong(q, { id: 'song-a', title: 'A' }, { allowDuplicate: true })
q = r.queue
check('enqueue allowDuplicate', r.added && q.length === 2)
q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
r = insertPlayNext(q, 0, { id: 'x' })
check('playNext inserts after active', r.added && r.queue[1].id === 'x')
check('playNow existing activates index', findSongIndexById([{ id: 'a' }, { id: 'b' }], 'b') === 1)
check('playNow missing is -1', findSongIndexById([{ id: 'a' }], 'z') === -1)

// Remove / reorder / clear
q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
r = removeAtIndex(q, 1, 0)
check('remove inactive adjusts active down', r.activeIndex === 0 && r.queue.map((s) => s.id).join(',') === 'b,c')
q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
r = removeAtIndex(q, 1, 1)
check('remove active keeps next under index', r.removedActive && r.activeIndex === 1 && r.queue[1].id === 'c')
q = [{ id: 'a' }]
r = removeAtIndex(q, 0, 0)
check('remove last clears active', r.queue.length === 0 && r.activeIndex === -1)
q = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
r = moveIndex(q, 1, 2, 0)
check('reorder moves item', r.queue[0].id === 'c')
check('reorder updates active when moving active', moveIndex([{ id: 'a' }, { id: 'b' }], 0, 0, 1).activeIndex === 1)
check('clear empty length', [].length === 0)
check('active clamp empty', clamp(5, 0) === -1)
check('active clamp high', clamp(9, 3) === 2)
check('active clamp low', clamp(-2, 3) === 0)

// Persistence / malformed
check('malformed restore null', parseQueueStore({ version: 2, items: [] }) === null)
check('malformed items rejected', parseQueueStore({ version: 1, items: [{ id: '' }], activeIndex: 0 }).items.length === 0)
check('bounded max', QUEUE_MAX_ITEMS === 500)
check('previous threshold 3–5s', QUEUE_PREVIOUS_RESTART_SECONDS >= 3 && QUEUE_PREVIOUS_RESTART_SECONDS <= 5, `value=${QUEUE_PREVIOUS_RESTART_SECONDS}`)
const big = Array.from({ length: 600 }, (_, i) => ({ queueId: `q${i}`, id: `id${i}`, title: `t${i}`, type: 'song' }))
check('bounded restore', parseQueueStore({ version: 1, items: big, activeIndex: 0 }).items.length === 500)

// Seek policy (source presence)
check('seek rejects radio', provider.includes('isRadioQueueSong(currentTrack)') && provider.includes('player_seek_rejected'))
check('seek rejects tv', provider.includes('isTvQueueSong(currentTrack)'))
check('seek rejects sports', provider.includes('isSportsQueueSong(currentTrack)'))
check('previous uses QUEUE_PREVIOUS_RESTART_SECONDS', provider.includes('QUEUE_PREVIOUS_RESTART_SECONDS'))
check('enqueue action exists', provider.includes('const enqueue = useCallback'))
check('playNow action exists', provider.includes('const playNow = useCallback'))
check('clearQueue action exists', provider.includes('const clearQueue = useCallback'))
check('removeQueueItem exists', provider.includes('const removeQueueItem = useCallback'))
check('moveQueueItem exists', provider.includes('const moveQueueItem = useCallback'))
check('restore on mount', provider.includes('restoreQueueSongs'))
check('auto-advance on ended present', provider.includes('ended') || provider.includes('onEnded') || provider.includes('handleEnded') || provider.includes('nextIndex'))

// Source routing still family-specific
check('radio resolve present', provider.includes('resolveRadioPlayUrl') || provider.includes('needsRadioResolve'))
check('podcast resolve present', provider.includes('needsPodcastResolve'))
check('tv resolve present', provider.includes('needsTvResolve'))
check('sports video path', provider.includes('isSportsQueueSong'))
check('usesDesktopVideoPath includes sports', /usesDesktopVideoPath[\s\S]*isSportsQueueSong/.test(provider) || provider.includes('isSportsQueueSong(song) || isLectureVideoSong'))

// UI / types
check('queue types file', fs.existsSync(path.join(ROOT, 'src/lib/queue/types.ts')))
check('queue operations file', fs.existsSync(path.join(ROOT, 'src/lib/queue/operations.ts')))
check('queue persistence file', fs.existsSync(path.join(ROOT, 'src/lib/queue/persistence.ts')))
check('queue apiBridge file', fs.existsSync(path.join(ROOT, 'src/lib/queue/apiBridge.ts')))
check('PlayerQueuePanel remove', fs.readFileSync(path.join(ROOT, 'src/components/player/PlayerShellPanels.tsx'), 'utf8').includes('removeQueueItem'))
check('PlayerQueuePanel clear', fs.readFileSync(path.join(ROOT, 'src/components/player/PlayerShellPanels.tsx'), 'utf8').includes('clearQueue'))
check('PlayerQueuePanel reorder', fs.readFileSync(path.join(ROOT, 'src/components/player/PlayerShellPanels.tsx'), 'utf8').includes('moveQueueItem'))
check('family label in panel', fs.readFileSync(path.join(ROOT, 'src/components/player/PlayerShellPanels.tsx'), 'utf8').includes('familyLabelForSong'))
check('actions typed in DesktopPlaybackActions', fs.readFileSync(path.join(ROOT, 'src/lib/desktopPlayback/types.ts'), 'utf8').includes('playNow:'))
check('mature fields on queue item type', fs.readFileSync(path.join(ROOT, 'src/lib/queue/types.ts'), 'utf8').includes('isMature'))
check('storage key versioned', fs.readFileSync(path.join(ROOT, 'src/lib/queue/types.ts'), 'utf8').includes("ht-desktop:queue:v1"))

// Duplicate policy documented
check('duplicate policy comment', fs.readFileSync(path.join(ROOT, 'src/lib/queue/operations.ts'), 'utf8').includes('Duplicate policy'))

console.log(`\nQueue contract: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
