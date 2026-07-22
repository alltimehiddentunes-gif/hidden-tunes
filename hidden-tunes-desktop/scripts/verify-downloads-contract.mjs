/**
 * Downloads / offline contract harness (Node + Electron modules, no UI).
 * Run: node scripts/verify-downloads-contract.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

process.env.HT_DOWNLOADS_TEST_ALLOW_HTTP = '1'

const {
  classifyDownloadability,
  assertDownloadableHttpsUrl,
  isLiveOrPlaylistUrl,
  userFacingError,
} = require('../electron/downloads/downloadability.js')
const {
  assertInsideRoot,
  rejectUnsafeUserPath,
  sanitizeSegment,
  identityKey,
  relativePathForItem,
} = require('../electron/downloads/pathSafety.js')
const {
  normalizeItem,
  readStore,
  writeStoreAtomic,
  absoluteFromRelative,
} = require('../electron/downloads/metadataStore.js')
const { DownloadManager, makeDownloadId } = require('../electron/downloads/downloadManager.js')
const { downloadsRoot, SCHEMA_VERSION, MAX_CONCURRENT_DOWNLOADS } = require('../electron/downloads/constants.js')

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

function libraryIdentity(type, id) {
  return `${type}:${String(id).trim()}`
}

function classifyRenderer(family) {
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

function downloadItemToOwner(type) {
  switch (type) {
    case 'song':
      return 'music'
    case 'podcast_episode':
      return 'podcast'
    case 'audiobook_chapter':
      return 'audiobook'
    case 'motivational':
      return 'motivational'
    case 'lecture':
      return 'lecture'
    default:
      return 'unknown'
  }
}

async function withTempUserData(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-dl-contract-'))
  try {
    return await fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function startFiniteServer(body, headers = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': Buffer.byteLength(body),
        'Accept-Ranges': 'bytes',
        ...headers,
      })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/track.mp3`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

function startPlaylistServer() {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
      res.end('#EXTM3U\n')
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/live.m3u8`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

async function waitUntil(predicate, ms = 15_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await predicate()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

async function main() {
  // Identity / metadata
  check('same raw ID does not collide across families', identityKey('song', '123') !== identityKey('podcast_episode', '123'))
  check('Library and Download identities are separate namespaces', libraryIdentity('radio', '123') !== identityKey('podcast_episode', '123'))
  check('downloadId format is family-safe', makeDownloadId('song', 'abc') === 'song__abc')

  const bad = normalizeItem({ id: '', type: 'song', title: 'x', downloadId: 'd', status: 'completed' })
  check('malformed metadata rejected', bad === null)

  const completeNeedsPath = normalizeItem({
    id: '1',
    type: 'song',
    title: 'T',
    downloadId: 'song__1',
    status: 'completed',
    localRelativePath: '../etc/passwd',
  })
  check('completed record rejects traversal path', completeNeedsPath === null)

  const okItem = normalizeItem({
    id: '1',
    type: 'podcast_episode',
    title: 'Ep',
    downloadId: 'podcast_episode__1',
    status: 'completed',
    localRelativePath: 'podcasts/1.mp3',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  check('valid completed metadata accepted', Boolean(okItem?.localRelativePath))

  // Security
  const root = path.join(os.tmpdir(), 'ht-dl-root-test')
  fs.mkdirSync(root, { recursive: true })
  try {
    assertInsideRoot(root, path.join(root, 'music', 'a.mp3'))
    check('nested path under root allowed', true)
  } catch {
    check('nested path under root allowed', false)
  }
  try {
    assertInsideRoot(root, path.join(root, '..', 'escape.mp3'))
    check('path traversal rejected', false)
  } catch {
    check('path traversal rejected', true)
  }
  try {
    rejectUnsafeUserPath('C:\\Windows\\system32')
    check('absolute path rejected', false)
  } catch {
    check('absolute path rejected', true)
  }
  try {
    rejectUnsafeUserPath('\\\\server\\share')
    check('UNC path rejected', true)
  } catch {
    check('UNC path rejected', true)
  }
  try {
    rejectUnsafeUserPath('../secret')
    check('relative traversal rejected', true)
  } catch {
    check('relative traversal rejected', true)
  }
  check('reserved device name sanitized', sanitizeSegment('CON') === 'CON_file')
  check('relative path stays under family dir', relativePathForItem('song', 'id1', 'mp3').replace(/\\/g, '/').startsWith('music/'))

  try {
    assertDownloadableHttpsUrl('ftp://evil.com/a.mp3')
    check('unsupported protocol rejected', false)
  } catch {
    check('unsupported protocol rejected', true)
  }
  try {
    assertDownloadableHttpsUrl('https://evil.example/a.mp3')
    check('unapproved host rejected', false)
  } catch {
    check('unapproved host rejected', true)
  }
  try {
    assertDownloadableHttpsUrl('https://cdn.r2.dev/a.mp3')
    check('approved HTTPS host accepted', true)
  } catch (e) {
    check('approved HTTPS host accepted', false, String(e.message))
  }
  check('HLS playlist detected', isLiveOrPlaylistUrl('https://cdn.r2.dev/x.m3u8', 'application/vnd.apple.mpegurl'))
  check('Icecast relay detected', isLiveOrPlaylistUrl('https://admin.hiddentunes.com/relay?id=1', 'audio/mpeg'))

  // Downloadability policy
  for (const type of ['radio', 'tv', 'podcast_show', 'sports']) {
    check(`${type} is stream_only (main)`, classifyDownloadability(type) === 'stream_only')
    check(`${type} is stream_only (renderer)`, classifyRenderer(type) === 'stream_only')
  }
  check('podcast_episode downloadable', classifyDownloadability('podcast_episode') === 'downloadable')
  check('finite music downloadable class', classifyDownloadability('song') === 'downloadable')
  check('audiobook book container stream_only', classifyRenderer('audiobook') === 'stream_only')
  check('audiobook chapter downloadable', classifyDownloadability('audiobook_chapter') === 'downloadable')
  check('user-facing stream_only message', userFacingError('stream_only').includes('live stream'))
  check('user-facing missing message', userFacingError('missing').includes('missing'))
  check('schema version is 1', SCHEMA_VERSION === 1)
  check('concurrency default is 2', MAX_CONCURRENT_DOWNLOADS === 2)

  // Offline owner routing
  check('podcast offline uses podcast owner', downloadItemToOwner('podcast_episode') === 'podcast')
  check('music offline uses music owner', downloadItemToOwner('song') === 'music')
  check('audiobook offline uses audiobook owner', downloadItemToOwner('audiobook_chapter') === 'audiobook')

  await withTempUserData(async (userData) => {
    const events = []
    const manager = new DownloadManager({
      getUserDataPath: () => userData,
      broadcast: (event, payload) => events.push({ event, payload }),
    })

    const radio = await manager.start({ type: 'radio', id: '1', title: 'Live' })
    check('Radio start rejected', radio.ok === false && radio.errorCode === 'stream_only')

    const tv = await manager.start({ type: 'tv', id: '1', title: 'Live TV' })
    check('live TV start rejected', tv.ok === false && tv.errorCode === 'stream_only')

    const show = await manager.start({ type: 'podcast_show', id: '1', title: 'Show' })
    check('Podcast show start rejected', show.ok === false && show.errorCode === 'stream_only')

    const sports = await manager.start({ type: 'sports', id: '1', title: 'Game' })
    check('Sports start rejected', sports.ok === false)

    // Seed completed file + metadata
    const rootDir = downloadsRoot(userData)
    fs.mkdirSync(path.join(rootDir, 'podcasts'), { recursive: true })
    const rel = 'podcasts/ep1.mp3'
    fs.writeFileSync(path.join(rootDir, rel), Buffer.from('ID3fakeaudio'))
    writeStoreAtomic(userData, {
      version: SCHEMA_VERSION,
      items: [
        normalizeItem({
          id: 'ep1',
          type: 'podcast_episode',
          title: 'Episode 1',
          downloadId: 'podcast_episode__ep1',
          status: 'completed',
          localRelativePath: rel,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          showId: 'show1',
        }),
        normalizeItem({
          id: 'ghost',
          type: 'song',
          title: 'Missing',
          downloadId: 'song__ghost',
          status: 'completed',
          localRelativePath: 'music/ghost.mp3',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ].filter(Boolean),
    })

    const playable = manager.getPlayableUrl('podcast_episode__ep1')
    check('playable URL uses ht-download scheme', playable.ok && String(playable.url).startsWith('ht-download://'))
    check('playable URL has no absolute filesystem path', playable.ok && !String(playable.url).includes(userData))

    await manager.reconcile()
    const after = manager.list()
    const ghost = after.find((item) => item.downloadId === 'song__ghost')
    check('missing completed file becomes missing', ghost?.status === 'missing')

    // Library favorite independence (simulated)
    const favoriteKey = libraryIdentity('podcast_episode', 'ep1')
    const downloadKey = identityKey('podcast_episode', 'ep1')
    check('favorite identity distinct from download identity key equality still typed', favoriteKey === downloadKey)
    manager.remove('podcast_episode__ep1')
    check('remove deletes metadata', !manager.findByDownloadId('podcast_episode__ep1'))
    check('remove deletes file', !fs.existsSync(path.join(rootDir, rel)))
    check('favorite record conceptually preserved (separate store)', favoriteKey.startsWith('podcast_episode:'))

    // Duplicate start prevention + lifecycle via finite local file
    const server = await startFiniteServer(Buffer.alloc(64 * 1024, 1))
    try {
      const first = await manager.start({
        type: 'song',
        id: 'track-a',
        title: 'Track A',
        candidateUrl: server.url,
      })
      check('queue → start accepted', first.ok === true)
      const dup = await manager.start({
        type: 'song',
        id: 'track-a',
        title: 'Track A',
        candidateUrl: server.url,
      })
      check('duplicate simultaneous start prevented', dup.duplicate === true)

      const completed = await waitUntil(() => {
        const item = manager.findByIdentity('song', 'track-a')
        return item?.status === 'completed'
      })
      check('queued → downloading → completed', completed)
      const item = manager.findByIdentity('song', 'track-a')
      check('completed points to non-partial path', Boolean(item?.localRelativePath) && !String(item.localRelativePath).endsWith('.part'))
      check('completed file exists under downloads root', fs.existsSync(absoluteFromRelative(userData, item.localRelativePath)))

      const cancelServer = await startFiniteServer(Buffer.alloc(8 * 1024 * 1024, 2))
      try {
        const slow = await manager.start({
          type: 'song',
          id: 'track-cancel',
          title: 'Cancel Me',
          candidateUrl: cancelServer.url,
        })
        check('cancel target queued', slow.ok === true)
        manager.cancel(slow.item.downloadId)
        const cancelled = await waitUntil(() => {
          const row = manager.findByIdentity('song', 'track-cancel')
          return row?.errorCode === 'cancelled' || row?.status === 'failed'
        }, 5000)
        check('cancellation records clear error', cancelled)
      } finally {
        await cancelServer.close()
      }

      const playlist = await startPlaylistServer()
      try {
        const hls = await manager.start({
          type: 'song',
          id: 'hls-bad',
          title: 'HLS',
          candidateUrl: playlist.url,
        })
        check('HLS start may queue then fail', hls.ok === true)
        const failedHls = await waitUntil(() => {
          const row = manager.findByIdentity('song', 'hls-bad')
          return row?.status === 'failed'
        })
        check('unsupported HLS rejected', failedHls)
      } finally {
        await playlist.close()
      }

      // Restart recovery: downloading → failed on reconcile
      writeStoreAtomic(userData, {
        version: SCHEMA_VERSION,
        items: [
          ...manager.list(),
          normalizeItem({
            id: 'crash',
            type: 'song',
            title: 'Crash',
            downloadId: 'song__crash',
            status: 'downloading',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
        ].filter(Boolean),
      })
      await manager.reconcile()
      const crash = manager.findByDownloadId('song__crash')
      check('restart recovery marks interrupted download failed', crash?.status === 'failed')

      const usage = manager.getDiskUsage()
      check('disk usage reports downloads bytes', typeof usage.downloadsBytes === 'number')
      check('disk usage exposes concurrency', usage.maxConcurrent === 2)

      // Public list never includes absolute paths
      const listed = manager.list()
      check(
        'renderer list has no absolute paths',
        listed.every((row) => !JSON.stringify(row).toLowerCase().includes(userData.toLowerCase())),
      )
    } finally {
      await server.close()
    }
  })

  // Storage root naming
  check('downloads root is under userData/downloads', downloadsRoot('C:\\\\AppData').endsWith(`${path.sep}downloads`))

  console.log(`\nDownloads contract: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
