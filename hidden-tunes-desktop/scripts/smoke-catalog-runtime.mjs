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
const {
  fetchApprovedCatalog,
  fetchApprovedCatalogRequest,
} = require('../electron/catalogBridge.js')
const { DownloadManager } = require('../electron/downloads')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outDir = path.join(ROOT, 'docs', 'audits', 'catalog-runtime-config')
const out = { checks: [], failures: [], requests: [], routes: [], screenshots: [] }

function payloadCount(payload) {
  if (Array.isArray(payload)) return payload.length
  if (!payload || typeof payload !== 'object') return 0
  for (const key of ['items', 'songs', 'albums', 'artists', 'stations', 'shows', 'episodes', 'videos', 'channels', 'audiobooks', 'books', 'programs', 'categories', 'fixtures']) {
    if (Array.isArray(payload[key])) return payload[key].length
  }
  return 0
}

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
      root: Boolean(document.querySelector('#root')?.firstElementChild),
      sidebar: Boolean(document.querySelector('.sidebar')),
      route: Boolean(document.querySelector('.page-view, main, [data-page], [data-nav]')),
      bridge: typeof window.hiddenTunesDesktop?.catalog?.getJson === 'function'
        && typeof window.hiddenTunesDesktop?.catalog?.requestJson === 'function',
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
    })`)
    if (s.root && s.sidebar && s.route && s.bridge && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  const clicked = await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item, .global-top-nav-link')]
      .find((n) => {
        const text = (n.querySelector('span')?.textContent || n.textContent || '')
          .replace(/\\s+/g, ' ')
          .trim()
          .toLowerCase()
        return text === '${label}'.toLowerCase()
      })
    el?.click()
    return Boolean(el)
  }`)
  await sleep(900)
  return clicked
}

async function captureRoute(win, label, sizeLabel = '1440x900') {
  const selectors = {
    Home: '.music-home-song-card, .music-home-mix-card, .music-home-explore-card',
    Music: '.music-discover-release-hit, .music-discover-chart-hit, .music-home-song-card, .api-song-card',
    Radio: '.radio-station-card-v2',
    Podcasts: '.podcast-featured-card',
    TV: '.tv-station-card:not(.tv-station-card--skeleton)',
    Sports: '.sports-fixture-card:not(.sports-fixture-card--skeleton)',
    Audiobooks: '.audiobook-book-card',
    Motivationals: '.motivationals-program-card',
    Lectures: '.lectures-program-card:not(.lectures-program-card--skeleton)',
    Search: '.psd-search-song-row, .psd-search-side-row',
  }
  const selector = selectors[label] || ''
  const state = await evalPage(win, `() => {
    const selector = ${JSON.stringify(selector)}
    const body = document.body?.innerText || ''
    return {
      rendered: selector ? document.querySelectorAll(selector).length : 0,
      loading: /loading|updating/i.test(body) && Boolean(document.querySelector('[aria-busy="true"], [class*="skeleton"]')),
      error: document.querySelector('[role="alert"]')?.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 240) || '',
      emptyOrDisabled: [...document.querySelectorAll('[role="status"], main p, .page-view p')]
        .map((node) => (node.textContent || '').replace(/\\s+/g, ' ').trim())
        .find((text) => /no .+ available|no .+ yet|disabled|not available|nothing here|empty/i.test(text)) || '',
      nav: document.querySelector('.page-view')?.getAttribute('data-nav')
        || document.querySelector('.page-view')?.getAttribute('data-page')
        || '',
    }
  }`)
  try {
    win.webContents.invalidate()
    await sleep(150)
    let image
    try {
      image = await win.webContents.capturePage()
    } catch {
      await sleep(300)
      image = await win.webContents.capturePage()
    }
    const file = `route-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${sizeLabel}.png`
    fs.writeFileSync(path.join(outDir, file), image.toPNG())
    out.screenshots.push(file)
  } catch (error) {
    out.failures.push({ check: `screenshot-${label.toLowerCase()}`, detail: String(error) })
  }
  return state
}

async function waitForRouteSettle(win, timeoutMs = 10_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const busy = await evalPage(win, `() => {
      const text = document.querySelector('main, .page-view')?.textContent || ''
      return Boolean(document.querySelector('[aria-busy="true"], [class*="skeleton"]'))
        || /Loading (Audiobooks|Motivationals|Lectures)/i.test(text)
    }`)
    if (!busy) return true
    await sleep(300)
  }
  return false
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-catalog-smoke-'))
  app.setPath('userData', userData)
  fs.mkdirSync(outDir, { recursive: true })
  await waitUrl(URL)
  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    const result = await fetchApprovedCatalog(p)
    out.requests.push({ path: p, status: result.status, count: payloadCount(result.payload) })
    return result
  })
  ipcMain.handle('ht-catalog-request', async (_e, options) => {
    const path = typeof options?.path === 'string' ? options.path.trim() : ''
    if (!path.startsWith('/api/')) throw new Error('bad path')
    const result = await fetchApprovedCatalogRequest({
      path,
      method: options?.method,
      body: options?.body,
    })
    out.requests.push({ path, method: options?.method || 'GET', status: result.status, count: payloadCount(result.payload) })
    return result
  })
  const downloads = new DownloadManager({
    getUserDataPath: () => app.getPath('userData'),
    broadcast: () => {},
  })
  ipcMain.handle('ht-downloads-list', async () => downloads.list())
  ipcMain.handle('ht-downloads-start', async (_event, request) => downloads.start(request || {}))
  ipcMain.handle('ht-downloads-pause', async (_event, id) => downloads.pause(String(id || '')))
  ipcMain.handle('ht-downloads-resume', async (_event, id) => downloads.resume(String(id || '')))
  ipcMain.handle('ht-downloads-cancel', async (_event, id) => downloads.cancel(String(id || '')))
  ipcMain.handle('ht-downloads-remove', async (_event, id) => downloads.remove(String(id || '')))
  ipcMain.handle('ht-downloads-get-playable-url', async (_event, id) => downloads.getPlayableUrl(String(id || '')))
  ipcMain.handle('ht-downloads-disk-usage', async () => downloads.getDiskUsage())
  ipcMain.handle('ht-downloads-reconcile', async () => downloads.reconcile())
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
  const idleShell = await evalPage(win, `() => ({
    bridge: typeof window.hiddenTunesDesktop?.catalog?.getJson === 'function'
      && typeof window.hiddenTunesDesktop?.catalog?.requestJson === 'function',
    player: Boolean(document.querySelector('[data-ht-persistent-player="true"], .tv-rail')),
    media: document.querySelectorAll('audio, video').length,
  })`)
  record('catalog-bridge-ready', idleShell.bridge)
  record(
    'idle-shell-does-not-require-player',
    !idleShell.player,
    `player=${idleShell.player} media=${idleShell.media}`,
  )

  // Home + player intact
  await clickNav(win, 'Home')
  const home = await evalPage(win, `() => ({
    home: Boolean(document.querySelector('.music-home')),
    player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
    topRoutes: document.querySelectorAll('.global-top-nav-link').length,
    audio: document.querySelectorAll('audio').length,
  })`)
  record('home-intact', home.home)
  record('idle-player-hidden', !home.player)
  record('single-primary-top-nav', home.topRoutes > 0 && home.topRoutes <= 12, `routes=${home.topRoutes}`)
  record('single-audio', home.audio <= 1, `audio=${home.audio}`)

  // Music catalog
  await clickNav(win, 'Music')
  await sleep(1500)
  const music = await evalPage(win, `() => {
    const cards = document.querySelectorAll('.music-discover-release-hit, .music-discover-chart-hit, .music-home-song-card, .card, [class*="song"], .music-section-card, .api-song-card, button')
    const showMore = [...document.querySelectorAll('button')].find((b) => /show more|load more/i.test(b.textContent || ''))
    return {
      workspace: Boolean(document.querySelector('.music-destination, .music-workspace, .music-discover, [data-nav="music"], [data-page="discover"]')),
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

  // Route smoke + real rendered-count matrix.
  win.setMinimumSize(760, 600)
  win.setSize(1440, 900)
  for (const page of ['Home', 'Music', 'Radio', 'Podcasts', 'TV', 'Sports', 'Audiobooks', 'Motivationals', 'Lectures', 'Library', 'Favorites', 'Playlists', 'Downloads', 'History', 'Search']) {
    const requestStart = out.requests.length
    const okNav = await clickNav(win, page)
    record(`nav-${page.toLowerCase()}`, okNav)
    if (!okNav) {
      out.routes.push({ route: page, opens: false, requests: [], rendered: 0, finalState: 'navigation unavailable' })
      continue
    }
    if (page === 'Search') {
      await evalPage(win, `() => {
        const input = document.querySelector('.top-bar input, .global-top-bar input, header input[type="search"], header input, .app-topbar input, input[placeholder*="Search" i], input[type="search"], input')
        if (!input) return false
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
        setter?.call(input, 'Pop')
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Pop', inputType: 'insertText' }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      }`)
    }
    await sleep(800)
    await waitForRouteSettle(win)
    const state = await captureRoute(win, page)
    const requests = out.requests.slice(requestStart)
    out.routes.push({
      route: page,
      opens: true,
      requests,
      rendered: state.rendered,
      finalState: state.error
        ? 'error'
        : state.loading
          ? 'loading'
          : state.rendered > 0
            ? 'working'
            : state.emptyOrDisabled
              ? 'empty-or-disabled'
              : 'shell-only',
      detail: state.error || state.emptyOrDisabled || '',
      nav: state.nav,
    })
  }

  win.setSize(1024, 768)
  for (const page of ['Home', 'Music', 'Radio', 'TV', 'Audiobooks']) {
    if (await clickNav(win, page)) {
      await waitForRouteSettle(win)
      await captureRoute(win, page, '1024x768')
    }
  }

  // Player visibility is a separate conditional-player assertion, not readiness.
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
    player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
  })`)
  record('active-player-visible', playing.player)
  record('playback-single-audio', playing.audio <= 1, `audio=${playing.audio}`)
  record('playback-single-video', playing.video <= 1, `video=${playing.video}`)

  // Layout still ok at 1024
  win.setSize(1024, 800)
  await sleep(400)
  await clickNav(win, 'Home')
  const narrow = await evalPage(win, `() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
  })`)
  record('1024-no-overflow', !narrow.overflow)
  record('1024-active-player-visible', narrow.player)

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'runtime-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nCatalog smoke: ${out.checks.filter((c) => c.ok).length} passed, ${out.failures.length} failed`)
  app.exit(out.failures.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error(e)
  app.exit(1)
}))
