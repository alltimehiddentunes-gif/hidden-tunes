#!/usr/bin/env node
/**
 * Music product organisation smoke — Songs/Albums/Artists above the fold,
 * tabs, bounded art, no PlayerWorkspace hijack.
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
const outDir = path.join(ROOT, 'docs', 'audits', 'music-page-product-rebuild')
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
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    const s = await evalPage(win, `() => ({
      sidebar: Boolean(document.querySelector('.sidebar')),
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
      player: Boolean(document.querySelector('[data-ht-persistent-player="true"], .tv-rail')),
    })`)
    if (s.sidebar && s.player && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  await evalPage(win, `() => {
    [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())?.click()
    return true
  }`)
  await sleep(1100)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-music-product-smoke-')))
  await waitUrl(URL)
  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    return fetchApprovedCatalog(p)
  })

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 600,
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
  await waitReady(win)
  await clickNav(win, 'Music')
  await sleep(1500)

  const snap = await evalPage(win, `() => {
    const vh = window.innerHeight
    const title = (document.querySelector('.music-discover-page-title')?.textContent || '').trim()
    const tabs = [...document.querySelectorAll('.music-tab, .music-sub-nav-item')].map((el) => (el.textContent || '').trim()).filter(Boolean)
    const sections = [...document.querySelectorAll('.music-page-section-header h2, .music-discover-page-title')].map((el) => {
      const r = el.getBoundingClientRect()
      return { t: (el.textContent || '').trim(), above: r.top >= 40 && r.top < vh - 100 }
    })
    const above = sections.filter((s) => s.above).map((s) => s.t)
    const arts = [...document.querySelectorAll('.music-art')].map((el) => Math.round(el.getBoundingClientRect().height))
    const maxArt = arts.reduce((m, h) => Math.max(m, h), 0)
    const songRows = document.querySelectorAll('.music-discover-song-row').length
    const albumCards = document.querySelectorAll('.music-discover-album-chip').length
    const artistCards = document.querySelectorAll('.music-discover-artist-chip').length
    const ph = document.querySelector('.home-top-search input, input[placeholder*="Search"]')?.placeholder || ''
    const pad = getComputedStyle(document.querySelector('.main-scroll')).paddingBottom
    return {
      title,
      tabs,
      above,
      sectionNames: sections.map((s) => s.t),
      maxArt,
      songRows,
      albumCards,
      artistCards,
      hasSongsSection: sections.some((s) => s.t === 'Songs'),
      hasAlbumsSection: sections.some((s) => s.t === 'Albums'),
      hasArtistsSection: sections.some((s) => s.t === 'Artists'),
      songsAbove: above.includes('Songs') || above.includes('Continue Listening'),
      placeholderOk: ph.includes('…') && !/[├ÔÇ]/.test(ph),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      workspaceBack: Boolean(document.querySelector('.player-workspace-back')),
      persistent: document.querySelectorAll('[data-ht-persistent-player="true"]').length,
      playerBar: document.querySelectorAll('.player-bar').length,
      bottomPad: pad,
      fullPageArt: Boolean(document.querySelector('.page-view[data-page="music"] .cinema-player-art-backdrop')),
    }
  }`)

  record('music-header', /^music$/i.test(snap.title), snap.title)
  record('search-utf8', snap.placeholderOk)
  record('tabs-present', snap.tabs.filter((t) => /discover|songs|albums|artists/i.test(t)).length >= 4, snap.tabs.join('|'))
  record('songs-section', snap.hasSongsSection)
  record('albums-section', snap.hasAlbumsSection)
  record('artists-section', snap.hasArtistsSection)
  record('songs-above-fold', snap.songsAbove, snap.above.join('|'))
  record('song-rows-visible', snap.songRows >= 3, `n=${snap.songRows}`)
  record('art-bounded', snap.maxArt > 0 && snap.maxArt <= 200, `max=${snap.maxArt}`)
  record('no-fullpage-art', !snap.fullPageArt)
  record('no-overflow', !snap.overflow)
  record('persistent-player', snap.persistent === 1)
  record('compact-player', snap.playerBar >= 1)
  record('bottom-clearance', parseFloat(snap.bottomPad) >= 64, snap.bottomPad)

  await evalPage(win, `() => { document.querySelector('.music-discover-song-row')?.click(); return true }`)
  await sleep(1200)
  const afterPlay = await evalPage(win, `() => ({
    discover: Boolean(document.querySelector('.music-discover')),
    workspace: Boolean(document.querySelector('.player-workspace-back')),
  })`)
  record('play-stays-on-music', afterPlay.discover && !afterPlay.workspace, JSON.stringify(afterPlay))

  win.setSize(1024, 768)
  await sleep(700)
  const at1024 = await evalPage(win, `() => {
    const vh = window.innerHeight
    const songs = [...document.querySelectorAll('.music-page-section-header h2')].some((el) => {
      const r = el.getBoundingClientRect()
      return el.textContent.trim() === 'Songs' && r.top < vh - 80
    })
    const player = document.querySelector('[data-ht-persistent-player="true"], .tv-rail')
    return {
      songsAbove: songs,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      playerVisible: Boolean(player) && player.getBoundingClientRect().width > 40,
      maxArt: [...document.querySelectorAll('.music-art')].reduce((m, el) => Math.max(m, el.getBoundingClientRect().height), 0),
    }
  }`)
  record('1024-songs-above-fold', at1024.songsAbove)
  record('1024-no-overflow', !at1024.overflow)
  record('1024-player', at1024.playerVisible)
  record('1024-art-bounded', at1024.maxArt <= 200, `max=${at1024.maxArt}`)

  fs.writeFileSync(path.join(outDir, 'smoke-music-product-layout.json'), JSON.stringify(out, null, 2))
  const code = out.failures.length ? 1 : 0
  console.log(code === 0 ? 'Music product layout smoke PASS' : `Music product layout smoke FAIL (${out.failures.length})`)
  app.exit(code)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
