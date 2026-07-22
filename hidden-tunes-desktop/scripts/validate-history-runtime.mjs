#!/usr/bin/env node
/**
 * Electron runtime for unified history.
 *   npx electron scripts/validate-history-runtime.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'audits', 'typed-history')
const RENDERER_URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'

const out = { startedAt: new Date().toISOString(), checks: [], failures: [] }
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
  while (Date.now() - t0 < 90_000) {
    const s = await evalPage(win, `() => ({ sidebar: Boolean(document.querySelector('.sidebar')), splash: Boolean(document.querySelector('.launch-screen, #launch-splash')) })`)
    if (s.sidebar && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}
async function clickNav(win, label) {
  return evalPage(win, `() => {
    const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    const match = buttons.find((el) => (el.textContent || '').trim().includes(${JSON.stringify(label)}))
    if (!match) return false
    match.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    return true
  }`)
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
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.setContentSize(1024, 900)

  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  record('UI ready', true)

  await evalPage(win, `() => {
    const now = new Date().toISOString()
    localStorage.setItem('ht-desktop:history:v1', JSON.stringify({
      version: 1,
      updatedAt: now,
      items: [
        { type: 'song', id: '__hist_song__', title: 'History Song', subtitle: 'Artist', playedAt: now, positionSeconds: 45, completed: false },
        { type: 'radio', id: '__hist_radio__', title: 'History Radio', subtitle: 'US', playedAt: now, positionSeconds: null },
        { type: 'podcast_episode', id: '__hist_ep__', title: 'History Episode', subtitle: 'Show', playedAt: now, parentId: 'show', positionSeconds: 120, completed: false },
        { type: 'tv', id: '__hist_tv__', title: 'History TV', subtitle: 'Channel', playedAt: now, positionSeconds: null },
        { type: 'radio', id: 'sex-sound-radio', title: 'Sex Sound Radio', isMature: true, playedAt: now, positionSeconds: null },
      ],
    }))
    localStorage.setItem('ht-desktop:history:v1:migrated', '1')
    localStorage.setItem('ht-desktop:library:v2', JSON.stringify({ version: 2, items: [{ type: 'song', id: '__hist_song__', title: 'History Song', addedAt: now }], migratedAt: now }))
    localStorage.setItem('ht-desktop:playlists:v1', JSON.stringify({ version: 1, playlists: [{ id: 'keep', title: 'Keep', items: [], createdAt: now, updatedAt: now }], updatedAt: now }))
    return true
  }`)

  // Force reload so history hydrates
  await win.loadURL(RENDERER_URL)
  await waitReady(win)

  const opened = await clickNav(win, 'Recent')
  record('History opens via Recent sidebar', opened)
  await sleep(700)

  const shell = await evalPage(win, `() => {
    const dest = document.querySelector('.ht-history-destination')
    const rows = Array.from(document.querySelectorAll('.ht-history-row'))
    const types = rows.map((r) => r.getAttribute('data-history-type'))
    const matureVisible = rows.some((r) => (r.textContent || '').includes('Sex Sound Radio'))
    const continueSection = Boolean(document.querySelector('.ht-history-continue'))
    return {
      hasShell: Boolean(dest),
      rowCount: rows.length,
      types,
      matureVisible,
      continueSection,
      width: window.innerWidth,
      playerBars: document.querySelectorAll('.player-bar').length,
    }
  }`)
  record('History shell renders', shell.hasShell)
  record('Seeded history rows render', shell.rowCount >= 4, `rows=${shell.rowCount}`)
  record('Music / Radio / Podcast / TV present', ['song', 'radio', 'podcast_episode', 'tv'].every((t) => shell.types.includes(t)))
  record('Mature radio gated', shell.matureVisible === false)
  record('Continue listening section present', shell.continueSection === true)
  record('1024px layout', shell.width >= 1000 && shell.width <= 1040, `width=${shell.width}`)
  record('No duplicate player bar', shell.playerBars <= 1)

  // Remove one item
  await evalPage(win, `() => {
    const row = Array.from(document.querySelectorAll('.ht-history-row')).find((r) => r.getAttribute('data-history-type') === 'tv')
    const btn = Array.from(row?.querySelectorAll('button') || []).find((b) => (b.textContent || '').trim() === 'Remove')
    btn?.click()
    return Boolean(btn)
  }`)
  await sleep(300)
  const afterRemove = await evalPage(win, `() => {
    const store = JSON.parse(localStorage.getItem('ht-desktop:history:v1') || '{}')
    return {
      hasTv: (store.items || []).some((i) => i.type === 'tv'),
      libraryKept: JSON.parse(localStorage.getItem('ht-desktop:library:v2') || '{}').items?.length > 0,
      playlistKept: JSON.parse(localStorage.getItem('ht-desktop:playlists:v1') || '{}').playlists?.length > 0,
    }
  }`)
  record('Remove history item', afterRemove.hasTv === false)
  record('Remove history preserves Library', afterRemove.libraryKept === true)
  record('Remove history preserves Playlists', afterRemove.playlistKept === true)

  for (const label of ['Home', 'Music', 'Radio', 'My Library', 'Playlists', 'Downloads']) {
    const ok = await clickNav(win, label)
    await sleep(350)
    record(`${label} still opens`, ok === true)
  }

  out.finishedAt = new Date().toISOString()
  out.passed = out.checks.filter((c) => c.ok).length
  out.failed = out.failures.length
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'runtime-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nHistory runtime: ${out.passed} passed, ${out.failed} failed`)
  app.exit(out.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
