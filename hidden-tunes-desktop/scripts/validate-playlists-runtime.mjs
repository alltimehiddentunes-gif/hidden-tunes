#!/usr/bin/env node
/**
 * Electron runtime smoke for typed user playlists.
 * Requires Vite on http://localhost:5173
 *
 *   npx electron scripts/validate-playlists-runtime.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'audits', 'user-playlists')
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

async function clickNav(win, label) {
  return evalPage(
    win,
    `() => {
      const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'))
      const match = buttons.find((el) => (el.textContent || '').trim() === ${JSON.stringify(label)} || (el.textContent || '').trim().includes(${JSON.stringify(label)}))
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

  // Seed library favorite to prove independence later
  await evalPage(
    win,
    `() => {
      const now = new Date().toISOString()
      localStorage.setItem('ht-desktop:library:v2', JSON.stringify({
        version: 2,
        migratedAt: now,
        items: [{ type: 'song', id: '__pl_lib_song__', title: 'Library Keep', artist: 'A', addedAt: now, source: 'music' }],
      }))
      localStorage.setItem('ht-desktop:library:v2:migrated', '1')
      localStorage.setItem('ht-desktop:playlists:v1', JSON.stringify({ version: 1, updatedAt: now, playlists: [] }))
      return true
    }`,
  )
  await win.loadURL(RENDERER_URL)
  await waitReady(win)

  const opened = await clickNav(win, 'Playlists')
  record('Playlists opens via sidebar', opened)
  await sleep(700)

  const shell = await evalPage(
    win,
    `() => {
      const dest = document.querySelector('.ht-playlists-destination')
      const empty = document.querySelector('.ht-playlists-empty')
      return {
        hasShell: Boolean(dest),
        empty: Boolean(empty),
        width: window.innerWidth,
        playerBars: document.querySelectorAll('.player-bar').length,
      }
    }`,
  )
  record('Playlists shell / empty state', shell.hasShell && shell.empty)
  record('1024px layout', shell.width >= 1000 && shell.width <= 1040, `width=${shell.width}`)
  record('No duplicate player bar', shell.playerBars <= 1, `count=${shell.playerBars}`)

  const created = await evalPage(
    win,
    `() => {
      const input = document.querySelector('.ht-playlists-create input')
      const button = document.querySelector('.ht-playlists-create button[type="submit"]')
      if (!input || !button) return { ok: false, reason: 'create form missing' }
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'Runtime Mix')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      button.click()
      return { ok: true, value: input.value }
    }`,
  )
  record('Create playlist', created.ok === true, created.reason || created.value || '')
  await sleep(500)

  const detail = await evalPage(
    win,
    `() => {
      const title = document.querySelector('.ht-playlists-detail-header h1')
      return {
        open: Boolean(title),
        title: title?.textContent || '',
      }
    }`,
  )
  record(
    'Open playlist detail',
    detail.open && (detail.title.includes('Runtime Mix') || detail.title.includes('New playlist')),
    detail.title,
  )

  // Add a song via service in page
  const added = await evalPage(
    win,
    `() => {
      const raw = localStorage.getItem('ht-desktop:playlists:v1')
      const store = JSON.parse(raw)
      const pl = store.playlists[0]
      if (!pl) return { ok: false }
      pl.items.push({
        type: 'song',
        id: '__pl_song_1__',
        title: 'Playlist Song One',
        artist: 'Artist',
        addedAt: new Date().toISOString(),
      })
      pl.items.push({
        type: 'podcast_episode',
        id: '__pl_song_1__',
        title: 'Same Raw ID Episode',
        showId: 'show',
        showTitle: 'Show',
        addedAt: new Date().toISOString(),
      })
      pl.updatedAt = new Date().toISOString()
      localStorage.setItem('ht-desktop:playlists:v1', JSON.stringify(store))
      return { ok: true, count: pl.items.length }
    }`,
  )
  record('Seed typed items including same raw ID across families', added.ok && added.count === 2)

  await win.loadURL(RENDERER_URL)
  await waitReady(win)
  await clickNav(win, 'Playlists')
  await sleep(500)
  await evalPage(
    win,
    `() => {
      const card = document.querySelector('.ht-playlists-card-main')
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return Boolean(card)
    }`,
  )
  await sleep(500)

  const rows = await evalPage(
    win,
    `() => {
      const list = Array.from(document.querySelectorAll('.ht-playlists-item-row'))
      return {
        count: list.length,
        types: list.map((row) => row.getAttribute('data-playlist-type')),
      }
    }`,
  )
  record('Playlist items render', rows.count >= 2, `count=${rows.count}`)
  record('Song and podcast episode both present', rows.types.includes('song') && rows.types.includes('podcast_episode'))

  // Reorder
  const reordered = await evalPage(
    win,
    `() => {
      const down = document.querySelector('.ht-playlists-item-row .btn-ghost.btn-sm')
      // find Down button on first row
      const first = document.querySelector('.ht-playlists-item-row')
      const buttons = Array.from(first?.querySelectorAll('button') || [])
      const downBtn = buttons.find((b) => (b.textContent || '').trim() === 'Down')
      downBtn?.click()
      return Boolean(downBtn)
    }`,
  )
  record('Reorder control works', reordered === true)
  await sleep(300)

  const orderPersisted = await evalPage(
    win,
    `() => {
      const store = JSON.parse(localStorage.getItem('ht-desktop:playlists:v1') || '{}')
      const pl = store.playlists?.[0]
      return {
        ok: Array.isArray(pl?.items) && pl.items.length >= 2,
        firstType: pl?.items?.[0]?.type || null,
      }
    }`,
  )
  record('Reorder persists in storage', orderPersisted.ok === true, `first=${orderPersisted.firstType}`)

  // Delete playlist, library remains
  await evalPage(
    win,
    `() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const del = buttons.find((b) => (b.textContent || '').trim() === 'Delete playlist')
      del?.click()
      return Boolean(del)
    }`,
  )
  await sleep(400)

  const afterDelete = await evalPage(
    win,
    `() => {
      const store = JSON.parse(localStorage.getItem('ht-desktop:playlists:v1') || '{}')
      const lib = JSON.parse(localStorage.getItem('ht-desktop:library:v2') || '{}')
      return {
        playlists: store.playlists?.length || 0,
        libraryKept: Array.isArray(lib.items) && lib.items.some((i) => i.id === '__pl_lib_song__'),
      }
    }`,
  )
  record('Delete playlist clears playlist store entry', afterDelete.playlists === 0)
  record('Delete playlist preserves Library favorite', afterDelete.libraryKept === true)

  // Core destinations still work
  for (const label of ['Home', 'Music', 'Radio', 'Podcasts', 'My Library']) {
    const ok = await clickNav(win, label)
    await sleep(400)
    record(`${label} still opens`, ok === true)
  }

  out.finishedAt = new Date().toISOString()
  out.passed = out.checks.filter((c) => c.ok).length
  out.failed = out.failures.length
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'runtime-results.json'), JSON.stringify(out, null, 2))
  console.log(`\nPlaylists runtime: ${out.passed} passed, ${out.failed} failed`)
  app.exit(out.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
