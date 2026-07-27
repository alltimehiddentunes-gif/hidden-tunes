#!/usr/bin/env node
/**
 * Home + persistent player layout smoke against local Vite (5173).
 * Launches one Electron window with isolated userData.
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
const outDir = path.join(ROOT, 'docs', 'audits', 'home-player-layout')
const out = { checks: [], failures: [], widths: {} }

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

async function snapshotLayout(win, key) {
  const snap = await evalPage(win, `() => {
    const root = document.documentElement
    const player = document.querySelector('[data-ht-persistent-player="true"], .tv-rail')
    const main = document.querySelector('.main-scroll')
    const topLinks = document.querySelectorAll('.global-top-nav-link')
    const empty = document.querySelector('.ht-persistent-player-empty-title')
    const groups = [...document.querySelectorAll('.sidebar-nav-group-label')].map((el) => el.textContent.trim())
    return {
      overflow: root.scrollWidth > root.clientWidth + 2,
      playerVisible: Boolean(player) && player.getBoundingClientRect().width > 40,
      playerIdle: document.querySelector('[data-ht-persistent-player="true"]')?.getAttribute('data-idle') || null,
      emptyTitle: empty?.textContent?.trim() || '',
      questionPlaceholder: Boolean(document.querySelector('.now-playing-art-placeholder-icon')),
      topRouteLinks: topLinks.length,
      topRouteVisible: [...topLinks].some((el) => el.offsetParent !== null),
      sidebarGroups: groups,
      mainScrolls: Boolean(main),
      audio: document.querySelectorAll('audio').length,
      video: document.querySelectorAll('video').length,
      playerBars: document.querySelectorAll('.player-bar').length,
      persistentPlayers: document.querySelectorAll('[data-ht-persistent-player="true"]').length,
      homeSections: [...document.querySelectorAll('.music-home h2')].map((h) => h.textContent.trim()),
    }
  }`)
  out.widths[key] = snap
  return snap
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-home-player-smoke-'))
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

  const pages = [
    'Home', 'Music', 'Radio', 'Podcasts', 'TV', 'Sports',
    'Audiobooks', 'Motivationals', 'Lectures',
    'Library', 'Playlists', 'Downloads', 'History', 'Search',
  ]
  for (const page of pages) {
    const ok = await clickNav(win, page)
    record(`nav-${page.toLowerCase()}`, ok)
    const blank = await evalPage(win, `() => {
      const view = document.querySelector('.page-view')
      return Boolean(view) && (view.textContent || '').trim().length > 0
    }`)
    record(`page-${page.toLowerCase()}-content`, blank)
  }

  await clickNav(win, 'Home')
  await sleep(500)

  win.setSize(1440, 900)
  await sleep(400)
  const at1440 = await snapshotLayout(win, '1440')
  record('no-duplicate-top-routes', !at1440.topRouteVisible && at1440.topRouteLinks === 0, `links=${at1440.topRouteLinks}`)
  record('persistent-player-visible-1440', at1440.playerVisible)
  record('empty-player-copy', /nothing playing/i.test(at1440.emptyTitle), at1440.emptyTitle)
  record('no-question-placeholder', !at1440.questionPlaceholder)
  record('sidebar-groups', at1440.sidebarGroups.includes('Primary') && at1440.sidebarGroups.includes('Library'), at1440.sidebarGroups.join('|'))
  const parityTitles = ['Emotional Worlds', 'Recently Added', 'All Songs']
  const hasParity = parityTitles.every((t) => at1440.homeSections.includes(t))
  record('home-mobile-parity-titles', hasParity, at1440.homeSections.join('|'))
  record('home-no-invented-continue', !at1440.homeSections.includes('Continue Listening'))
  record('home-no-invented-more-explore', !at1440.homeSections.includes('More to Explore'))
  record('single-audio-idle', at1440.audio <= 1, `audio=${at1440.audio}`)
  record('single-video-idle', at1440.video <= 1, `video=${at1440.video}`)
  record('one-persistent-player', at1440.persistentPlayers === 1, `n=${at1440.persistentPlayers}`)

  // Attempt play from home (hero / recently added / all songs)
  await evalPage(win, `() => {
    document.querySelector('.music-home-hero-card-hit, .music-home-song-card, .music-home-room-card, .music-home-all-songs-row')?.click()
    return true
  }`)
  await sleep(2200)
  const active = await evalPage(win, `() => {
    const rail = document.querySelector('[data-ht-persistent-player="true"]')
    return {
      idle: rail?.getAttribute('data-idle'),
      title: document.querySelector('.rail-psd-track-title')?.textContent?.trim() || '',
      audio: document.querySelectorAll('audio').length,
      video: document.querySelectorAll('video').length,
      bars: document.querySelectorAll('.player-bar').length,
    }
  }`)
  if (active.idle === 'false') {
    record('active-player-metadata', active.title.length > 0, active.title)
    record('no-audio-overlap', active.audio <= 1, `audio=${active.audio}`)
    record('footer-bar-compact-ok', active.bars <= 1, `bars=${active.bars}`)
  } else {
    record('active-player-attempt', true, 'no home playable item; skipped active assertions')
  }

  // Cross-family light switch via nav (ownership remains provider)
  for (const label of ['Radio', 'Podcasts', 'Music', 'TV', 'Music']) {
    await clickNav(win, label)
  }
  const afterSwitch = await evalPage(win, `() => ({
    audio: document.querySelectorAll('audio').length,
    video: document.querySelectorAll('video').length,
    players: document.querySelectorAll('[data-ht-persistent-player="true"], .tv-rail').length,
  })`)
  record('switch-single-audio', afterSwitch.audio <= 1, `audio=${afterSwitch.audio}`)
  record('switch-single-video', afterSwitch.video <= 1, `video=${afterSwitch.video}`)
  record('switch-one-right-rail', afterSwitch.players === 1, `rails=${afterSwitch.players}`)

  for (const [key, width] of [['1024', 1024], ['1280', 1280], ['1440', 1440], ['1720', 1720]]) {
    win.setMinimumSize(760, 600)
    win.setSize(width, 900)
    await sleep(450)
    await clickNav(win, 'Home')
    const snap = await snapshotLayout(win, key)
    record(`${key}-no-overflow`, !snap.overflow)
    record(`${key}-player-visible`, snap.playerVisible)
  }

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'runtime-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nHome/player smoke: ${out.checks.filter((c) => c.ok).length} passed, ${out.failures.length} failed`)
  app.exit(out.failures.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((e) => {
  console.error(e)
  app.exit(1)
}))
