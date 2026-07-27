#!/usr/bin/env node
/**
 * Music page layout smoke — catalogue containment, no PlayerWorkspace hijack,
 * UTF-8 search placeholder, players preserved.
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
const outDir = path.join(ROOT, 'docs', 'audits', 'music-page-repair')
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
  await sleep(1000)
  return clicked
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-music-layout-smoke-')))
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

  const initial = await evalPage(win, `() => {
    const musicMain = document.querySelector('.music-workspace, .music-discover, [aria-label="Music discover"]')
    const frames = [...document.querySelectorAll('.page-view[data-page="music"] .art-frame, .music-workspace .art-frame, .music-discover .art-frame')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          w: Math.round(r.width),
          h: Math.round(r.height),
          circle: el.classList.contains('art-frame--circle'),
          inShell: Boolean(el.closest('.music-art')),
        }
      })
    const maxH = frames.reduce((m, f) => Math.max(m, f.h), 0)
    const maxW = frames.reduce((m, f) => Math.max(m, f.w), 0)
    const circles = frames.filter((f) => f.circle)
    const squares = frames.filter((f) => !f.circle)
    const input = document.querySelector('.home-top-search input, .global-top-search input, input[placeholder*="Search"]')
    const ph = input?.getAttribute('placeholder') || input?.placeholder || ''
    const sections = [...document.querySelectorAll('.music-discover h2, .music-page-section-header h2, .music-section-page-header h1')]
      .map((h) => (h.textContent || '').trim())
      .filter(Boolean)
    const pageView = document.querySelector('.page-view[data-page="music"]')
    const pageBg = pageView ? getComputedStyle(pageView).backgroundImage + getComputedStyle(document.querySelector('.main-scroll')).backgroundImage : ''
    const playbackBg = Boolean(document.querySelector('.page-view[data-page="music"] .cinema-player-art-backdrop, .music-workspace .now-playing-backdrop, .page-view[data-page="music"] [data-playback-art-bg]'))
    const mainPad = getComputedStyle(document.querySelector('.main-scroll')).paddingBottom
    return {
      musicMains: document.querySelectorAll('.music-workspace').length,
      discover: Boolean(document.querySelector('.music-discover')),
      maxH,
      maxW,
      giant: maxH > 320 || maxW > 320,
      circleMax: circles.reduce((m, f) => Math.max(m, f.h), 0),
      squareMax: squares.reduce((m, f) => Math.max(m, f.h), 0),
      allInShell: frames.length === 0 || frames.every((f) => f.inShell),
      frameCount: frames.length,
      placeholder: ph,
      placeholderOk: ph.includes('…') && !/[├ÔÇ]/.test(ph),
      sections,
      sectionCount: sections.length,
      playbackBg,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      persistent: document.querySelectorAll('[data-ht-persistent-player="true"]').length,
      playerBar: document.querySelectorAll('.player-bar').length,
      workspaceBack: Boolean(document.querySelector('.player-workspace-back')),
      bottomPad: mainPad,
      pageBgHasUrl: /url\\(/i.test(pageBg),
    }
  }`)

  record('one-music-main-region', initial.musicMains === 1, `count=${initial.musicMains}`)
  record('music-discover-visible', initial.discover)
  record('no-giant-artwork', !initial.giant, `maxH=${initial.maxH} maxW=${initial.maxW}`)
  record('artist-art-bounded', initial.circleMax === 0 || initial.circleMax <= 180, `circleMax=${initial.circleMax}`)
  record('square-art-bounded', initial.squareMax === 0 || initial.squareMax <= 220, `squareMax=${initial.squareMax}`)
  record('artwork-in-music-art-shell', initial.allInShell, `frames=${initial.frameCount}`)
  record('utf8-search-placeholder', initial.placeholderOk, JSON.stringify(initial.placeholder))
  record('catalogue-sections', initial.sectionCount >= 3, `sections=${initial.sections.join('|')}`)
  record('no-playback-fullpage-art', !initial.playbackBg && !initial.pageBgHasUrl, `playbackBg=${initial.playbackBg}`)
  record('persistent-player', initial.persistent === 1, `n=${initial.persistent}`)
  record('compact-player', initial.playerBar >= 1, `n=${initial.playerBar}`)
  record('no-horizontal-overflow', !initial.overflow)
  record('bottom-clearance', /px$/.test(initial.bottomPad) && parseFloat(initial.bottomPad) >= 64, initial.bottomPad)

  // Play from Music must stay on catalogue (not PlayerWorkspace)
  const playResult = await evalPage(win, `() => {
    const hit = document.querySelector('.music-discover-release-hit, .music-discover-chart-hit, .music-discover-mood-hit, .music-discover-song-row, .music-discover-song-chip')
    hit?.click()
    return Boolean(hit)
  }`)
  await sleep(1200)
  const afterPlay = await evalPage(win, `() => ({
    discover: Boolean(document.querySelector('.music-discover')),
    workspaceBack: Boolean(document.querySelector('.player-workspace-back')),
    musicWorkspace: Boolean(document.querySelector('.music-workspace')),
    idle: document.querySelector('[data-ht-persistent-player="true"]')?.getAttribute('data-idle') || null,
  })`)
  record('play-clicked', playResult)
  record('play-stays-on-music', afterPlay.discover || afterPlay.musicWorkspace, JSON.stringify(afterPlay))
  record('play-does-not-open-player-workspace', !afterPlay.workspaceBack, JSON.stringify(afterPlay))

  // 1024 width sanity
  win.setMinimumSize(760, 600)
  win.setSize(1024, 768)
  await sleep(600)
  const at1024 = await evalPage(win, `() => {
    const frames = [...document.querySelectorAll('.music-art .art-frame')].map((el) => el.getBoundingClientRect().height)
    const player = document.querySelector('[data-ht-persistent-player="true"], .tv-rail')
    return {
      maxH: frames.reduce((m, h) => Math.max(m, h), 0),
      playerVisible: Boolean(player) && player.getBoundingClientRect().width > 40,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      search: Boolean(document.querySelector('.home-top-search input, input[placeholder*="Search"]')),
    }
  }`)
  record('1024-no-giant', at1024.maxH <= 220, `maxH=${at1024.maxH}`)
  record('1024-player-visible', at1024.playerVisible)
  record('1024-no-overflow', !at1024.overflow)
  record('1024-search-usable', at1024.search)

  fs.writeFileSync(path.join(outDir, 'smoke-music-page-layout.json'), JSON.stringify(out, null, 2))
  const code = out.failures.length ? 1 : 0
  console.log(code === 0 ? 'Music page layout smoke PASS' : `Music page layout smoke FAIL (${out.failures.length})`)
  app.exit(code)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
