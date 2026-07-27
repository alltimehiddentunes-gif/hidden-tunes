#!/usr/bin/env node
/**
 * Capture Home before/after screenshots + art-frame diagnostics.
 * Usage: npx electron scripts/capture-home-content-first.mjs [BEFORE|AFTER]
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog } = require('../electron/catalogBridge.js')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LABEL = (process.argv[2] || 'SHOT').toUpperCase()
const outDir = path.join(ROOT, 'docs', 'audits', 'home-content-first')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
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

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(require('os').tmpdir(), 'ht-home-shot-')))
  await waitUrl(URL)
  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    return fetchApprovedCatalog(p)
  })

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#050508',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, 'electron', 'preload.js'),
    },
  })

  await win.loadURL(URL)
  for (let i = 0; i < 80; i += 1) {
    const ready = await win.webContents.executeJavaScript(`(() => {
      const home = Boolean(document.querySelector('.music-home'))
      const splash = Boolean(document.querySelector('.launch-screen, #launch-splash'))
      return home && !splash
    })()`)
    if (ready) break
    await sleep(400)
  }

  await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === 'home')
    el?.click()
    return Boolean(el)
  })()`)
  await sleep(1800)

  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('.music-home-hero-card-hit, .music-home-song-card, .music-home-all-songs-row')?.click()
    return true
  })()`)
  await sleep(2200)

  await win.webContents.executeJavaScript(`(() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === 'home')
    el?.click()
    return Boolean(el)
  })()`)
  await sleep(900)

  const diag = await win.webContents.executeJavaScript(`(() => {
    const page = document.querySelector('.page-view[data-page="home"]')
    const pageRect = page?.getBoundingClientRect()
    const frames = [...document.querySelectorAll('.music-home .art-frame')].slice(0, 12).map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        pos: cs.position,
        top: Math.round(r.top),
        left: Math.round(r.left),
        fillsPage: Boolean(pageRect) && r.height > (pageRect.height * 0.55),
      }
    })
    const giant = frames.some((f) => f.fillsPage || f.h > 500)
    return {
      sections: [...document.querySelectorAll('.music-home h2')].map((h) => h.textContent.trim()),
      search: Boolean(document.querySelector('.music-home-search-launcher')),
      hero: Boolean(document.querySelector('.music-home-hero-carousel')),
      heroMaxH: (() => {
        const el = document.querySelector('.music-home-hero-carousel')
        return el ? Math.round(el.getBoundingClientRect().height) : 0
      })(),
      giantArtFrames: giant,
      frames,
      player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
      sidebar: Boolean(document.querySelector('.sidebar')),
    }
  })()`)

  const shotPath = path.join(outDir, `${LABEL}.png`)
  const img = await win.capturePage()
  fs.writeFileSync(shotPath, img.toPNG())
  fs.writeFileSync(path.join(outDir, `${LABEL}-diag.json`), JSON.stringify(diag, null, 2))
  console.log(`${LABEL}: ${shotPath}`)
  console.log(JSON.stringify(diag, null, 2))
  app.exit(diag.giantArtFrames ? 2 : 0)
}

app.whenReady().then(() => main().catch((err) => {
  console.error(err)
  app.exit(1)
}))
