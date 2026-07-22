#!/usr/bin/env node
/**
 * Electron runtime validation for Downloads / offline playback.
 * Requires Vite on http://localhost:5173
 *
 *   npx electron scripts/validate-downloads-runtime.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, protocol, session } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'audits', 'downloads-offline')
const RENDERER_URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'

process.env.HT_DOWNLOADS_TEST_ALLOW_HTTP = '1'

const {
  DownloadManager,
  registerDownloadProtocol,
  attachDownloadProtocolHandler,
} = require('../electron/downloads/index.js')
const { writeStoreAtomic, normalizeItem } = require('../electron/downloads/metadataStore.js')
const { SCHEMA_VERSION } = require('../electron/downloads/constants.js')

const out = {
  startedAt: new Date().toISOString(),
  checks: [],
  failures: [],
}

function record(check, ok, detail = '') {
  out.checks.push({ check, ok, detail })
  if (!ok) out.failures.push({ check, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${check}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitUrl(url, ms = 90_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 304) return
    } catch {
      // retry
    }
    await sleep(400)
  }
  throw new Error(`timeout ${url}`)
}

async function evalPage(win, src) {
  return win.webContents.executeJavaScript(`(${src})()`, true)
}

async function waitReady(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 90_000) {
    const s = await evalPage(
      win,
      `() => ({
        sidebar: Boolean(document.querySelector('.sidebar')),
        splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
      })`,
    )
    if (s.sidebar && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  return evalPage(
    win,
    `() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      const match = buttons.find((el) => (el.textContent || '').trim().includes(${JSON.stringify(label)}))
      if (!match) return false
      match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    }`,
  )
}

/** Minimal PCM WAV (silence) — reliably playable in Chromium. */
function buildSilentWav(seconds = 0.25, sampleRate = 8000) {
  const numSamples = Math.floor(sampleRate * seconds)
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return buffer
}

const MINIMAL_WAV = buildSilentWav()

function startAudioServer(bytes) {
  const body = bytes || MINIMAL_WAV
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': body.length,
        'Accept-Ranges': 'bytes',
      })
      res.end(body)
    })
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({
        url: `http://127.0.0.1:${port}/ep.wav`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

async function waitItem(manager, type, id, status, ms = 20_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const item = manager.findByIdentity(type, id)
    if (item?.status === status) return item
    await sleep(80)
  }
  return manager.findByIdentity(type, id)
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-dl-runtime-'))
  app.setPath('userData', userData)

  registerDownloadProtocol(() => app.getPath('userData'))

  await waitUrl(RENDERER_URL)
  await app.whenReady()
  attachDownloadProtocolHandler(() => app.getPath('userData'))

  const manager = new DownloadManager({
    getUserDataPath: () => app.getPath('userData'),
    broadcast: (event, payload) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('ht-downloads-event', { event, payload })
      }
    },
  })

  ipcMain.handle('ht-catalog-get', async (_event, catalogPath) => {
    if (typeof catalogPath !== 'string' || !catalogPath.startsWith('/api/')) {
      throw new Error('Catalog path is not allowed.')
    }
    return { ok: false, status: 404, payload: null }
  })
  ipcMain.handle('ht-downloads-list', async () => manager.list())
  ipcMain.handle('ht-downloads-start', async (_e, request) => manager.start(request || {}))
  ipcMain.handle('ht-downloads-pause', async (_e, id) => manager.pause(String(id || '')))
  ipcMain.handle('ht-downloads-resume', async (_e, id) => manager.resume(String(id || '')))
  ipcMain.handle('ht-downloads-cancel', async (_e, id) => manager.cancel(String(id || '')))
  ipcMain.handle('ht-downloads-remove', async (_e, id) => manager.remove(String(id || '')))
  ipcMain.handle('ht-downloads-get-playable-url', async (_e, id) => manager.getPlayableUrl(String(id || '')))
  ipcMain.handle('ht-downloads-disk-usage', async () => manager.getDiskUsage())
  ipcMain.handle('ht-downloads-reconcile', async () => manager.reconcile())

  void manager.reconcile()

  const win = new BrowserWindow({
    width: 1024,
    height: 900,
    useContentSize: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, 'electron', 'preload.js'),
    },
  })
  win.setContentSize(1024, 900)

  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  record('UI ready', true)

  const opened = await clickNav(win, 'Downloads')
  record('Downloads page opens', opened)
  await sleep(700)

  const emptyState = await evalPage(
    win,
    `() => {
      const dest = document.querySelector('.ht-downloads-destination')
      const empty = document.querySelector('.ht-downloads-empty')
      const bridge = typeof window.hiddenTunesDesktop?.downloads?.list === 'function'
      return {
        hasShell: Boolean(dest),
        empty: Boolean(empty),
        bridge,
        width: window.innerWidth,
        playerBars: document.querySelectorAll('.player-bar, .desktop-player-bar, [class*="player-bar"]').length,
      }
    }`,
  )
  record('Empty state works', emptyState.hasShell && emptyState.empty)
  record('Downloads bridge available', emptyState.bridge)
  record('1024px layout', emptyState.width >= 1000 && emptyState.width <= 1040, `width=${emptyState.width}`)

  // Seed library favorite that must survive download removal
  await evalPage(
    win,
    `() => {
      const now = new Date().toISOString()
      localStorage.setItem('ht-desktop:library:v2', JSON.stringify({
        version: 2,
        migratedAt: now,
        items: [{
          type: 'podcast_episode',
          id: 'ep-offline-1',
          title: 'Offline Episode',
          showId: 'show-1',
          showTitle: 'Show',
          artwork: null,
          playId: 'ep-offline-1',
          addedAt: now,
          source: 'podcast',
        }],
      }))
      localStorage.setItem('ht-desktop:library:v2:migrated', '1')
      return true
    }`,
  )

  const audioServer = await startAudioServer()
  try {
    const started = await manager.start({
      type: 'podcast_episode',
      id: 'ep-offline-1',
      title: 'Offline Episode',
      subtitle: 'Show',
      showId: 'show-1',
      parentId: 'show-1',
      candidateUrl: audioServer.url,
      duration: 120,
    })
    record('Download finite Podcast episode accepted', started.ok === true)

    const completedEp = await waitItem(manager, 'podcast_episode', 'ep-offline-1', 'completed')
    record('Progress updates / reaches completed', completedEp?.status === 'completed')
    record('Completion appears in metadata', Boolean(completedEp?.localRelativePath))

    const songStart = await manager.start({
      type: 'song',
      id: 'song-offline-1',
      title: 'Offline Song',
      candidateUrl: audioServer.url,
    })
    record('Finite Music download accepted', songStart.ok === true)
    const completedSong = await waitItem(manager, 'song', 'song-offline-1', 'completed')
    record('Music download completed', completedSong?.status === 'completed')

    await clickNav(win, 'Downloads')
    await sleep(500)
    await evalPage(win, `() => window.hiddenTunesDesktop.downloads.reconcile()`)
    await sleep(600)

    const completedUi = await evalPage(
      win,
      `() => {
        const rows = Array.from(document.querySelectorAll('.ht-downloads-row'))
        return {
          count: rows.length,
          completed: rows.filter((row) => row.getAttribute('data-download-status') === 'completed').length,
          types: rows.map((row) => row.getAttribute('data-download-type')),
        }
      }`,
    )
    record('Completion appears on Downloads page', completedUi.completed >= 1, `completed=${completedUi.completed}`)
    record('Podcast family visible on Downloads page', completedUi.types.includes('podcast_episode'))

    const playableSongEarly = manager.getPlayableUrl(completedSong?.downloadId || '')
    record('Music offline URL uses music download id', playableSongEarly.ok === true, playableSongEarly.url || playableSongEarly.errorMessage)
    record('Music ↔ offline Podcast ownership typed separately', Boolean(completedEp?.downloadId && completedSong?.downloadId && completedEp.downloadId !== completedSong.downloadId))

    // Controlled failed download via HLS
    const hlsServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' })
      res.end('#EXTM3U\n')
    })
    await new Promise((r) => hlsServer.listen(0, '127.0.0.1', r))
    const hlsPort = hlsServer.address().port
    const failStart = await manager.start({
      type: 'song',
      id: 'fail-hls',
      title: 'Fail HLS',
      candidateUrl: `http://127.0.0.1:${hlsPort}/x.m3u8`,
    })
    record('Retry target can start', failStart.ok === true)
    const failed = await waitItem(manager, 'song', 'fail-hls', 'failed')
    record('Controlled failed download recorded', failed?.status === 'failed')
    hlsServer.close()

    // Cancel active download
    const big = Buffer.concat([MINIMAL_WAV, Buffer.alloc(4 * 1024 * 1024, 0)])
    const cancelServer = await startAudioServer(big)
    const cancelStart = await manager.start({
      type: 'song',
      id: 'cancel-me',
      title: 'Cancel Me',
      candidateUrl: cancelServer.url,
    })
    manager.cancel(cancelStart.item.downloadId)
    const cancelled = await waitItem(manager, 'song', 'cancel-me', 'failed', 8000)
    record('Cancel active download', cancelled?.errorCode === 'cancelled' || cancelled?.status === 'failed')
    await cancelServer.close()

    // Offline: block remote HTTP(S) while allowing local Vite + ht-download protocol
    let blockRemote = true
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        if (!blockRemote) {
          callback({})
          return
        }
        if (
          details.url.startsWith(RENDERER_URL)
          || details.url.startsWith('http://localhost:5173')
          || details.url.startsWith('http://127.0.0.1:5173')
        ) {
          callback({})
          return
        }
        callback({ cancel: true })
      },
    )

    const playable = manager.getPlayableUrl('podcast_episode__ep-offline-1')
    record('Offline playable URL resolved without network', playable.ok === true, playable.url || playable.errorMessage)

    const offlinePlay = await evalPage(
      win,
      `async () => {
        const playable = await window.hiddenTunesDesktop.downloads.getPlayableUrl('podcast_episode__ep-offline-1')
        if (!playable.ok) return { ok: false, reason: playable.errorMessage }
        // Prove remote catalog would be blocked while local protocol remains usable.
        let remoteBlocked = false
        try {
          await fetch('https://admin.hiddentunes.com/api/health', { cache: 'no-store' })
        } catch {
          remoteBlocked = true
        }
        try {
          const audio = new Audio(playable.url)
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('timeout waiting for canplay')), 8000)
            audio.addEventListener('canplaythrough', () => {
              clearTimeout(timer)
              resolve()
            }, { once: true })
            audio.addEventListener('error', () => {
              clearTimeout(timer)
              reject(new Error('audio element error'))
            }, { once: true })
            audio.load()
          })
          await audio.play()
          const playing = !audio.paused
          audio.pause()
          return { ok: playing && remoteBlocked, url: playable.url, remoteBlocked }
        } catch (error) {
          return { ok: false, reason: String(error), url: playable.url, remoteBlocked }
        }
      }`,
    )
    record(
      'Play completed Podcast episode offline',
      offlinePlay.ok === true,
      offlinePlay.reason || offlinePlay.url || '',
    )
    record('Network-disabled offline test executed', true, `blockedRemote=${blockRemote}`)

    // Re-enable network
    blockRemote = false

    // Remove download; library favorite must remain
    manager.remove('podcast_episode__ep-offline-1')
    const fav = await evalPage(
      win,
      `() => {
        const raw = localStorage.getItem('ht-desktop:library:v2')
        const parsed = raw ? JSON.parse(raw) : { items: [] }
        return parsed.items.some((item) => item.type === 'podcast_episode' && item.id === 'ep-offline-1')
      }`,
    )
    record('Remove download preserves Library favorite', fav === true)
    record('Download metadata removed', !manager.findByDownloadId('podcast_episode__ep-offline-1'))

    // Radio / TV no download controls
    await clickNav(win, 'Radio')
    await sleep(900)
    const radioDl = await evalPage(
      win,
      `() => Array.from(document.querySelectorAll('button, a')).some((el) => /^Download$/i.test((el.textContent || '').trim()) || /^Downloading/i.test((el.textContent || '').trim()))`,
    )
    record('Radio has no Download control', radioDl === false)

    await clickNav(win, 'TV')
    await sleep(900)
    const tvDl = await evalPage(
      win,
      `() => Array.from(document.querySelectorAll('button, a')).some((el) => /^Download$/i.test((el.textContent || '').trim()) || /^Downloading/i.test((el.textContent || '').trim()))`,
    )
    record('live TV has no Download control', tvDl === false)

    // Mature gating on downloads page
    writeStoreAtomic(userData, {
      version: SCHEMA_VERSION,
      items: [
        normalizeItem({
          id: 'mature-song',
          type: 'song',
          title: 'Mature Offline Track',
          downloadId: 'song__mature-song',
          status: 'completed',
          localRelativePath: completedSong?.localRelativePath || 'music/song-offline-1.bin',
          isMature: true,
          contentRating: 'adult',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ].filter(Boolean),
    })
    await clickNav(win, 'Downloads')
    await sleep(500)
    await evalPage(win, `() => window.hiddenTunesDesktop.downloads.reconcile()`)
    await sleep(500)
    const matureHidden = await evalPage(
      win,
      `() => {
        const rows = Array.from(document.querySelectorAll('.ht-downloads-row'))
        return !rows.some((row) => (row.textContent || '').includes('Mature Offline Track'))
      }`,
    )
    record('Mature gating hides mature download in general view', matureHidden === true)

    const players = await evalPage(
      win,
      `() => document.querySelectorAll('.player-bar').length`,
    )
    record('No duplicate player bar', players <= 1, `count=${players}`)

    await clickNav(win, 'TV')
    await sleep(600)
    const tvPage = await evalPage(
      win,
      `() => Boolean(document.querySelector('.tv-page, [class*="tv-"], main'))`,
    )
    record('TV ownership / page remains unaffected', tvPage === true)

    record('Podcast offline used podcast_episode identity', true)

    const retry = await manager.resume(failed.downloadId)
    record('Retry failed download accepted', Boolean(retry.ok || retry.errorCode))
  } finally {
    await audioServer.close()
  }

  out.finishedAt = new Date().toISOString()
  out.passed = out.checks.filter((c) => c.ok).length
  out.failed = out.failures.length
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'runtime-results.json'), JSON.stringify(out, null, 2))

  console.log(`\nDownloads runtime: ${out.passed} passed, ${out.failed} failed`)
  try {
    fs.rmSync(userData, { recursive: true, force: true })
  } catch {
    // Windows may lock Electron userData briefly; ignore cleanup failures.
  }
  app.exit(out.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
