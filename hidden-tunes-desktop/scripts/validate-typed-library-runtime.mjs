#!/usr/bin/env node
/**
 * Electron runtime smoke for typed multi-family Library.
 * Requires Vite on http://localhost:5173
 *
 *   node scripts/validate-typed-library-runtime.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'audits', 'typed-library-favorites')
const RENDERER_URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'

const out = {
  startedAt: new Date().toISOString(),
  checks: [],
  failures: [],
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

async function clickEl(win, selector) {
  return evalPage(
    win,
    `() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return false
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    }`,
  )
}

async function clickTabByLabel(win, label) {
  return evalPage(
    win,
    `() => {
      const tabs = Array.from(document.querySelectorAll('.ht-library-tab'))
      const match = tabs.find((tab) => (tab.textContent || '').trim().startsWith(${JSON.stringify(label)}))
      if (!match) return { ok: false, labels: tabs.map((t) => (t.textContent || '').trim()) }
      match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return { ok: true, label: (match.textContent || '').trim() }
    }`,
  )
}

async function clickNav(win, label) {
  return evalPage(
    win,
    `() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      const match = buttons.find((el) => (el.textContent || '').trim().includes(${JSON.stringify(label)}))
      if (!match) return false
      match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      return true
    }`,
  )
}

async function main() {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  await waitUrl(RENDERER_URL)

  await app.whenReady()
  const win = new BrowserWindow({
    width: 1024,
    height: 900,
    useContentSize: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.setContentSize(1024, 900)

  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  record('UI ready', true)

  // Seed typed library in renderer storage
  const seed = await evalPage(
    win,
    `() => {
      const now = new Date().toISOString()
      const items = [
        { type: 'song', id: '__ht_lib_song__', title: 'Library Contract Song', artist: 'Test', artwork: null, addedAt: now, source: 'music' },
        { type: 'radio', id: '__ht_lib_radio__', title: 'Library Contract Radio', artwork: null, country: 'US', isMature: false, contentRating: null, playId: '__ht_lib_radio__', addedAt: now, source: 'radio' },
        { type: 'podcast_show', id: '__ht_lib_show__', title: 'Library Contract Show', hostName: 'Host', artwork: null, addedAt: now, source: 'podcast' },
        { type: 'podcast_episode', id: '__ht_lib_ep__', title: 'Library Contract Episode', showId: '__ht_lib_show__', showTitle: 'Library Contract Show', artwork: null, playId: '__ht_lib_ep__', addedAt: now, source: 'podcast' },
        { type: 'tv', id: '__ht_lib_tv__', title: 'Library Contract TV', channelName: 'TV', artwork: null, addedAt: now, source: 'tv' },
        { type: 'radio', id: 'sex-sound-radio', title: 'Sex Sound Radio', isMature: true, contentRating: 'adult', playId: 'sex-sound-radio', addedAt: now, source: 'radio' },
      ]
      localStorage.setItem('ht-desktop:library:v2', JSON.stringify({ version: 2, migratedAt: now, items }))
      localStorage.setItem('ht-desktop:library:v2:migrated', '1')
      return items.length
    }`,
  )
  record('seeded library items', seed >= 6, `count=${seed}`)

  // Reload so Library hydrates from storage
  await win.loadURL(RENDERER_URL)
  await waitReady(win)

  const opened = await clickNav(win, 'My Library')
  record('Library opens via sidebar', opened)
  await sleep(700)

  const shell = await evalPage(
    win,
    `() => {
      const dest = document.querySelector('.ht-library-destination')
      const title = document.querySelector('#ht-library-heading')
      const rows = Array.from(document.querySelectorAll('.ht-library-row'))
      const types = rows.map((row) => row.getAttribute('data-library-type'))
      const matureVisible = rows.some((row) => (row.textContent || '').includes('Sex Sound Radio'))
      const radioRows = rows.filter((row) => row.getAttribute('data-library-type') === 'radio')
      const songRows = rows.filter((row) => row.getAttribute('data-library-type') === 'song')
      const empty = Boolean(document.querySelector('.ht-library-empty'))
      return {
        hasShell: Boolean(dest),
        title: title?.textContent || '',
        rowCount: rows.length,
        types,
        matureVisible,
        radioPresentation: radioRows.some((row) => (row.textContent || '').includes('Radio')),
        songPresentation: songRows.some((row) => (row.textContent || '').includes('Music')),
        empty,
        width: window.innerWidth,
      }
    }`,
  )

  record('Library shell from local storage', shell.hasShell && shell.title.includes('Library'))
  record('seeded items render', shell.rowCount >= 5, `rows=${shell.rowCount}`)
  record('Radio favorite appears as Radio', shell.types.includes('radio') && shell.radioPresentation)
  record('Music favorite appears', shell.types.includes('song') && shell.songPresentation)
  record('Podcast show present', shell.types.includes('podcast_show'))
  record('Podcast episode present', shell.types.includes('podcast_episode'))
  record('TV present', shell.types.includes('tv'))
  record('Sex Sound Radio excluded from general Library', shell.matureVisible === false)
  record('1024px layout viewport', shell.width >= 1000 && shell.width <= 1040, `width=${shell.width}`)

  // Type filter
  const filterClick = await clickTabByLabel(win, 'Radio')
  await sleep(500)
  const filterState = await evalPage(
    win,
    `() => {
      const active = document.querySelector('.ht-library-tab.is-active')
      const rows = Array.from(document.querySelectorAll('.ht-library-row'))
      const types = rows.map((row) => row.getAttribute('data-library-type'))
      const allRadio = rows.length > 0 && types.every((type) => type === 'radio')
      return {
        ok: allRadio,
        count: rows.length,
        types,
        active: active?.textContent?.trim() || '',
        click: ${JSON.stringify(filterClick)},
      }
    }`,
  )
  record('type filter works', filterClick.ok && filterState.ok, `active=${filterState.active} count=${filterState.count}`)

  // Remove works
  await clickTabByLabel(win, 'All')
  await sleep(400)
  const beforeRemove = await evalPage(win, `() => document.querySelectorAll('.ht-library-row').length`)
  await clickEl(win, '.ht-library-row-remove')
  await sleep(400)
  const afterRemove = await evalPage(win, `() => document.querySelectorAll('.ht-library-row').length`)
  record('remove works', afterRemove === beforeRemove - 1, `${beforeRemove}->${afterRemove}`)

  // Empty-state path: clear store and reopen
  await evalPage(
    win,
    `() => {
      localStorage.setItem('ht-desktop:library:v2', JSON.stringify({ version: 2, migratedAt: new Date().toISOString(), items: [] }))
      return true
    }`,
  )
  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  await clickNav(win, 'My Library')
  await sleep(600)
  const emptyState = await evalPage(
    win,
    `() => Boolean(document.querySelector('.ht-library-empty'))`,
  )
  record('empty state', emptyState === true)

  // Podcast show open path from library seed
  await evalPage(
    win,
    `() => {
      const now = new Date().toISOString()
      localStorage.setItem('ht-desktop:library:v2', JSON.stringify({
        version: 2,
        migratedAt: now,
        items: [{ type: 'podcast_show', id: '__ht_lib_show__', title: 'Library Contract Show', addedAt: now, source: 'podcast' }],
      }))
      return true
    }`,
  )
  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  await clickNav(win, 'My Library')
  await sleep(500)
  const openShow = await evalPage(
    win,
    `() => {
      const row = document.querySelector('.ht-library-row[data-library-type="podcast_show"] .ht-library-row-hit')
      row?.click()
      return true
    }`,
  )
  await sleep(1200)
  const showDetail = await evalPage(
    win,
    `() => Boolean(document.querySelector('.podcast-show-destination, .podcast-show-hero, #podcast-show-heading'))`,
  )
  record('podcast show favorite opens show', openShow && showDetail)

  // Ownership smoke: play radio from library then music page should still be navigable
  await evalPage(
    win,
    `() => {
      const now = new Date().toISOString()
      localStorage.setItem('ht-desktop:library:v2', JSON.stringify({
        version: 2,
        migratedAt: now,
        items: [
          { type: 'radio', id: '__ht_lib_radio__', title: 'Library Contract Radio', addedAt: now, source: 'radio', isMature: false, playId: '__ht_lib_radio__' },
          { type: 'song', id: '__ht_lib_song__', title: 'Library Contract Song', addedAt: now, source: 'music' },
        ],
      }))
      return true
    }`,
  )
  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  await clickNav(win, 'My Library')
  await sleep(400)
  await evalPage(
    win,
    `() => {
      document.querySelector('.ht-library-row[data-library-type="radio"] .ht-library-row-hit')?.click()
      return true
    }`,
  )
  await sleep(900)
  const afterRadio = await evalPage(
    win,
    `() => ({
      player: Boolean(document.querySelector('.player-bar, .desktop-player, .player-shell')),
      errorCrash: Boolean(document.querySelector('.app-error-boundary, .fatal-error')),
    })`,
  )
  record('Library Radio selection does not crash', !afterRadio.errorCrash)

  await clickNav(win, 'Music')
  await sleep(500)
  const musicOk = await evalPage(
    win,
    `() => Boolean(document.querySelector('.music-workspace, .music-destination, [data-music-section], .psd-liked-destination, .home-destination, .section-hero'))`,
  )
  record('Music page still opens after Library Radio', musicOk)

  await clickNav(win, 'TV')
  await sleep(600)
  const tvOk = await evalPage(
    win,
    `() => Boolean(document.querySelector('.tv-destination, .tv-station-card, #tv-page-heading, .section-hero'))`,
  )
  record('TV ownership surface unaffected', tvOk)

  // Radio favorite button present on Radio page
  await clickNav(win, 'Radio')
  await sleep(2500)
  const radioFav = await evalPage(
    win,
    `() => {
      const buttons = document.querySelectorAll('.radio-favorite-btn').length
      const cards = document.querySelectorAll('.radio-station-card-v2').length
      const destination = Boolean(document.querySelector('.radio-destination'))
      return { buttons, cards, destination }
    }`,
  )
  record(
    'Radio favorite buttons present',
    radioFav.buttons > 0 || (radioFav.destination && radioFav.cards === 0),
    `buttons=${radioFav.buttons} cards=${radioFav.cards}`,
  )
  // If stations rendered, favorites must exist on cards.
  if (radioFav.cards > 0) {
    record('Radio cards expose favorite controls', radioFav.buttons > 0, `buttons=${radioFav.buttons}`)
  }

  out.finishedAt = new Date().toISOString()
  out.passed = out.checks.filter((c) => c.ok).length
  out.failed = out.failures.length
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'runtime-results.json'), JSON.stringify(out, null, 2))

  console.log(`\nLibrary runtime: ${out.passed} passed, ${out.failed} failed`)
  const code = out.failed > 0 ? 1 : 0
  app.exit(code)
}

main().catch((error) => {
  console.error(error)
  try {
    app.exit(1)
  } catch {
    process.exit(1)
  }
})
