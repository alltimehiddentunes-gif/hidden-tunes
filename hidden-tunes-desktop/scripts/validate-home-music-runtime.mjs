#!/usr/bin/env node
/**
 * Runtime validation for Home vs Music responsibility split.
 * Uses real Electron + Vite renderer (same shell path as npm run dev).
 *
 * Run (from hidden-tunes-desktop):
 *   node scripts/validate-home-music-runtime.mjs
 *
 * Requires Vite already serving http://localhost:5173
 *   or set HT_VALIDATE_START_VITE=1 to spawn it.
 */
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, session } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog } = require('../electron/catalogBridge.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'home-music-split', 'runtime-validation')
const RENDERER_URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const COMMIT = process.env.HT_VALIDATE_COMMIT || '60d813ab48d48f40b5fd5e8fbb129f42ba8e8a53'

const WIDTHS = [
  { name: '1440', width: 1440, height: 960 },
  { name: '1280', width: 1280, height: 860 },
  { name: '1024', width: 1024, height: 800 },
  { name: 'narrow', width: 900, height: 760 },
]

const results = {
  commit: COMMIT,
  runtime: 'electron + vite renderer',
  rendererUrl: RENDERER_URL,
  startedAt: new Date().toISOString(),
  catalogRequests: [],
  checks: [],
  failures: [],
  screenshots: [],
  playback: {},
  consoleErrors: [],
  consoleWarnings: [],
  notes: [],
}

function record(check, ok, detail = '') {
  results.checks.push({ check, ok, detail })
  if (!ok) results.failures.push({ check, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${check}${detail ? ` — ${detail}` : ''}`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForUrl(url, timeoutMs = 90_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { method: 'GET' })
      if (res.ok || res.status === 304) return
    } catch {
      // retry
    }
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function maybeStartVite() {
  if (process.env.HT_VALIDATE_START_VITE !== '1') {
    await waitForUrl(RENDERER_URL)
    return null
  }
  const child = spawn(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'dev:vite'],
    {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, FORCE_COLOR: '0' },
    },
  )
  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
  await waitForUrl(RENDERER_URL)
  return child
}

async function capture(win, filename) {
  const image = await win.webContents.capturePage()
  const target = path.join(EVIDENCE_DIR, filename)
  fs.writeFileSync(target, image.toPNG())
  results.screenshots.push(filename)
  return target
}

async function evalInPage(win, fnSource) {
  return win.webContents.executeJavaScript(`(${fnSource})()`, true)
}

async function waitForHomeReady(win, timeoutMs = 60_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const state = await evalInPage(win, `() => {
      const splash = document.querySelector('.launch-screen, #launch-splash, .app-shell-wrap--booting')
      const home = document.querySelector('.music-home, [aria-label="Home"]')
      const sidebar = document.querySelector('.sidebar')
      return {
        hasSplash: Boolean(splash && getComputedStyle(splash).display !== 'none' && splash.getBoundingClientRect().height > 40),
        hasHome: Boolean(home),
        hasSidebar: Boolean(sidebar),
        page: document.querySelector('.page-view')?.getAttribute('data-page') || null,
        nav: document.querySelector('.page-view')?.getAttribute('data-nav') || null,
        bodyText: document.body?.innerText?.slice(0, 120) || '',
      }
    }`)
    if (state.hasSidebar && (state.hasHome || state.page === 'home') && !state.hasSplash) {
      return state
    }
    await sleep(400)
  }
  throw new Error('Home UI did not become ready in time')
}

async function resize(win, width, height) {
  // Validation harness intentionally lowers product minWidth to exercise 1024/narrow.
  win.setMinimumSize(760, 600)
  win.setSize(width, height, false)
  await sleep(450)
  const [w, h] = win.getSize()
  return { w, h }
}

async function inspectHome(win) {
  return evalInPage(win, `() => {
    const root = document.querySelector('.music-home')
    const headings = [...document.querySelectorAll('.music-home h1, .music-home h2')].map((el) => el.textContent.trim())
    const forbidden = {
      hero: Boolean(document.querySelector('.music-home-hero')),
      recentlyAdded: headings.some((h) => /recently added/i.test(h)),
      artistsOnRepeat: headings.some((h) => /artists on repeat/i.test(h)),
      freshReleases: headings.some((h) => /fresh releases/i.test(h)),
      exploreSound: headings.some((h) => /explore your sound/i.test(h)),
      musicForFeel: headings.some((h) => /music for how you feel/i.test(h)),
      collections: headings.some((h) => /collections worth playing/i.test(h)),
      exploreMoreGrid: Boolean(document.querySelector('.music-home-explore-grid')),
      filterBtn: Boolean(document.querySelector('.home-top-filter-btn')),
    }
    const recentCards = document.querySelectorAll('.music-home [aria-labelledby*="recently-played"] .music-home-song-card, #music-home-recently-played ~ * .music-home-song-card')
    // Prefer counting by section id
    const recentSection = document.getElementById('music-home-recently-played')?.closest('section')
    const recentCount = recentSection ? recentSection.querySelectorAll('.music-home-song-card').length : 0
    const mixCount = document.querySelectorAll('.music-home-mix-card').length
    const jumpChips = document.querySelectorAll('.music-home-jump-chip').length
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    const sidebar = Boolean(document.querySelector('.sidebar'))
    const playerBar = Boolean(document.querySelector('.player-bar, [class*="player-bar"]'))
    return {
      headings,
      forbidden,
      recentCount,
      mixCount,
      jumpChips,
      overflowX,
      sidebar,
      playerBar,
      hasRoot: Boolean(root),
    }
  }`)
}

async function inspectMusic(win) {
  return evalInPage(win, `() => {
    const discover = document.querySelector('.music-discover')
    const headings = [...document.querySelectorAll('.music-discover h1, .music-discover h2, .music-page-section h2')].map((el) => el.textContent.trim())
    const subNavLabels = [...document.querySelectorAll('.music-sub-nav-item span')].map((el) => el.textContent.trim())
    const forbidden = {
      homeHero: Boolean(document.querySelector('.music-discover-hero, .music-home-hero')),
      myMix: /my music mix/i.test(document.body.innerText) && Boolean(document.querySelector('.music-discover-mix-panel')),
      madeForYou: headings.some((h) => /made for your listening|made for you/i.test(h)),
      recentlyPlayed: headings.some((h) => /recently played/i.test(h)),
      hiddenGems: headings.some((h) => /hidden gems/i.test(h)),
      downloadsInSubNav: subNavLabels.some((l) => /downloads/i.test(l)),
    }
    const sidebar = Boolean(document.querySelector('.sidebar'))
    const subNav = Boolean(document.querySelector('.music-sub-nav'))
    const featured = Boolean(document.querySelector('.music-discover-featured-release'))
    const browseLinks = document.querySelectorAll('.music-discover-browse-link').length
    const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
    const shellHidesSidebar = document.querySelector('.app-shell')?.classList.contains('app-shell--music')
    return {
      headings,
      subNavLabels,
      forbidden,
      sidebar,
      subNav,
      featured,
      browseLinks,
      overflowX,
      shellHidesSidebar,
      hasDiscover: Boolean(discover),
      appShellClass: document.querySelector('.app-shell')?.className || '',
    }
  }`)
}

async function clickSidebarNav(win, label) {
  const clicked = await evalInPage(win, `() => {
    const items = [...document.querySelectorAll('.sidebar .nav-item, .global-top-nav-link')]
    const target = items.find((el) => (el.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    if (!target) return { ok: false, reason: 'not found' }
    target.click()
    return { ok: true, text: target.textContent.trim() }
  }`)
  await sleep(700)
  return clicked
}

async function clickFirst(win, selector) {
  return evalInPage(win, `() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return { ok: false }
    el.click()
    return { ok: true, label: el.getAttribute('aria-label') || el.textContent?.trim()?.slice(0, 80) || '' }
  }`)
}

async function readPlayback(win) {
  return evalInPage(win, `() => {
    const audios = [...document.querySelectorAll('audio')]
    const videos = [...document.querySelectorAll('video')]
    const playingAudio = audios.find((a) => !a.paused && !a.ended)
    const bar = document.querySelector('.player-bar, [class*="PlayerBar"], footer')
    return {
      audioCount: audios.length,
      videoCount: videos.length,
      playing: Boolean(playingAudio),
      currentTime: playingAudio ? playingAudio.currentTime : null,
      paused: playingAudio ? playingAudio.paused : null,
      src: playingAudio ? (playingAudio.currentSrc || playingAudio.src || '').slice(0, 120) : null,
      playerBarVisible: Boolean(bar),
      titleHint: document.querySelector('.player-bar, [class*="player"]')?.textContent?.slice(0, 160) || '',
    }
  }`)
}

async function countProviders(win) {
  return evalInPage(win, `() => {
    // Heuristic: provider is React context — count audio/video + catalog status presence.
    return {
      audio: document.querySelectorAll('audio').length,
      video: document.querySelectorAll('video').length,
    }
  }`)
}

async function seedHistory(win) {
  return evalInPage(win, `() => {
    // Discover keys used by music progress storage.
    const keys = Object.keys(localStorage)
    return { keys: keys.filter((k) => /music|recent|progress|history|ht-/i.test(k)) }
  }`)
}

async function clearMusicLocalState(win) {
  return evalInPage(win, `() => {
    const removed = []
    for (const key of Object.keys(localStorage)) {
      if (/music|recent|progress|history|continue|ht-music|liked/i.test(key)) {
        localStorage.removeItem(key)
        removed.push(key)
      }
    }
    return { removed }
  }`)
}

async function interceptCatalogNetwork(ses) {
  const counts = { songs: 0, albums: 0, artists: 0, other: 0, total: 0 }
  ses.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
    const url = details.url || ''
    if (!/hidden-tunes-api|onrender\.com|hiddentunes\.com/i.test(url)) return
    if (!/\/api\//i.test(url)) return
    counts.total += 1
    if (/songs/i.test(url)) counts.songs += 1
    else if (/albums/i.test(url)) counts.albums += 1
    else if (/artists/i.test(url)) counts.artists += 1
    else counts.other += 1
    results.catalogRequests.push({ url: url.slice(0, 160), time: Date.now() })
  })
  return counts
}

async function runValidation() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-home-music-validate-'))
  app.setPath('userData', userData)
  results.notes.push(`Isolated userData: ${userData}`)

  let viteChild = null
  try {
    viteChild = await maybeStartVite()
  } catch (error) {
    record('vite-ready', false, String(error))
    throw error
  }
  record('vite-ready', true, RENDERER_URL)

  ipcMain.handle('ht-catalog-get', async (_event, catalogPath) => {
    const cleanPath = typeof catalogPath === 'string' ? catalogPath.trim() : ''
    if (!cleanPath.startsWith('/api/')) throw new Error('Catalog path is not allowed.')
    results.catalogRequests.push({ via: 'ipc', path: cleanPath, time: Date.now() })
    return fetchApprovedCatalog(cleanPath)
  })

  const networkCounts = await interceptCatalogNetwork(session.defaultSession)

  const win = new BrowserWindow({
    title: 'Hidden Tunes Desktop — Home/Music Validation',
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#050508',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, 'electron', 'preload.js'),
    },
  })

  win.webContents.on('console-message', (_e, level, message) => {
    const entry = { level, message: String(message).slice(0, 300) }
    if (level >= 2) results.consoleErrors.push(entry)
    else if (level === 1) results.consoleWarnings.push(entry)
  })

  await win.loadURL(RENDERER_URL)
  record('electron-renderer-load', true, RENDERER_URL)

  await waitForHomeReady(win)
  record('home-ready', true)

  // --- Home screenshots + DOM ---
  for (const size of WIDTHS) {
    const actual = await resize(win, size.width, size.height)
    await clickSidebarNav(win, 'Home')
    await sleep(500)
    const home = await inspectHome(win)
    await capture(win, `home-${size.name}.png`)
    record(`home-sidebar-${size.name}`, home.sidebar)
    record(`home-no-overflow-${size.name}`, !home.overflowX, `scrollWidth check`)
    record(`home-no-hero-${size.name}`, !home.forbidden.hero)
    record(`home-no-catalog-rails-${size.name}`,
      !home.forbidden.recentlyAdded
      && !home.forbidden.artistsOnRepeat
      && !home.forbidden.freshReleases
      && !home.forbidden.exploreSound
      && !home.forbidden.musicForFeel
      && !home.forbidden.collections
      && !home.forbidden.exploreMoreGrid,
      JSON.stringify(home.forbidden),
    )
    record(`home-no-filter-${size.name}`, !home.forbidden.filterBtn)
    record(`home-jump-in-${size.name}`, home.jumpChips >= 5, `chips=${home.jumpChips}`)
    if (home.recentCount > 0) {
      record(`home-recent-max-8-${size.name}`, home.recentCount <= 8, `count=${home.recentCount}`)
    }
    if (home.mixCount > 0) {
      record(`home-mix-max-3-${size.name}`, home.mixCount <= 3, `count=${home.mixCount}`)
    }
    results.notes.push(`home-${size.name} headings: ${home.headings.join(' | ')} (window ${actual.w}x${actual.h})`)
  }

  // --- Music screenshots + DOM ---
  for (const size of WIDTHS) {
    await resize(win, size.width, size.height)
    await clickSidebarNav(win, 'Music')
    await sleep(800)
    const music = await inspectMusic(win)
    await capture(win, `music-${size.name}.png`)
    record(`music-sidebar-visible-${size.name}`, music.sidebar, music.appShellClass)
    record(`music-subnav-present-${size.name}`, music.subNav)
    record(`music-no-downloads-tab-${size.name}`, !music.forbidden.downloadsInSubNav, music.subNavLabels.join(','))
    record(`music-no-home-personalization-${size.name}`,
      !music.forbidden.homeHero
      && !music.forbidden.myMix
      && !music.forbidden.madeForYou
      && !music.forbidden.recentlyPlayed
      && !music.forbidden.hiddenGems,
      JSON.stringify(music.forbidden),
    )
    record(`music-no-overflow-${size.name}`, !music.overflowX)
    record(`music-browse-links-${size.name}`, music.browseLinks >= 3, `links=${music.browseLinks}`)
    results.notes.push(`music-${size.name} headings: ${music.headings.join(' | ')}`)
  }

  // Restore comfortable size for playback
  await resize(win, 1440, 960)
  await clickSidebarNav(win, 'Home')
  await sleep(600)

  // Seed play from Made for You or Hidden Gems or Jump→Music featured
  let playClick = await clickFirst(win, '.music-home-mix-hit, .music-home-song-card, .music-home-continue-hit')
  if (!playClick.ok) {
    await clickSidebarNav(win, 'Music')
    await sleep(600)
    playClick = await clickFirst(win, '.music-discover-featured-release-hit, .music-discover-release-hit, .music-discover-song-chip')
  }
  record('playback-start-click', playClick.ok, playClick.label || playClick.reason || '')
  await sleep(2500)
  let beforeNav = await readPlayback(win)
  record('playback-started', beforeNav.playing || beforeNav.audioCount >= 1, JSON.stringify(beforeNav))
  results.playback.startedFrom = playClick.label
  results.playback.beforeNav = beforeNav

  const t0 = beforeNav.currentTime
  await sleep(1500)

  // Navigation while potentially playing
  const navPath = ['Music', 'Home', 'Music']
  for (const label of navPath) {
    await clickSidebarNav(win, label)
    await sleep(700)
  }
  // Deep music sections via SubNav
  await clickSidebarNav(win, 'Music')
  await sleep(400)
  for (const section of ['Artists', 'Albums', 'Songs', 'Discover']) {
    await evalInPage(win, `() => {
      const btn = [...document.querySelectorAll('.music-sub-nav-item')].find((el) => (el.textContent || '').includes('${section}'))
      btn?.click()
      return Boolean(btn)
    }`)
    await sleep(600)
  }
  await clickSidebarNav(win, 'Home')
  await sleep(700)
  await capture(win, 'playback-home-to-music.png')

  const afterNav = await readPlayback(win)
  results.playback.afterNav = afterNav
  const elements = await countProviders(win)
  record('single-audio-element', elements.audio <= 1, `audio=${elements.audio}`)
  record('single-video-element', elements.video <= 1, `video=${elements.video}`)
  if (beforeNav.playing) {
    record('playback-survived-navigation', afterNav.playing || afterNav.audioCount === 1, JSON.stringify(afterNav))
    if (typeof t0 === 'number' && typeof afterNav.currentTime === 'number') {
      record('playback-time-advanced-or-stable', afterNav.currentTime >= t0 - 0.5, `t0=${t0} t1=${afterNav.currentTime}`)
    }
  } else {
    results.notes.push('Playback may not have started (catalog stream/CORS). Continuity checks limited.')
  }

  // Start a different track from Music
  await clickSidebarNav(win, 'Music')
  await sleep(500)
  const second = await clickFirst(win, '.music-discover-chart-hit, .music-discover-mood-hit, .music-discover-release-hit')
  await sleep(2000)
  const afterSecond = await readPlayback(win)
  results.playback.secondTrack = { click: second, state: afterSecond }
  record('music-second-play-click', second.ok, second.label || '')

  // Catalog request observation after Home↔Music
  const beforeRoundTrip = results.catalogRequests.length
  await clickSidebarNav(win, 'Home')
  await sleep(800)
  await clickSidebarNav(win, 'Music')
  await sleep(800)
  await clickSidebarNav(win, 'Home')
  await sleep(800)
  const afterRoundTrip = results.catalogRequests.length
  record(
    'no-duplicate-catalog-fetch-on-nav',
    afterRoundTrip - beforeRoundTrip <= 2,
    `delta=${afterRoundTrip - beforeRoundTrip} total=${results.catalogRequests.length} network=${JSON.stringify(networkCounts)}`,
  )

  // Empty-history Home (isolated profile — clear local keys then reload)
  const keysBefore = await seedHistory(win)
  results.notes.push(`localStorage music-ish keys before clear: ${JSON.stringify(keysBefore.keys)}`)
  await clearMusicLocalState(win)
  await win.reload()
  await waitForHomeReady(win)
  await resize(win, 1440, 960)
  await clickSidebarNav(win, 'Home')
  await sleep(800)
  const emptyHome = await inspectHome(win)
  await capture(win, 'home-empty-history.png')
  record('empty-home-no-hero', !emptyHome.forbidden.hero)
  record('empty-home-jump-in', emptyHome.jumpChips >= 5, `chips=${emptyHome.jumpChips}`)
  record('empty-home-no-explore-grid', !emptyHome.forbidden.exploreMoreGrid)
  const hasUseful = emptyHome.headings.some((h) => /made for you|hidden gems|jump in/i.test(h))
  record('empty-home-useful-content', hasUseful, emptyHome.headings.join(' | '))

  // Write report JSON
  results.finishedAt = new Date().toISOString()
  results.networkCounts = networkCounts
  results.passCount = results.checks.filter((c) => c.ok).length
  results.failCount = results.failures.length
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'results.json'), JSON.stringify(results, null, 2))

  if (viteChild) {
    viteChild.kill()
  }

  const code = results.failCount > 0 ? 1 : 0
  console.log(`\nValidation complete: ${results.passCount} passed, ${results.failCount} failed`)
  console.log(`Evidence: ${EVIDENCE_DIR}`)
  app.exit(code)
}

app.whenReady().then(() => {
  runValidation().catch((error) => {
    console.error('Validation crashed:', error)
    results.failures.push({ check: 'harness', detail: String(error) })
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
    fs.writeFileSync(path.join(EVIDENCE_DIR, 'results.json'), JSON.stringify(results, null, 2))
    app.exit(1)
  })
})
