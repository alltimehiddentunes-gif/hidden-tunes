#!/usr/bin/env node
/**
 * Catalog + runtime smoke against Vite :5173 (isolated userData).
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
const outDir = path.join(ROOT, 'docs', 'audits', 'catalog-runtime-config')
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
  const clicked = await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    el?.click()
    return Boolean(el)
  }`)
  await sleep(900)
  return clicked
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-catalog-smoke-'))
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
  record('loaded', true)

  // Home + player intact
  await clickNav(win, 'Home')
  const home = await evalPage(win, `() => ({
    home: Boolean(document.querySelector('.music-home')),
    player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
    topRoutes: document.querySelectorAll('.global-top-nav-link').length,
    audio: document.querySelectorAll('audio').length,
  })`)
  record('home-intact', home.home)
  record('persistent-player-intact', home.player)
  record('no-duplicate-top-routes', home.topRoutes === 0)
  record('single-audio', home.audio <= 1, `audio=${home.audio}`)

  // Music catalog
  await clickNav(win, 'Music')
  await sleep(1500)
  const music = await evalPage(win, `() => {
    const cards = document.querySelectorAll('.music-discover-release-hit, .music-discover-chart-hit, .music-home-song-card, .card, [class*="song"], .music-section-card, .api-song-card, button')
    const showMore = [...document.querySelectorAll('button')].find((b) => /show more|load more/i.test(b.textContent || ''))
    return {
      workspace: Boolean(document.querySelector('.music-destination, .music-workspace, .music-discover')),
      showMore: Boolean(showMore),
      permanentSpinner: Boolean(document.querySelector('.catalog-skeleton')) && !document.querySelector('.music-destination, .music-discover, .page-view'),
    }
  }`)
  record('music-workspace', music.workspace)
  record('music-no-permanent-spinner', !music.permanentSpinner)

  if (music.showMore) {
    await evalPage(win, `() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /show more|load more/i.test(b.textContent || ''))
      btn?.click()
      return Boolean(btn)
    }`)
    await sleep(1200)
    record('music-load-more-clicked', true)
  } else {
    record('music-load-more-optional', true, 'no show-more control visible yet')
  }

  // Search route
  await clickNav(win, 'Search')
  await sleep(700)
  const search = await evalPage(win, `() => ({
    input: Boolean(document.querySelector('input[type="search"], .search-bar input, .home-top-search input, input')),
  })`)
  record('search-input', search.input)

  // Sequential search-ish focus churn (performance)
  for (let i = 0; i < 10; i += 1) {
    await evalPage(win, `() => {
      const input = document.querySelector('input[type="search"], .search-bar input, .home-top-search input, input')
      if (!input) return false
      input.focus()
      input.value = 'q' + ${i}
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    }`)
    await sleep(120)
  }
  const afterSearch = await evalPage(win, `() => ({
    audio: document.querySelectorAll('audio').length,
    crash: !document.querySelector('.sidebar'),
  })`)
  record('search-churn-stable', !afterSearch.crash && afterSearch.audio <= 1, `audio=${afterSearch.audio}`)

  // Play while on music
  await clickNav(win, 'Music')
  await sleep(600)
  await evalPage(win, `() => {
    document.querySelector('.music-discover-featured-release-hit, .music-discover-release-hit, .music-discover-chart-hit, .music-home-song-card, .music-home-mix-hit')?.click()
    return true
  }`)
  await sleep(1800)
  const playing = await evalPage(win, `() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
    idle: document.querySelector('[data-ht-persistent-player="true"]')?.getAttribute('data-idle'),
  })`)
  record('playback-single-audio', playing.audio <= 1, `audio=${playing.audio}`)
  record('playback-single-video', playing.video <= 1, `video=${playing.video}`)

  // Route smoke
  for (const page of ['Radio', 'Podcasts', 'TV', 'Sports', 'Audiobooks', 'Library', 'Downloads', 'History']) {
    const okNav = await clickNav(win, page)
    record(`nav-${page.toLowerCase()}`, okNav)
  }

  // Layout still ok at 1024
  win.setSize(1024, 800)
  await sleep(400)
  await clickNav(win, 'Home')
  const narrow = await evalPage(win, `() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
  })`)
  record('1024-no-overflow', !narrow.overflow)
  record('1024-player-visible', narrow.player)

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'runtime-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nCatalog smoke: ${out.checks.filter((c) => c.ok).length} passed, ${out.failures.length} failed`)
  app.exit(out.failures.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error(e)
  app.exit(1)
}))
