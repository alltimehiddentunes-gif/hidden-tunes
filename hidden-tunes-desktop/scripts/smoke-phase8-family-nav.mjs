#!/usr/bin/env node
/**
 * Phase 8 family navigation smoke — visits core desktop destinations and
 * asserts shell + single media ownership without redesigning pages.
 *
 * Run: npx electron scripts/smoke-phase8-family-nav.mjs
 * Requires Vite at HT_VALIDATE_URL (default http://localhost:5173).
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog } = require('../electron/catalogBridge.js')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const out = { checks: [], failures: [] }

function record(check, ok, detail = '') {
  out.checks.push({ check, ok, detail })
  if (!ok) out.failures.push({ check, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${check}${detail ? ` — ${detail}` : ''}`)
}

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
  for (let i = 0; i < 90; i++) {
    const ready = await evalPage(win, `() => Boolean(document.querySelector('.sidebar, .app-shell, #root'))`)
    if (ready) return
    await sleep(400)
  }
  throw new Error('shell not ready')
}

async function clickSidebarOrTop(win, label) {
  return evalPage(
    win,
    `() => {
      const nodes = [...document.querySelectorAll('button, a, [role="button"]')]
      const hit = nodes.find((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(label)})
        || nodes.find((el) => (el.getAttribute('aria-label') || '') === ${JSON.stringify(label)})
        || nodes.find((el) => (el.textContent || '').includes(${JSON.stringify(label)}))
      if (!hit) return false
      hit.click()
      return true
    }`,
  )
}

const ROUTES = [
  { label: 'Home', probe: `() => Boolean(document.querySelector('.music-home, [data-home-layout]'))` },
  { label: 'Music', probe: `() => Boolean(document.querySelector('.music-discover, .music-page, [class*="music"]'))` },
  { label: 'Radio', probe: `() => /radio/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'Podcasts', probe: `() => /podcast/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'TV', probe: `() => /tv|channel/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'Audiobooks', probe: `() => /audiobook/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'Motivationals', probe: `() => /motivational/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'Lectures', probe: `() => /lecture/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'Library', probe: `() => /library|favorite|playlist/i.test(document.body.innerText.slice(0, 4000))` },
  { label: 'Downloads', probe: `() => /download/i.test(document.body.innerText.slice(0, 4000))` },
]

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-phase8-smoke-'))
  app.setPath('userData', userData)

  ipcMain.handle('ht-catalog-get', async (_e, apiPath) => fetchApprovedCatalog(apiPath))
  ipcMain.handle('ht-catalog-request', async (_e, options) => fetchApprovedCatalog(options?.path || options))
  ipcMain.handle('ht-downloads-list', async () => [])
  ipcMain.handle('ht-downloads-reconcile', async () => ({ ok: true }))
  ipcMain.handle('ht-downloads-disk-usage', async () => ({ bytes: 0, maxConcurrent: 2 }))
  ipcMain.on('ht-runtime-info', (event) => {
    event.returnValue = { packaged: false, phase8Smoke: true }
  })

  await waitUrl(URL)
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    backgroundColor: '#050508',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, 'electron', 'preload.js'),
    },
  })
  await win.loadURL(URL)
  await waitReady(win)
  record('shell-loaded', true)

  for (const route of ROUTES) {
    const clicked = await clickSidebarOrTop(win, route.label)
    await sleep(900)
    const ok = clicked && (await evalPage(win, route.probe))
    record(`route-${route.label.toLowerCase()}`, Boolean(ok), clicked ? 'probed' : 'nav-miss')
  }

  // Protected playback ownership after Music play attempt
  await clickSidebarOrTop(win, 'Music')
  await sleep(700)
  await evalPage(win, `() => {
    document.querySelector('.music-discover-song-row, .music-discover-featured-release-hit, .music-home-release-card, button[aria-label^="Play"]')?.click()
    return true
  }`)
  await sleep(2000)
  const media = await evalPage(win, `() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
  })`)
  record('protected-single-audio', media.audio <= 1, `audio=${media.audio}`)
  record('protected-single-video', media.video <= 1, `video=${media.video}`)

  await clickSidebarOrTop(win, 'Home')
  await sleep(600)
  await clickSidebarOrTop(win, 'Podcasts')
  await sleep(600)
  const afterNav = await evalPage(win, `() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
  })`)
  record('route-change-no-extra-media', afterNav.audio <= 1 && afterNav.video <= 1, `a=${afterNav.audio} v=${afterNav.video}`)

  console.log(`\nPhase8 family smoke: ${out.checks.filter((c) => c.ok).length} passed, ${out.failures.length} failed`)
  app.exit(out.failures.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error(e)
  app.exit(1)
}))
