#!/usr/bin/env node
/**
 * Capture Home screenshots + metrics at multiple widths.
 * Usage: npx electron scripts/capture-home-premium-polish.mjs BEFORE|AFTER
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
const outDir = path.join(ROOT, 'docs', 'audits', 'home-premium-polish')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WIDTHS = [
  { key: '1024', width: 1024, height: 768 },
  { key: '1280', width: 1280, height: 800 },
  { key: '1440', width: 1440, height: 900 },
  { key: 'LARGE', width: 1720, height: 950 },
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

async function waitHome(win) {
  for (let i = 0; i < 80; i += 1) {
    const ready = await evalPage(win, `() => {
      const home = Boolean(document.querySelector('.music-home'))
      const splash = Boolean(document.querySelector('.launch-screen, #launch-splash'))
      return home && !splash
    }`)
    if (ready) return
    await sleep(400)
  }
  throw new Error('Home not ready')
}

async function goHome(win) {
  await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === 'home')
    el?.click()
    return Boolean(el)
  }`)
  await sleep(700)
}

async function metrics(win) {
  return evalPage(win, `() => {
    const home = document.querySelector('.music-home')
    const main = document.querySelector('.main-scroll, .main-area')
    const centre = document.querySelector('.page-view, .content-inner, .music-home')
    const player = document.querySelector('[data-ht-persistent-player="true"]')
    const hero = document.querySelector('.music-home-hero-carousel')
    const footer = document.querySelector('.player-bar')
    const sections = [...document.querySelectorAll('.music-home h2')].map((h) => h.textContent.trim())
    const vh = window.innerHeight
    const aboveFold = [...document.querySelectorAll('.music-home h2, .music-home-search-launcher, .music-home-hero-carousel, .music-home-family-grid, .music-home-signal-row, .music-home-listening-brief')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.top < vh - 80 && r.bottom > 80
      })
      .map((el) => el.tagName === 'H2' ? el.textContent.trim() : (el.getAttribute('aria-label') || el.className.split(' ')[0]))

    const cardSamples = {}
    for (const [name, sel] of [
      ['hero', '.music-home-hero-card'],
      ['song', '.music-home-song-card'],
      ['family', '.music-home-family-card'],
      ['room', '.music-home-room-card'],
      ['artist', '.music-home-artist-card'],
    ]) {
      const el = document.querySelector(sel)
      if (!el) continue
      const r = el.getBoundingClientRect()
      cardSamples[name] = { w: Math.round(r.width), h: Math.round(r.height) }
    }

    const artFrames = [...document.querySelectorAll('.music-home .art-frame')].map((el) => {
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), fills: r.height > 500 }
    })

    const homeStyle = home ? getComputedStyle(home) : null
    const gap = homeStyle ? homeStyle.gap || homeStyle.rowGap : null

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      sections,
      aboveFold,
      hero: hero ? (() => {
        const r = hero.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      })() : null,
      centre: centre ? (() => {
        const r = centre.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      })() : null,
      player: player ? (() => {
        const r = player.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 40 }
      })() : null,
      footer: footer ? (() => {
        const r = footer.getBoundingClientRect()
        return { h: Math.round(r.height), visible: r.height > 20 }
      })() : null,
      cardSamples,
      homeGap: gap,
      giantArt: artFrames.some((f) => f.fills),
      maxArtH: artFrames.reduce((m, f) => Math.max(m, f.h), 0),
      playerWorkspace: Boolean(document.querySelector('.player-workspace-back, .main-scroll--player-workspace')),
      contentFirst: Boolean(document.querySelector('[data-home-layout="content-first"]')),
      bottomPad: home ? getComputedStyle(home).paddingBottom : null,
    }
  }`)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-home-polish-')))
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
  await waitHome(win)
  await goHome(win)
  await sleep(1200)

  const report = { label: LABEL, widths: {} }

  for (const spec of WIDTHS) {
    win.setMinimumSize(760, 600)
    win.setSize(spec.width, spec.height)
    await sleep(500)
    await goHome(win)
    await sleep(400)
    const snap = await metrics(win)
    report.widths[spec.key] = snap
    const file = path.join(outDir, `${LABEL}-${spec.key}.png`)
    const img = await win.capturePage()
    fs.writeFileSync(file, img.toPNG())
    console.log(`${LABEL}-${spec.key}: hero=${snap.hero?.h} overflow=${snap.overflow} giant=${snap.giantArt} above=${(snap.aboveFold || []).join('|')}`)
  }

  fs.writeFileSync(path.join(outDir, `${LABEL}-metrics.json`), JSON.stringify(report, null, 2))
  console.log(`Wrote ${LABEL}-metrics.json`)
  app.exit(0)
}

app.whenReady().then(() => main().catch((err) => {
  console.error(err)
  app.exit(1)
}))
