#!/usr/bin/env node
/**
 * Capture shared Hidden Tunes global background visual proof across destinations.
 * Requires Vite on :5173. Writes PNGs under docs/audits/global-background/.
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
const outDir = path.join(ROOT, 'docs', 'audits', 'global-background')

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
      backdrop: Boolean(document.querySelector('[data-ht-global-backdrop=\"true\"]')),
      player: Boolean(document.querySelector('[data-ht-persistent-player=\"true\"], .tv-rail')),
    })`)
    if (s.sidebar && s.player && s.backdrop && !s.splash) return s
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    el?.click()
    return Boolean(el)
  }`)
  await sleep(1000)
}

async function capture(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  console.log(`SHOT: ${file}`)
  return file
}

async function probeBackdrop(win) {
  return evalPage(win, `() => {
    const el = document.querySelector('[data-ht-global-backdrop=\"true\"]')
    if (!el) return { present: false }
    const base = el.querySelector('.ht-global-backdrop__base')
    const cs = base ? getComputedStyle(base) : null
    const main = document.querySelector('.main-area')
    const mainBg = main ? getComputedStyle(main).backgroundImage + '|' + getComputedStyle(main).backgroundColor : null
    return {
      present: true,
      count: document.querySelectorAll('[data-ht-global-backdrop=\"true\"]').length,
      baseBackground: cs?.backgroundImage || cs?.backgroundColor || null,
      mainAreaBackground: mainBg,
    }
  }`)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-global-bg-'))
  app.setPath('userData', userData)

  await waitUrl(URL)

  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    return fetchApprovedCatalog(p)
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
  ipcMain.handle('ht-downloads-start', async () => ({ ok: false, error: 'unavailable in screenshot capture' }))
  ipcMain.handle('ht-downloads-pause', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-resume', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-cancel', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-remove', async () => ({ ok: false }))

  await app.whenReady()

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#030008',
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  await win.loadURL(URL)
  await waitReady(win)
  const probe = await probeBackdrop(win)
  fs.writeFileSync(path.join(outDir, 'backdrop-probe.json'), JSON.stringify(probe, null, 2))
  console.log('PROBE:', JSON.stringify(probe))

  const shots = [
    ['Library', '03-library'],
    ['Radio', '04-radio'],
    ['Podcasts', '05-podcasts'],
    ['Audiobooks', '06-audiobooks'],
    ['TV', '07-tv'],
    ['Sports', '08-sports'],
    ['Motivationals', '09-motivationals'],
    ['Search', '10-search'],
    ['History', '11-queue-history'],
    ['Music', '12-music-category'],
    ['Emotional Worlds', '12b-emotional-worlds'],
  ]

  await clickNav(win, 'Home')
  await capture(win, '01-home')
  await capture(win, '02-player-sidebar')

  for (const [nav, name] of shots) {
    await clickNav(win, nav)
    await capture(win, name)
  }

  await clickNav(win, 'Lectures')
  await capture(win, '09b-lectures')

  // Reduced-width window
  win.setSize(1100, 720)
  await sleep(600)
  await clickNav(win, 'Home')
  await capture(win, '13-reduced-width')

  console.log('DONE')
  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
