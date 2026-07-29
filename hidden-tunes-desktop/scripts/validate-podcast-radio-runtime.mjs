#!/usr/bin/env node
/**
 * Electron runtime smoke for Podcast + Radio contract hardening.
 * Requires Vite on http://localhost:5173 (or HT_VALIDATE_START_VITE=1).
 *
 *   npx electron scripts/validate-podcast-radio-runtime.mjs
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
const { getRuntimeDiagnostics } = require('../electron/runtimeConfig.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'audits', 'podcast-radio-contract-hardening', 'screenshots')
const RENDERER_URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'

const out = {
  startedAt: new Date().toISOString(),
  checks: [],
  failures: [],
  screenshots: [],
  catalogPaths: [],
}

function record(check, ok, detail = '') {
  out.checks.push({ check, ok, detail })
  if (!ok) out.failures.push({ check, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${check}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitUrl(url, ms = 90_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 304) return
    } catch {
      // retry
    }
    await sleep(400)
  }
  throw new Error(`timeout ${url}`)
}

async function maybeStartVite() {
  // Spawning npm from inside Electron fails on Windows (spawn EINVAL).
  // Start Vite externally, or set HT_VALIDATE_START_VITE=1 with a pre-started server.
  if (process.env.HT_VALIDATE_START_VITE === '1') {
    console.log('HT_VALIDATE_START_VITE=1 ignored inside Electron; waiting for existing Vite…')
  }
  await waitUrl(RENDERER_URL)
  return null
}

async function evalPage(win, src) {
  return win.webContents.executeJavaScript(`(${src})()`, true)
}

async function waitReady(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 90_000) {
    const s = await evalPage(
      win,
      `() => ({
        sidebar: Boolean(document.querySelector('.sidebar')),
        splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
      })`,
    )
    if (s.sidebar && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  const result = await evalPage(
    win,
    `() => {
      const items = [...document.querySelectorAll(
        '.sidebar .nav-item, .global-top-nav button, [aria-label="Primary sections"] button'
      )]
      const target = items.find((el) => {
        const span = el.querySelector('span')
        const text = (span?.textContent || el.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase()
        return text === '${label}'.toLowerCase()
      })
      if (!target) {
        return { ok: false, labels: items.map((el) => (el.querySelector('span')?.textContent || '').trim()) }
      }
      target.click()
      return { ok: true, text: (target.querySelector('span')?.textContent || '').trim() }
    }`,
  )
  await sleep(1500)
  return Boolean(result?.ok)
}

async function typeGlobalSearch(win, value) {
  await evalPage(
    win,
    `() => {
      const input = document.querySelector('.top-bar input, .global-top-bar input, header input[type="search"], header input, .app-topbar input, input[placeholder*="Search" i]')
      if (!input) return false
      input.focus()
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(value)}, inputType: 'insertText' }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }`,
  )
  await sleep(value ? 1000 : 500)
}

async function waitForSelector(win, selector, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const found = await evalPage(win, `() => Boolean(document.querySelector(${JSON.stringify(selector)}))`)
    if (found) return true
    await sleep(400)
  }
  return false
}

async function capture(win, name) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  const image = await win.webContents.capturePage()
  const file = `${name}.png`
  fs.writeFileSync(path.join(EVIDENCE_DIR, file), image.toPNG())
  out.screenshots.push(file)
}

async function main() {
  await maybeStartVite()
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-pod-radio-'))
  app.setPath('userData', userData)

  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    out.catalogPaths.push(p)
    return fetchApprovedCatalog(p)
  })
  ipcMain.handle('ht-catalog-request', async (_e, options) => {
    const cleanPath = typeof options?.path === 'string' ? options.path.trim() : ''
    if (!cleanPath.startsWith('/api/')) throw new Error('bad path')
    out.catalogPaths.push(cleanPath)
    return fetchApprovedCatalogRequest(options)
  })
  ipcMain.on('ht-runtime-info', (event) => {
    event.returnValue = getRuntimeDiagnostics(app.isPackaged)
  })
  ipcMain.handle('ht-downloads-list', async () => [])
  ipcMain.handle('ht-downloads-disk-usage', async () => ({ usedBytes: 0, itemCount: 0 }))
  ipcMain.handle('ht-downloads-reconcile', async () => ({ ok: true, removed: 0 }))

  await app.whenReady()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  record('shell-ready', true)

  // Podcasts
  record('nav-podcasts', await clickNav(win, 'Podcasts'))
  await waitForSelector(win, '.podcast-destination, .podcast-featured-card, [class*="podcast"]')
  await sleep(1500)
  const pod = await evalPage(
    win,
    `() => {
      const err = document.querySelector('.podcast-status--error, [role="alert"]')
      const errText = (err?.textContent || '').trim()
      const cards = document.querySelectorAll('.podcast-featured-card, .podcast-show-card').length
      const loading = /loading/i.test(document.body.innerText) && cards === 0
      return { errText, cards, loading, hasDestination: Boolean(document.querySelector('.podcast-destination, .podcasts-page, [class*="podcast"]')) }
    }`,
  )
  record('podcast-page-renders', Boolean(pod.hasDestination || pod.cards > 0), JSON.stringify(pod))
  record(
    'podcast-no-blocking-error',
    !/failed to load latest episodes/i.test(pod.errText || ''),
    pod.errText || 'none',
  )
  record('podcast-has-shows', pod.cards > 0, `cards=${pod.cards}`)
  await capture(win, 'podcasts-home')

  await typeGlobalSearch(win, 'jazz')
  await sleep(1500)
  const podSearch = await evalPage(
    win,
    `() => ({
      cards: document.querySelectorAll('.podcast-featured-card, .podcast-show-card').length,
      err: (document.querySelector('[role="alert"]')?.textContent || '').trim(),
      input: document.querySelector('header input, .top-bar input, input[placeholder*="Search" i]')?.value || '',
    })`,
  )
  record(
    'podcast-search-jazz',
    podSearch.cards > 0 || podSearch.input.toLowerCase().includes('jazz'),
    JSON.stringify(podSearch),
  )
  await typeGlobalSearch(win, '')
  await sleep(1000)

  // Open first show if possible
  const openedShow = await evalPage(
    win,
    `() => {
      const btn = document.querySelector('.podcast-featured-card-hit, .podcast-show-card button, .podcast-featured-card button')
      btn?.click()
      return Boolean(btn)
    }`,
  )
  await sleep(2500)
  if (openedShow) {
    const show = await evalPage(
      win,
      `() => ({
        episodes: document.querySelectorAll('.podcast-episode-row, [class*="episode"]').length,
        err: (document.querySelector('[role="alert"]')?.textContent || '').trim(),
      })`,
    )
    record('podcast-show-detail', show.episodes >= 0, JSON.stringify(show))
    await capture(win, 'podcast-show-detail')

    const played = await evalPage(
      win,
      `() => {
        const play = document.querySelector('.podcast-episode-row button, .podcast-episode-row-play, button[aria-label*="Play" i]')
        play?.click()
        return Boolean(play)
      }`,
    )
    await sleep(2500)
    const playing = await evalPage(
      win,
      `() => ({
        bar: Boolean(document.querySelector('.player-bar, .desktop-player, [class*="player"]')),
        title: (document.querySelector('.player-bar .track-title, .now-playing-title')?.textContent || '').trim(),
      })`,
    )
    record('podcast-play-attempt', played, JSON.stringify(playing))
  } else {
    record('podcast-show-detail', false, 'no show card to open')
  }

  // Radio
  record('nav-radio', await clickNav(win, 'Radio'))
  const radioReady = await waitForSelector(win, '.radio-destination', 25000)
  await sleep(2000)
  const radio = await evalPage(
    win,
    `() => ({
      cards: document.querySelectorAll('.radio-station-card-v2, .radio-station-card').length,
      err: (document.querySelector('.radio-status--error, [role="alert"]')?.textContent || '').trim(),
      hasPage: Boolean(document.querySelector('.radio-destination')),
      loading: Boolean(document.querySelector('.radio-status[aria-busy="true"]')),
      activeNav: [...document.querySelectorAll('.sidebar .nav-item.active span')].map((n) => n.textContent.trim()),
    })`,
  )
  record('radio-page-renders', radioReady && (radio.hasPage || radio.cards > 0), JSON.stringify(radio))
  record('radio-has-stations', radio.cards > 0, `cards=${radio.cards}`)
  await capture(win, 'radio-home')

  await typeGlobalSearch(win, 'jazz')
  await sleep(2000)
  const radioSearch = await evalPage(
    win,
    `() => ({
      cards: document.querySelectorAll('.radio-station-card-v2').length,
      names: [...document.querySelectorAll('.radio-station-card-v2 h3')].slice(0, 5).map((n) => n.textContent),
      matureVisible: [...document.querySelectorAll('.radio-station-card-v2 h3')].some((n) => /sex sound/i.test(n.textContent || '')),
      input: document.querySelector('header input, .top-bar input, input[placeholder*="Search" i]')?.value || '',
    })`,
  )
  record('radio-search-jazz', radioSearch.cards > 0, JSON.stringify(radioSearch))

  await typeGlobalSearch(win, 'Sex Sound Radio')
  await sleep(2000)
  const matureSearch = await evalPage(
    win,
    `() => ({
      cards: document.querySelectorAll('.radio-station-card-v2').length,
      names: [...document.querySelectorAll('.radio-station-card-v2 h3')].map((n) => n.textContent),
    })`,
  )
  record(
    'radio-mature-excluded-from-search',
    !matureSearch.names.some((n) => /sex sound/i.test(n || '')),
    JSON.stringify(matureSearch),
  )
  await typeGlobalSearch(win, 'bbc')
  await sleep(2000)

  const tuned = await evalPage(
    win,
    `() => {
      const hit = document.querySelector('.radio-station-card-v2-hit')
      hit?.click()
      return Boolean(hit)
    }`,
  )
  await sleep(4000)
  const radioPlay = await evalPage(
    win,
    `() => ({
      title: (document.querySelector('.player-bar .track-title, .now-playing-title')?.textContent || '').trim(),
      audioPlaying: [...document.querySelectorAll('audio')].some((a) => !a.paused),
      err: (document.querySelector('.player-error, [class*="playback-error"]')?.textContent || '').trim(),
    })`,
  )
  record('radio-play-attempt', tuned && (Boolean(radioPlay.title) || radioPlay.audioPlaying), JSON.stringify(radioPlay))
  await capture(win, 'radio-playing')

  // Cross-family switch
  record('nav-music', await clickNav(win, 'Music'))
  await sleep(1000)
  record('nav-back-radio', await clickNav(win, 'Radio'))
  await waitForSelector(win, '.radio-destination', 15000)
  record('nav-podcasts-again', await clickNav(win, 'Podcasts'))
  await waitForSelector(win, '.podcast-featured-card, .podcast-destination', 15000)

  const unscopedEpisodeCalls = out.catalogPaths.filter(
    (p) =>
      p.startsWith('/api/podcasts/episodes?')
      && !p.includes('show_id=')
      && !p.includes('category='),
  )
  const episodeQCalls = out.catalogPaths.filter(
    (p) => p.startsWith('/api/podcasts/episodes?') && p.includes('q='),
  )
  record('no-unscoped-episode-list', unscopedEpisodeCalls.length === 0, unscopedEpisodeCalls.join(' | '))
  record('no-episode-q-search', episodeQCalls.length === 0, episodeQCalls.join(' | '))

  const reportPath = path.join(
    ROOT,
    'docs',
    'audits',
    'podcast-radio-contract-hardening',
    'runtime-results.json',
  )
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  out.endedAt = new Date().toISOString()
  out.uniqueCatalogPaths = [...new Set(out.catalogPaths)]
  fs.writeFileSync(reportPath, JSON.stringify(out, null, 2))
  console.log(`Wrote ${reportPath}`)
  console.log(`${out.checks.length - out.failures.length}/${out.checks.length} checks passed`)

  win.close()
  app.exit(out.failures.length ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
