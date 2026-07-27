#!/usr/bin/env node
/**
 * Capture Music product-rebuild BEFORE/AFTER screenshots.
 * Usage: npx electron scripts/capture-music-product-rebuild.mjs BEFORE|AFTER
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
const LABEL = (process.argv[2] || 'SHOT').toUpperCase()
const outDir = path.join(ROOT, 'docs', 'audits', 'music-page-product-rebuild')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WIDTHS = [
  { key: '-1024', width: 1024, height: 768 },
  { key: '-1280', width: 1280, height: 800 },
  { key: '-1440', width: 1440, height: 900 },
  { key: '-LARGE', width: 1720, height: 950 },
]

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

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-music-product-')))
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
    const ready = await evalPage(win, `() => Boolean(document.querySelector('.sidebar')) && !document.querySelector('.launch-screen')`)
    if (ready) break
    await sleep(400)
  }

  const report = { label: LABEL, widths: {} }

  for (const spec of WIDTHS) {
    win.setMinimumSize(760, 600)
    win.setSize(spec.width, spec.height)
    await sleep(400)
    await evalPage(win, `() => {
      [...document.querySelectorAll('.sidebar .nav-item')].find((n) => (n.textContent || '').trim().toLowerCase() === 'music')?.click()
      return true
    }`)
    await sleep(1800)

    const snap = await evalPage(win, `() => {
      const vh = window.innerHeight
      const sections = [...document.querySelectorAll('.music-page-section-header h2, .music-section-page-header h1, .music-discover-page-title')]
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { t: (el.textContent || '').trim(), top: Math.round(r.top), aboveFold: r.top < vh - 80 && r.bottom > 60 }
        })
      const frames = [...document.querySelectorAll('.music-art, .music-workspace .art-frame')].map((el) => {
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      })
      const songRows = document.querySelectorAll('.music-discover-song-row, .music-discover-song-chip').length
      const albumCards = document.querySelectorAll('.music-discover-album-chip, .music-discover-release-card').length
      const artistCards = document.querySelectorAll('.music-discover-artist-chip').length
      const input = document.querySelector('.home-top-search input, input[placeholder*="Search"]')
      const player = document.querySelector('[data-ht-persistent-player="true"], .tv-rail')
      const main = document.querySelector('.music-workspace-content, .music-discover')
      const subnav = document.querySelector('.music-sub-nav')
      return {
        sections,
        aboveFoldSections: sections.filter((s) => s.aboveFold).map((s) => s.t),
        maxArt: frames.reduce((m, f) => Math.max(m, f.h), 0),
        songRows,
        albumCards,
        artistCards,
        placeholder: input?.placeholder || '',
        playerW: player ? Math.round(player.getBoundingClientRect().width) : 0,
        mainW: main ? Math.round(main.getBoundingClientRect().width) : 0,
        subnavW: subnav ? Math.round(subnav.getBoundingClientRect().width) : 0,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        header: (document.querySelector('.music-discover-page-title')?.textContent || '').trim(),
      }
    }`)
    report.widths[spec.key] = snap
    const file = path.join(outDir, `${LABEL}${spec.key}.png`)
    fs.writeFileSync(file, (await win.capturePage()).toPNG())
    console.log(`${LABEL}${spec.key}: aboveFold=${snap.aboveFoldSections.join('|')} maxArt=${snap.maxArt} songs=${snap.songRows} albums=${snap.albumCards} artists=${snap.artistCards} mainW=${snap.mainW} playerW=${snap.playerW}`)
  }

  fs.writeFileSync(path.join(outDir, `${LABEL}-metrics.json`), JSON.stringify(report, null, 2))
  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
