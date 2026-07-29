#!/usr/bin/env node
/**
 * Audit-only: dump Creators In Your Orbit raw eligibility from live Home.
 */
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

async function waitReady(win) {
  for (let i = 0; i < 120; i++) {
    const s = await evalPage(win, `() => ({
      home: Boolean(document.querySelector('.music-home')),
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
    })`)
    if (s.home && !s.splash) return
    await sleep(400)
  }
  throw new Error('Home not ready')
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-creators-audit-')))
  await waitUrl(URL)
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
      isPackaged: false, environment: 'development', ok: true,
      errors: [], warnings: [], expressConfigured: true, adminConfigured: true, sportsPilotConfigured: false,
    }
  })
  for (const ch of ['ht-downloads-list', 'ht-downloads-disk-usage', 'ht-downloads-reconcile', 'ht-downloads-start', 'ht-downloads-pause', 'ht-downloads-resume', 'ht-downloads-cancel', 'ht-downloads-remove', 'ht-downloads-get-playable-url']) {
    ipcMain.handle(ch, async () => (ch.includes('list') ? [] : ch.includes('disk') ? { usedBytes: 0, itemCount: 0 } : { ok: true }))
  }

  const win = new BrowserWindow({
    width: 1440, height: 900, show: true,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  })
  await win.loadURL(URL)
  await waitReady(win)
  await evalPage(win, `() => {
    [...document.querySelectorAll('.sidebar .nav-item')].find((n) => /home/i.test(n.textContent || ''))?.click()
    return true
  }`)
  await sleep(1200)

  const beforeShot = await win.webContents.capturePage()
  fs.writeFileSync(path.join(outDir, '01-creators-before-full.png'), beforeShot.toPNG())

  const clip = await evalPage(win, `() => {
    const section = [...document.querySelectorAll('.music-home section, .music-home-section')].find((el) =>
      /Creators In Your Orbit/i.test(el.textContent || '')
    )
    if (!section) return null
    const r = section.getBoundingClientRect()
    return { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) }
  }`)
  if (clip) {
    const img = await win.webContents.capturePage(clip)
    fs.writeFileSync(path.join(outDir, '01-creators-before-section.png'), img.toPNG())
  }

  const dump = await evalPage(win, `() => {
    const cards = [...document.querySelectorAll('.music-home-artist-card')].map((btn) => ({
      name: btn.querySelector('strong')?.textContent?.trim() || '',
      countLabel: btn.querySelector('span')?.textContent?.trim() || '',
      aria: btn.getAttribute('aria-label') || '',
    }))
    // Probe React props via window if unavailable — rebuild from DOM + catalog bridge not possible.
    // Instead inspect visible labels and any data attributes.
    return {
      cardCount: cards.length,
      cards,
      sectionPresent: /Creators In Your Orbit/i.test(document.body.innerText || ''),
      songCardsSample: [...document.querySelectorAll('.music-home-song-card')].slice(0, 5).map((el) => ({
        title: el.querySelector('strong')?.textContent?.trim(),
        artist: el.querySelector('span')?.textContent?.trim(),
      })),
    }
  }`)

  // Deeper: evaluate builders by importing isn't available in renderer; dump catalog from window globals if any.
  const deep = await evalPage(win, `async () => {
    const bridge = window.hiddenTunesDesktop?.catalog
    if (!bridge?.getJson && !bridge?.requestJson) {
      return { bridge: false }
    }
    const get = async (p) => {
      if (bridge.getJson) return bridge.getJson(p)
      return bridge.requestJson({ path: p, method: 'GET' })
    }
    let artistsPayload = null
    let songsPayload = null
    try { artistsPayload = await get('/api/artists?limit=20&sort=az') } catch (e) { artistsPayload = { error: String(e) } }
    try { songsPayload = await get('/api/songs?limit=50&sort=latest') } catch (e) { songsPayload = { error: String(e) } }
    const artists = artistsPayload?.artists || artistsPayload?.items || artistsPayload || []
    const list = Array.isArray(artists) ? artists : (artists.items || [])
    const songs = songsPayload?.songs || songsPayload?.items || []
    const songList = Array.isArray(songs) ? songs : []
    const byArtistId = new Map()
    const byArtistName = new Map()
    for (const s of songList) {
      if (s.artistId) {
        const arr = byArtistId.get(String(s.artistId)) || []
        arr.push(s)
        byArtistId.set(String(s.artistId), arr)
      }
      const key = String(s.artist || '').trim().toLowerCase()
      if (key) {
        const arr = byArtistName.get(key) || []
        arr.push(s)
        byArtistName.set(key, arr)
      }
    }
    const sample = list.slice(0, 12).map((a) => {
      const id = String(a.id)
      const name = String(a.name || '')
      const byId = byArtistId.get(id) || []
      const byName = byArtistName.get(name.trim().toLowerCase()) || []
      const tracks = Array.isArray(a.tracks) ? a.tracks : []
      const hasUrl = (s) => Boolean(s?.audioUrl || s?.previewUrl || s?.audioVersions?.standard?.url || s?.highQualityUrl)
      return {
        id,
        name,
        apiSongCount: a.songCount ?? a.song_count ?? null,
        tracksLen: tracks.length,
        indexedById: byId.length,
        indexedByName: byName.length,
        playableById: byId.filter(hasUrl).length,
        playableByName: byName.filter(hasUrl).length,
        artwork: a.artwork || a.artwork_url || null,
        sampleSongTitles: (byId.length ? byId : byName).slice(0, 3).map((s) => s.title),
      }
    })
    const songUrlStats = {
      total: songList.length,
      withUrl: songList.filter((s) => s.audioUrl || s.previewUrl || s.highQualityUrl).length,
      withArtistId: songList.filter((s) => s.artistId).length,
    }
    return { bridge: true, sample, songUrlStats, artistTotal: list.length }
  }`)

  const out = { dump, deep, clip }
  fs.writeFileSync(path.join(outDir, 'raw-creators-audit.json'), JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  app.exit(0)
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(1) }))
