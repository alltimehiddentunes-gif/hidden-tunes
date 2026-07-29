#!/usr/bin/env node
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog, fetchApprovedCatalogRequest } = require('../electron/catalogBridge.js')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outDir = path.join(ROOT, 'docs', 'audits', 'creators-orbit')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const evalPage = (win, src) => win.webContents.executeJavaScript(`(${src})()`, true)

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-creators-diag-')))
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(URL)
      if (res.ok || res.status === 304) break
    } catch {}
    await sleep(400)
  }

  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    return fetchApprovedCatalog(p)
  })
  ipcMain.handle('ht-catalog-request', async (_e, options) => {
    const cleanPath = typeof options?.path === 'string' ? options.path.trim() : ''
    const methodRaw = typeof options?.method === 'string' ? options.method.trim().toUpperCase() : 'GET'
    const method = methodRaw === 'POST' ? 'POST' : methodRaw === 'GET' ? 'GET' : ''
    const body = options?.body === undefined ? null : options.body
    if (!cleanPath.startsWith('/api/')) throw new Error('bad path')
    if (method !== 'GET' && method !== 'POST') throw new Error('bad method')
    return fetchApprovedCatalogRequest({ path: cleanPath, method, body })
  })
  ipcMain.on('ht-runtime-info', (e) => {
    e.returnValue = {
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
  for (const ch of [
    'ht-downloads-list',
    'ht-downloads-disk-usage',
    'ht-downloads-reconcile',
    'ht-downloads-start',
    'ht-downloads-pause',
    'ht-downloads-resume',
    'ht-downloads-cancel',
    'ht-downloads-remove',
    'ht-downloads-get-playable-url',
  ]) {
    ipcMain.handle(ch, async () =>
      ch.includes('list') ? [] : ch.includes('disk') ? { usedBytes: 0, itemCount: 0 } : { ok: true },
    )
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  const consoleErrors = []
  win.webContents.on('console-message', (_e, _level, message) => {
    if (/error|catalog|fail|abort/i.test(String(message))) {
      consoleErrors.push(String(message).slice(0, 300))
    }
  })

  await win.loadURL(URL)
  for (let i = 0; i < 90; i++) {
    const s = await evalPage(
      win,
      `() => ({
        splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
        home: Boolean(document.querySelector('.music-home')),
        sidebar: Boolean(document.querySelector('.sidebar')),
      })`,
    )
    if (s.sidebar && !s.splash) break
    await sleep(400)
  }

  await evalPage(
    win,
    `() => {
      ;[...document.querySelectorAll('.sidebar .nav-item')].find((n) =>
        /home/i.test(n.textContent || ''),
      )?.click()
      return true
    }`,
  )
  await sleep(8000)

  const dump = await evalPage(
    win,
    `async () => {
      const sections = [...document.querySelectorAll('.music-home-section h2, .music-home h2')].map(
        (h) => h.textContent.trim(),
      )
      let expressProbe = null
      try {
        const r = await fetch('https://hidden-tunes-api.onrender.com/api/songs?page=1&limit=2', {
          headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' },
        })
        const t = await r.text()
        expressProbe = { status: r.status, len: t.length, head: t.slice(0, 120) }
      } catch (e) {
        expressProbe = { error: String(e) }
      }
      const refresh = [...document.querySelectorAll('button')].find((b) =>
        /refresh catalog/i.test(b.textContent || ''),
      )
      refresh?.click()
      return {
        sections,
        artistCards: document.querySelectorAll('.music-home-artist-card').length,
        songCards: document.querySelectorAll('.music-home-song-card').length,
        err: [...document.querySelectorAll('[role=alert], .music-home-section-error')]
          .map((e) => e.textContent.trim())
          .slice(0, 5),
        hasCreators: /Creators In Your Orbit/i.test(document.body.innerText || ''),
        homeClass: document.querySelector('.music-home')?.className || null,
        expressProbe,
        runtime: window.hiddenTunesDesktop?.getRuntimeInfo?.() || null,
        text: (document.body.innerText || '').slice(0, 2000),
      }
    }`,
  )
  await sleep(15000)
  const afterRefresh = await evalPage(
    win,
    `async () => {
      let bootstrapProbe = null
      try {
        const base = 'https://hidden-tunes-api.onrender.com'
        const [songs, albums, artists] = await Promise.all([
          fetch(base + '/api/songs?page=1&limit=40', { headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' } }).then((r) => r.json()),
          fetch(base + '/api/albums?page=1&limit=40', { headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' } }).then((r) => r.json()),
          fetch(base + '/api/artists?page=1&limit=40', { headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' } }).then((r) => r.json()),
        ])
        const songArr = Array.isArray(songs) ? songs : []
        const artistArr = artists?.artists || []
        bootstrapProbe = {
          songs: songArr.length,
          albums: albums?.albums?.length ?? null,
          artists: artistArr.length,
          artistsWithTracks: artistArr.filter((a) => Array.isArray(a.tracks) && a.tracks.length > 0).length,
          sampleArtist: artistArr[0]
            ? { id: artistArr[0].id, name: artistArr[0].name, tracks: (artistArr[0].tracks || []).length, songCount: artistArr[0].songCount }
            : null,
        }
      } catch (e) {
        bootstrapProbe = { error: String(e) }
      }
      return {
        sections: [...document.querySelectorAll('.music-home-section h2, .music-home h2')].map((h) =>
          h.textContent.trim(),
        ),
        artistCards: document.querySelectorAll('.music-home-artist-card').length,
        songCards: document.querySelectorAll('.music-home-song-card').length,
        hasCreators: /Creators In Your Orbit/i.test(document.body.innerText || ''),
        creatorCards: [...document.querySelectorAll('.music-home-artist-card')].map((btn) => ({
          name: btn.querySelector('strong')?.textContent?.trim() || '',
          count: btn.querySelector('span')?.textContent?.trim() || null,
        })),
        songsReady: (document.body.innerText || '').match(/[\\d,+]+\\s*songs ready/i)?.[0] || null,
        overlay: document.querySelector('vite-error-overlay')?.shadowRoot?.textContent?.slice(0, 500) || null,
        bootstrapProbe,
        localStorageKeys: Object.keys(localStorage).filter((k) => /catalog|music/i.test(k)).slice(0, 20),
      }
    }`,
  )

  const out = { dump, afterRefresh, consoleErrors: consoleErrors.slice(0, 40) }
  fs.writeFileSync(path.join(outDir, 'diag-home.json'), JSON.stringify(out, null, 2))
  fs.writeFileSync(path.join(outDir, 'diag-home.png'), (await win.webContents.capturePage()).toPNG())
  console.log(JSON.stringify(out, null, 2))
  app.exit(0)
}

app.whenReady().then(() =>
  main().catch((e) => {
    console.error(e)
    app.exit(1)
  }),
)
