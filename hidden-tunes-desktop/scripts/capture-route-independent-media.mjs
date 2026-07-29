#!/usr/bin/env node
/**
 * Runtime proof: active media session persists across route navigation.
 *
 * Requires Vite on :5173.
 * Writes under docs/audits/route-independent-media/
 *
 * Run: electron scripts/capture-route-independent-media.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog, fetchApprovedCatalogRequest } = require('../electron/catalogBridge.js')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outDir = path.join(ROOT, 'docs', 'audits', 'route-independent-media')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitUrl(url, ms = 60000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 304) return
    } catch {}
    await sleep(400)
  }
  throw new Error(`timeout ${url}`)
}

async function evalPage(win, src) {
  return win.webContents.executeJavaScript(`(${src})()`, true)
}

async function waitReady(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    const s = await evalPage(win, `() => ({
      sidebar: Boolean(document.querySelector('.sidebar')),
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
      rail: Boolean(document.querySelector('[data-ht-persistent-player="true"], .tv-rail')),
    })`)
    if (s.sidebar && s.rail && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  const ok = await evalPage(win, `() => {
    const target = '${label}'.toLowerCase()
    const el = [...document.querySelectorAll('.sidebar-nav .nav-item')]
      .find((n) => {
        const span = n.querySelector('span:last-child')
        const text = (span?.textContent || n.textContent || '').trim().toLowerCase()
        return text === target
      })
    el?.click()
    return Boolean(el)
  }`)
  await sleep(1200)
  return ok
}

async function capture(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  console.log(`SHOT: ${file}`)
  return file
}

async function playerSnapshot(win) {
  return evalPage(win, `() => {
    const tvRail = document.querySelector('.tv-rail--now-playing')
    const audioRail = document.querySelector('[data-ht-persistent-player="true"]')
    const footer = document.querySelector('footer.player-bar, .player-bar')
    const video = document.querySelector('video[data-ht-tv-playback="true"], .ht-tv-video-element')
    const audios = document.querySelectorAll('audio')
    return {
      nav: document.querySelector('.page-view')?.getAttribute('data-nav') || null,
      page: document.querySelector('.page-view')?.getAttribute('data-page') || null,
      tvRail: Boolean(tvRail),
      tvTitle: tvRail?.querySelector('h3')?.textContent?.trim() || null,
      audioRail: Boolean(audioRail),
      audioIdle: audioRail?.getAttribute('data-idle') ?? null,
      audioTitle: document.querySelector('.ht-player-track-title')?.textContent?.trim() || null,
      footerTitle: footer?.querySelector('.track-title, .player-track-title, .ht-player-track-title')?.textContent?.trim()
        || footer?.querySelector('h3, strong')?.textContent?.trim()
        || null,
      footerLive: Boolean(footer?.querySelector('.live-badge, .progress-wrap--live, [aria-label*="Live"]')),
      videoCount: document.querySelectorAll('video[data-ht-tv-playback="true"], .ht-tv-video-element').length,
      audioCount: audios.length,
      videoPaused: video ? video.paused : null,
    }
  }`)
}

function registerIpc() {
  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    return fetchApprovedCatalog(p)
  })
  ipcMain.handle('ht-catalog-request', async (_e, options) => {
    const cleanPath = typeof options?.path === 'string' ? options.path.trim() : ''
    const methodRaw = typeof options?.method === 'string' ? options.method.trim().toUpperCase() : 'GET'
    const method = methodRaw === 'POST' ? 'POST' : methodRaw === 'GET' ? 'GET' : ''
    const body = options?.body === undefined ? null : options.body
    if (!cleanPath.startsWith('/api/')) throw new Error('bad path')
    if (method !== 'GET' && method !== 'POST') throw new Error('bad method')
    return fetchApprovedCatalogRequest({ path: cleanPath, method, body })
  })
  ipcMain.on('ht-runtime-info', (event) => {
    event.returnValue = {
      isPackaged: false,
      environment: 'development',
      ok: true,
      errors: [],
      warnings: [],
      expressConfigured: true,
      adminConfigured: true,
      sportsPilotConfigured: false,
    }
  })
  ipcMain.handle('ht-downloads-list', async () => [])
  ipcMain.handle('ht-downloads-disk-usage', async () => ({ usedBytes: 0, itemCount: 0 }))
  ipcMain.handle('ht-downloads-reconcile', async () => ({ ok: true, removed: 0 }))
  ipcMain.handle('ht-downloads-start', async () => ({ ok: false, error: 'unavailable in capture' }))
  ipcMain.handle('ht-downloads-pause', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-resume', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-cancel', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-remove', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-get-playable-url', async () => ({ ok: false, error: 'unavailable' }))
}

async function playFirstTvChannel(win) {
  const navOk = await clickNav(win, 'TV')
  await sleep(2200)
  const clicked = await evalPage(win, `() => {
    const page = document.querySelector('.page-view')?.getAttribute('data-nav')
    const hit = document.querySelector('.tv-station-card-hit')
    hit?.click()
    return { navOk: page === 'tv', hit: Boolean(hit), page }
  }`)
  await sleep(4500)
  return { navOk, ...clicked }
}

async function playFirstSong(win) {
  const navOk = await clickNav(win, 'Radio')
  await sleep(3000)
  const ready = await evalPage(win, `() => {
    const hit = document.querySelector('.radio-station-card-v2-hit')
    if (!hit) return { clicked: false, label: null, via: 'radio' }
    hit.click()
    const title = hit.querySelector('h3, strong, .radio-station-card-v2-copy')
    return {
      clicked: true,
      label: (title && title.textContent) ? title.textContent.trim().slice(0, 80) : 'radio-station',
      via: 'radio',
    }
  }`)
  await sleep(5000)
  return { navOk: navOk, clicked: ready.clicked, label: ready.label, via: ready.via }
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-route-media-'))
  app.setPath('userData', userData)
  await waitUrl(URL)
  registerIpc()

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#050508',
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  await win.loadURL(URL)
  await waitReady(win)

  const results = {
    steps: [],
    checks: [],
  }

  const note = (id, ok, detail) => {
    results.checks.push({ id, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${id} — ${detail}`)
  }

  // A. TV persistence
  const tvStarted = await playFirstTvChannel(win)
  let snap = await playerSnapshot(win)
  results.steps.push({ step: 'A1-tv-start', tvStarted, snap })
  await capture(win, '01-tv-playing-on-tv-route')
  note(
    'A1',
    snap.tvRail === true,
    `TV rail after start (${JSON.stringify(tvStarted)}) title=${snap.tvTitle} nav=${snap.nav}`,
  )

  for (const [label, shot] of [
    ['Music', '02-tv-persists-on-music'],
    ['Podcasts', '03-tv-persists-on-podcasts'],
    ['Home', '04-tv-persists-on-home'],
  ]) {
    await clickNav(win, label)
    snap = await playerSnapshot(win)
    results.steps.push({ step: `A-nav-${label}`, snap })
    await capture(win, shot)
    note(
      `A-${label}`,
      snap.tvRail === true && snap.nav?.toLowerCase() === label.toLowerCase(),
      `nav=${snap.nav} tvRail=${snap.tvRail} title=${snap.tvTitle}`,
    )
  }

  // Next from TV controls while on Home
  let nextOk = { clicked: false, before: null, error: null }
  try {
    nextOk = await evalPage(win, `() => {
      const btn = document.querySelector('.tv-rail--now-playing button[aria-label="Next channel"]')
      const before = document.querySelector('.tv-rail--now-playing h3')?.textContent?.trim() || ''
      btn?.click()
      return { clicked: Boolean(btn), before }
    }`)
  } catch (error) {
    nextOk = { clicked: false, before: null, error: String(error) }
  }
  await sleep(2500)
  snap = await playerSnapshot(win)
  results.steps.push({ step: 'A-next', nextOk, snap })
  await capture(win, '05-tv-next-while-on-home')
  note(
    'A-next',
    snap.tvRail === true && snap.nav === 'home' && nextOk.clicked === true,
    `TV still active on Home after Next; before=${nextOk.before} after=${snap.tvTitle} err=${nextOk.error}`,
  )

  // B. Intentional switch to music
  const songStarted = await playFirstSong(win)
  snap = await playerSnapshot(win)
  results.steps.push({ step: 'B-music-switch', songStarted, snap })
  await capture(win, '06-music-after-explicit-play')
  note(
    'B-switch-music',
    snap.audioRail === true && snap.tvRail === false && songStarted.clicked === true,
    `After explicit audio play (${JSON.stringify(songStarted)}): audioRail=${snap.audioRail} tvRail=${snap.tvRail} title=${snap.audioTitle}`,
  )

  await clickNav(win, 'TV')
  snap = await playerSnapshot(win)
  results.steps.push({ step: 'B-browse-tv-no-play', snap })
  await capture(win, '07-music-persists-browsing-tv')
  note(
    'B-browse-tv',
    snap.audioRail === true && snap.tvRail === false && snap.nav === 'tv',
    `Browsing TV without play keeps music: audioRail=${snap.audioRail} tvRail=${snap.tvRail}`,
  )

  // One-owner counts
  note('one-video', snap.videoCount <= 1, `videoCount=${snap.videoCount}`)
  note('one-audio-el', snap.audioCount <= 2, `audioCount=${snap.audioCount} (allow idle+active)`)

  const failed = results.checks.filter((c) => !c.ok)
  fs.writeFileSync(path.join(outDir, 'runtime-proof.json'), JSON.stringify(results, null, 2))
  console.log('DONE checks=', results.checks.length, 'failed=', failed.length)
  app.exit(failed.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error('CAPTURE_FAIL', e && e.stack ? e.stack : e)
  try {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, 'runtime-proof-error.json'), JSON.stringify({
      error: String(e && e.message ? e.message : e),
      stack: e && e.stack ? e.stack : null,
    }, null, 2))
  } catch {}
  app.exit(1)
}))
