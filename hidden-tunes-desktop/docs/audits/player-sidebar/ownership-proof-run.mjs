#!/usr/bin/env node
/**
 * Audit-only runtime ownership proof. Does not modify app source.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog, fetchApprovedCatalogRequest } = require('../../../electron/catalogBridge.js')
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outFile = path.join(ROOT, 'docs', 'audits', 'player-sidebar', 'ownership-proof.json')
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
      sidebar: Boolean(document.querySelector('.sidebar')),
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
      player: Boolean(document.querySelector('[data-ht-persistent-player="true"]')),
    })`)
    if (s.sidebar && s.player && !s.splash) return
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function clickNav(win, label) {
  await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    el?.click()
    return Boolean(el)
  }`)
  await sleep(900)
}

async function snapshot(win, label) {
  return evalPage(win, `() => {
    const rail = document.querySelector('[data-ht-persistent-player="true"]')
    const audio = [...document.querySelectorAll('audio')]
    const providers = document.querySelectorAll('[data-ht-playback-provider], #root')
    // Count React provider via data attribute if present; also count audio owners
    return {
      label: '${label}',
      nav: document.querySelector('.sidebar .nav-item.is-active, .sidebar .nav-item[aria-current="page"]')?.textContent?.trim() || null,
      audioCount: audio.length,
      audioHt: audio.filter((a) => a.getAttribute('data-ht-playback') === 'true').length,
      audioSrc: audio[0]?.currentSrc || audio[0]?.src || null,
      paused: audio[0]?.paused ?? null,
      currentTime: audio[0] ? Number(audio[0].currentTime.toFixed(3)) : null,
      railIdle: rail?.getAttribute('data-idle') || null,
      railPlaying: rail?.getAttribute('data-playing') || null,
      railFamily: rail?.getAttribute('data-family') || null,
      title: document.querySelector('.ht-player-track-title, .rail-psd-track-title')?.textContent?.trim() || null,
      persistentPlayers: document.querySelectorAll('[data-ht-persistent-player="true"]').length,
      providerRoots: document.querySelectorAll('[data-desktop-playback-provider="true"]').length,
      queuePanel: Boolean(document.querySelector('[data-ht-queue-panel="true"]')),
      queueRows: document.querySelectorAll('[data-ht-queue-panel="true"] .player-queue-row').length,
    }
  }`)
}

async function main() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-owner-proof-'))
  app.setPath('userData', userData)
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
  ipcMain.on('ht-runtime-info', (event) => {
    event.returnValue = {
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
    'ht-downloads-list', 'ht-downloads-disk-usage', 'ht-downloads-reconcile',
    'ht-downloads-start', 'ht-downloads-pause', 'ht-downloads-resume',
    'ht-downloads-cancel', 'ht-downloads-remove', 'ht-downloads-get-playable-url',
  ]) {
    ipcMain.handle(ch, async () => (
      ch.includes('list') ? [] : ch.includes('disk') ? { usedBytes: 0, itemCount: 0 } : { ok: true }
    ))
  }

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  await win.loadURL(URL)
  await waitReady(win)
  await clickNav(win, 'Home')
  await sleep(600)

  // Start a song
  await evalPage(win, `() => {
    document.querySelector('.music-home-hero-card-hit, .music-home-song-card, .music-home-all-songs-row, .music-home-room-card')?.click()
    return true
  }`)
  await sleep(2800)
  const afterPlay = await snapshot(win, 'after-play-home')

  // Capture track id / queue identity from provider state if exposed
  const sessionA = await evalPage(win, `() => {
    const audio = document.querySelector('audio[data-ht-playback="true"], audio')
    const title = document.querySelector('.ht-player-track-title, .rail-psd-track-title')?.textContent?.trim() || null
    const rows = [...document.querySelectorAll('[data-ht-queue-panel="true"] .player-queue-row')].map((el) => el.textContent?.trim()?.slice(0, 80))
    return {
      title,
      audioSrc: audio?.currentSrc || audio?.src || null,
      currentTime: audio ? Number(audio.currentTime.toFixed(3)) : null,
      paused: audio?.paused ?? null,
      queueRows: rows,
      audioNodes: document.querySelectorAll('audio').length,
    }
  }`)

  // Toggle queue open/close without restarting
  await evalPage(win, `() => {
    const btn = document.querySelector('.ht-player-queue-toggle')
    if (!btn) return false
    const pressed = btn.getAttribute('aria-pressed')
    btn.click()
    return pressed
  }`)
  await sleep(500)
  const afterQueueToggle1 = await snapshot(win, 'after-queue-toggle-1')
  const timeAfterToggle1 = await evalPage(win, `() => {
    const audio = document.querySelector('audio')
    return audio ? Number(audio.currentTime.toFixed(3)) : null
  }`)
  await evalPage(win, `() => { document.querySelector('.ht-player-queue-toggle')?.click(); return true }`)
  await sleep(500)
  const afterQueueToggle2 = await snapshot(win, 'after-queue-toggle-2')
  const timeAfterToggle2 = await evalPage(win, `() => {
    const audio = document.querySelector('audio')
    return { t: audio ? Number(audio.currentTime.toFixed(3)) : null, src: audio?.currentSrc || audio?.src || null, paused: audio?.paused ?? null }
  }`)

  // Navigate Home -> Radio -> Podcasts -> Home
  const trail = []
  for (const label of ['Radio', 'Podcasts', 'Home']) {
    await clickNav(win, label)
    trail.push(await snapshot(win, `nav-${label.toLowerCase()}`))
  }

  const final = await evalPage(win, `() => {
    const audio = [...document.querySelectorAll('audio')]
    const providers = document.querySelectorAll('[data-desktop-playback-provider="true"]').length
    // Heuristic: DesktopPlaybackProvider is single if one audio[data-ht-playback]
    return {
      audioCount: audio.length,
      htAudioCount: audio.filter((a) => a.getAttribute('data-ht-playback') === 'true').length,
      persistentPlayers: document.querySelectorAll('[data-ht-persistent-player="true"]').length,
      tvRails: document.querySelectorAll('.tv-rail').length,
      providerMarkers: providers,
      title: document.querySelector('.ht-player-track-title, .rail-psd-track-title')?.textContent?.trim() || null,
      src: audio[0]?.currentSrc || audio[0]?.src || null,
      currentTime: audio[0] ? Number(audio[0].currentTime.toFixed(3)) : null,
      paused: audio[0]?.paused ?? null,
      encodingSample: document.querySelector('.ht-player-track-title, .rail-psd-track-title')?.textContent || null,
    }
  }`)

  const proof = {
    startedAt: new Date().toISOString(),
    afterPlay,
    sessionA,
    afterQueueToggle1,
    timeAfterToggle1,
    afterQueueToggle2,
    timeAfterToggle2,
    trail,
    final,
    assertions: {
      oneAudioAfterPlay: afterPlay.audioCount === 1,
      oneHtAudioAfterPlay: afterPlay.audioHt <= 1,
      onePersistentPlayer: afterPlay.persistentPlayers === 1,
      srcStableAcrossQueueToggle: sessionA.audioSrc === timeAfterToggle2.src,
      oneAudioAfterNav: trail.every((s) => s.audioCount <= 1),
      onePlayerAfterNav: trail.every((s) => s.persistentPlayers === 1),
      titleSurvivedNav: Boolean(final.title) && final.title === sessionA.title,
      srcSurvivedNav: Boolean(final.src) && final.src === sessionA.audioSrc,
    },
  }
  proof.assertions.allPass = Object.values(proof.assertions).every(Boolean)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, JSON.stringify(proof, null, 2))
  console.log(JSON.stringify(proof.assertions, null, 2))
  console.log('PROOF_FILE', outFile)
  app.exit(proof.assertions.allPass ? 0 : 1)
}

app.whenReady().then(() => main().catch((e) => {
  console.error(e)
  app.exit(1)
}))
