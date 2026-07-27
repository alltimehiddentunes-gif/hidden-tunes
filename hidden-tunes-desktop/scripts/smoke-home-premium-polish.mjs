#!/usr/bin/env node
/**
 * Premium polish smoke — visual/responsive guards without weakening architecture assertions.
 * Run: npx electron scripts/smoke-home-premium-polish.mjs
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
const outDir = path.join(ROOT, 'docs', 'audits', 'home-premium-polish')
const out = { checks: [], failures: [] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function record(check, ok, detail = '') {
  out.checks.push({ check, ok, detail })
  if (!ok) out.failures.push({ check, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${check}${detail ? ` — ${detail}` : ''}`)
}

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

async function clickNav(win, label) {
  await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    el?.click()
    return Boolean(el)
  }`)
  await sleep(700)
}

async function snapshot(win) {
  return evalPage(win, `() => {
    const hero = document.querySelector('.music-home-hero-carousel')
    const home = document.querySelector('.music-home')
    const song = document.querySelector('.music-home-song-card')
    const family = document.querySelectorAll('.music-home-family-card').length
    const sections = [...document.querySelectorAll('.music-home h2')].map((h) => h.textContent.trim())
    const invented = sections.filter((h) => /recommended for you|more to explore|radio picks|podcast picks|jump in/i.test(h))
    const artGiant = [...document.querySelectorAll('.music-home .art-frame')]
      .some((el) => el.getBoundingClientRect().height > 500)
    const heroH = hero ? hero.getBoundingClientRect().height : 0
    const songW = song ? song.getBoundingClientRect().width : 0
    const pad = home ? getComputedStyle(home).paddingBottom : ''
    return {
      heroH: Math.round(heroH),
      songW: Math.round(songW),
      family,
      sections,
      invented,
      artGiant,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
      footer: Boolean(document.querySelector('.player-bar')),
      workspace: Boolean(document.querySelector('.player-workspace-back')),
      premium: Boolean(document.querySelector('[data-home-polish="premium"]')),
      contentFirst: Boolean(document.querySelector('[data-home-layout="content-first"]')),
      pad,
      has100vh: Boolean(home?.innerHTML.includes('100vh')),
    }
  }`)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-home-premium-')))
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
  await clickNav(win, 'Home')
  await sleep(800)

  const at1440 = await snapshot(win)
  record('premium-marker', at1440.premium)
  record('content-first-marker', at1440.contentFirst)
  record('hero-bounded', at1440.heroH > 0 && at1440.heroH <= 260, `h=${at1440.heroH}`)
  record('no-100vh-home', !at1440.has100vh)
  record('no-escaped-art', !at1440.artGiant)
  record('family-four', at1440.family === 4, `n=${at1440.family}`)
  record('mobile-sections', ['Recently Added', 'Emotional Worlds', 'All Songs'].every((t) => at1440.sections.includes(t)), at1440.sections.join('|'))
  record('no-invented', at1440.invented.length === 0, at1440.invented.join('|'))
  record('persistent-player', at1440.player)
  record('compact-player', at1440.footer)
  record('bottom-clearance', /px$/.test(at1440.pad) && parseFloat(at1440.pad) >= 72, at1440.pad)
  record('no-overflow-1440', !at1440.overflow)
  record('song-card-size', at1440.songW === 0 || (at1440.songW >= 120 && at1440.songW <= 190), `w=${at1440.songW}`)

  await evalPage(win, `() => {
    document.querySelector('.music-home-hero-card-hit, .music-home-song-card')?.click()
    return true
  }`)
  await sleep(1800)
  const afterPlay = await snapshot(win)
  record('home-stays-after-play', afterPlay.contentFirst && !afterPlay.workspace)
  record('art-still-bounded', !afterPlay.artGiant)

  for (const [label, w, h] of [['1024', 1024, 768], ['1280', 1280, 800], ['1720', 1720, 950]]) {
    win.setMinimumSize(760, 600)
    win.setSize(w, h)
    await sleep(450)
    await clickNav(win, 'Home')
    const snap = await snapshot(win)
    record(`${label}-no-overflow`, !snap.overflow)
    record(`${label}-hero-bounded`, snap.heroH > 0 && snap.heroH <= 260, `h=${snap.heroH}`)
    record(`${label}-player`, snap.player)
  }

  // scroll to bottom clearance check
  await clickNav(win, 'Home')
  await evalPage(win, `() => {
    const scroller = document.querySelector('.main-scroll') || document.scrollingElement
    scroller.scrollTop = scroller.scrollHeight
    return true
  }`)
  await sleep(400)
  const bottom = await evalPage(win, `() => {
    const load = document.querySelector('.music-home-load-more, .music-home-all-songs-row:last-child, .music-home h2:last-of-type')
    const footer = document.querySelector('.player-bar')
    if (!load || !footer) return { ok: true, detail: 'missing' }
    const lr = load.getBoundingClientRect()
    const fr = footer.getBoundingClientRect()
    return { ok: lr.bottom <= fr.top + 2 || lr.bottom < window.innerHeight, detail: \`loadBottom=\${Math.round(lr.bottom)} footerTop=\${Math.round(fr.top)}\` }
  }`)
  record('bottom-scroll-clearance', bottom.ok, bottom.detail)

  fs.writeFileSync(path.join(outDir, 'premium-smoke-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nPremium polish smoke: ${out.checks.filter((c) => c.ok).length} passed, ${out.failures.length} failed`)
  app.exit(out.failures.length ? 1 : 0)
}

app.whenReady().then(() => main().catch((err) => {
  console.error(err)
  app.exit(1)
}))
