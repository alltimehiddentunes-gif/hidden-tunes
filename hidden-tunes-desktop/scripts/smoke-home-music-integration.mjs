#!/usr/bin/env node
/**
 * Short smoke: Home → Music → Home while attempting playback.
 * Reuses Electron + Vite like product; isolated userData.
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
  const t0 = Date.now()
  while (Date.now() - t0 < 60000) {
    const s = await evalPage(win, `() => ({
      sidebar: Boolean(document.querySelector('.sidebar')),
      home: Boolean(document.querySelector('.music-home')),
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
    })`)
    if (s.sidebar && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item, .global-top-nav-link')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    el?.click()
    return Boolean(el)
  }`)
  await sleep(800)
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-integrate-smoke-'))
  app.setPath('userData', userData)
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

  await clickNav(win, 'Home')
  const home = await evalPage(win, `() => ({
    title: document.querySelector('.music-home-page-title')?.textContent || '',
    hero: Boolean(document.querySelector('.music-home-hero')),
    jump: document.querySelectorAll('.music-home-jump-chip').length,
    forbiddenRails: [...document.querySelectorAll('.music-home h2')].map((h) => h.textContent.trim()),
    sidebar: Boolean(document.querySelector('.sidebar')),
  })`)
  record('home-no-hero', !home.hero)
  record('home-jump-in', home.jump >= 5, `chips=${home.jump}`)
  record('home-no-catalog-rails', !home.forbiddenRails.some((h) => /recently added|artists on repeat|fresh releases|explore your sound|collections worth/i.test(h)), home.forbiddenRails.join('|'))
  record('home-sidebar', home.sidebar)

  // Start play if possible
  await evalPage(win, `() => {
    const btn = document.querySelector('.music-home-mix-hit, .music-home-song-card, .music-home-continue-hit, .music-home-jump-chip')
    if (btn && btn.classList.contains('music-home-jump-chip')) return false
    document.querySelector('.music-home-mix-hit, .music-home-song-card, .music-home-continue-hit')?.click()
    return true
  }`)
  await sleep(1500)

  // If no home playable, go Music and play release
  await clickNav(win, 'Music')
  await sleep(700)
  const music = await evalPage(win, `() => ({
    sidebar: Boolean(document.querySelector('.sidebar')),
    discover: Boolean(document.querySelector('.music-discover')),
    title: document.querySelector('.music-discover-page-title')?.textContent || '',
    personalization: [...document.querySelectorAll('.music-discover h2, .music-page-section h2')].map((h) => h.textContent.trim()),
    downloads: [...document.querySelectorAll('.music-sub-nav-item')].some((b) => /downloads/i.test(b.textContent || '')),
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
  })`)
  record('music-sidebar-visible', music.sidebar)
  record('music-catalog-title', /browse the catalog/i.test(music.title), music.title)
  record('music-no-personalization', !music.personalization.some((h) => /made for|recently played|hidden gems/i.test(h)), music.personalization.join('|'))
  record('music-no-downloads-tab', !music.downloads)

  await evalPage(win, `() => {
    document.querySelector('.music-discover-featured-release-hit, .music-discover-release-hit, .music-discover-chart-hit')?.click()
    return true
  }`)
  await sleep(2000)
  const playing = await evalPage(win, `() => {
    const a = [...document.querySelectorAll('audio')]
    return { audio: a.length, video: document.querySelectorAll('video').length, bar: Boolean(document.querySelector('.player-bar, [class*="player"]')) }
  }`)
  record('single-audio', playing.audio <= 1, `audio=${playing.audio}`)
  record('single-video', playing.video <= 1, `video=${playing.video}`)

  await clickNav(win, 'Home')
  await sleep(700)
  await clickNav(win, 'Music')
  await sleep(700)
  await clickNav(win, 'Home')
  await sleep(700)
  const after = await evalPage(win, `() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
    sidebar: Boolean(document.querySelector('.sidebar')),
    home: Boolean(document.querySelector('.music-home')),
  })`)
  record('nav-no-extra-audio', after.audio <= 1, `audio=${after.audio}`)
  record('nav-home-restored', after.home && after.sidebar)

  // 1024 layout quick check
  win.setMinimumSize(760, 600)
  win.setSize(1024, 800)
  await sleep(500)
  await clickNav(win, 'Music')
  await sleep(600)
  const narrow = await evalPage(win, `() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    sidebar: Boolean(document.querySelector('.sidebar')),
    subnav: Boolean(document.querySelector('.music-sub-nav')),
  })`)
  record('music-1024-no-overflow', !narrow.overflow)
  record('music-1024-sidebar', narrow.sidebar)
  record('music-1024-subnav', narrow.subnav)

  console.log(`\nSmoke: ${out.checks.filter((c) => c.ok).length} passed, ${out.failures.length} failed`)
  app.exit(out.failures.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error(e)
  app.exit(1)
}))
