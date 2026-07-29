#!/usr/bin/env node
/**
 * Capture Home before/after proof that DEV Audio Versions are absent from public UI.
 * Requires Vite on :5173.
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const catalogBridge = require('../electron/catalogBridge.js')
const { fetchApprovedCatalog, fetchApprovedCatalogRequest } = catalogBridge
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outDir = path.join(ROOT, 'docs', 'audits', 'dev-audio-leak')

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
      home: Boolean(document.querySelector('.music-home, .page-view[data-page="home"]')),
    })`)
    if (s.sidebar && s.home && !s.splash) return s
    await sleep(400)
  }
  throw new Error('UI not ready')
}

async function waitCatalog(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 90000) {
    const s = await evalPage(win, `() => {
      const text = document.body?.innerText || ''
      const empty = /Your newest picks will appear here after the catalog loads/i.test(text)
      const hero = document.querySelectorAll('.music-home-hero-card, .music-home-song-card, .music-home-all-songs-row').length
      const songsReady = /([1-9]\\d*)\\+?\\s+songs ready/i.test(text)
      return { empty, hero, songsReady, hasDev: /DEV Audio Versions/i.test(text) }
    }`)
    if (!s.empty && (s.hero > 0 || s.songsReady)) return s
    await sleep(500)
  }
  return null
}

async function capture(win, name) {
  const img = await win.webContents.capturePage()
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  console.log(`SHOT: ${file}`)
  return file
}

async function probeHome(win) {
  return evalPage(win, `() => {
    const text = document.body?.innerText || ''
    const heroCards = [...document.querySelectorAll('.music-home-hero-card')].map((el) =>
      (el.textContent || '').replace(/\\s+/g, ' ').trim(),
    )
    const titles = [...document.querySelectorAll('.music-home-hero-card-title, .music-home-song-title, .music-home-all-songs-title')]
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 24)
    return {
      hasDevAudioText: /DEV Audio Versions/i.test(text),
      hasDiagnosticsLabel: /\\bDIAGNOSTICS\\b/.test(text),
      hasFeatured: /\\bFEATURED\\b/.test(text),
      hasPick: /\\bPICK\\b/.test(text),
      heroCards,
      titles,
      songCountHint: (text.match(/\\d+\\+?\\s+songs ready/i) || [])[0] || null,
    }
  }`)
}

async function clickNav(win, label) {
  await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').trim().toLowerCase() === '${label}'.toLowerCase())
    el?.click()
    return Boolean(el)
  }`)
  await sleep(1000)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-dev-audio-audit-'))
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
    if (!cleanPath.startsWith('/api/')) throw new Error('Catalog path is not allowed.')
    if (method !== 'GET' && method !== 'POST') throw new Error('Catalog method is not allowed.')
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
  ipcMain.handle('ht-downloads-list', async () => [])
  ipcMain.handle('ht-downloads-disk-usage', async () => ({ usedBytes: 0, itemCount: 0 }))
  ipcMain.handle('ht-downloads-reconcile', async () => ({ ok: true, removed: 0 }))

  await app.whenReady()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#030008',
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  await win.loadURL(URL)
  await waitReady(win)
  await clickNav(win, 'Home')
  const catalogState = await waitCatalog(win)
  console.log('CATALOG_STATE', JSON.stringify(catalogState))
  await sleep(800)

  const homeProbe = await probeHome(win)
  await capture(win, '03-home-after-fix')
  await capture(win, '04-home-legitimate-music')

  await clickNav(win, 'Search')
  await sleep(800)
  await evalPage(win, `() => {
    const input = document.querySelector('input[type="search"], .home-top-search input, .discover-search input, input[placeholder*="Search"]')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, 'DEV Audio Versions')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    return true
  }`)
  await sleep(1800)
  const searchProbe = await evalPage(win, `() => {
    const resultNodes = [...document.querySelectorAll(
      '.search-result, .discover-card, .music-discover-song-row, .global-search-item, [data-search-result], .song-row, .music-home-song-card',
    )]
    const resultText = resultNodes.map((el) => (el.textContent || '').trim()).join('\\n')
    const queryEcho = /Showing results for/i.test(document.body?.innerText || '')
    return {
      queryEcho,
      resultHasDevAudio: /DEV Audio Versions/i.test(resultText),
      resultSample: resultText.slice(0, 800),
      resultCount: resultNodes.length,
    }
  }`)
  await capture(win, '05-search-dev-audio-hidden')

  let apiSample = null
  try {
    const songs = await fetchApprovedCatalog('/api/songs?page=1&limit=20')
    const list = Array.isArray(songs) ? songs : songs?.songs || songs?.data || []
    apiSample = {
      count: Array.isArray(list) ? list.length : 0,
      titles: (Array.isArray(list) ? list : []).slice(0, 10).map((s) => s?.title || s?.name || null),
      hasDevIds: (Array.isArray(list) ? list : []).some((s) => String(s?.id || '').startsWith('dev-audio-version-')),
      hasDevTitle: (Array.isArray(list) ? list : []).some((s) => /DEV Audio Versions/i.test(String(s?.title || ''))),
    }
  } catch (err) {
    apiSample = { error: String(err?.message || err) }
  }

  const harnessAvailable = fs
    .readFileSync(path.join(ROOT, 'src/lib/devAudioVersionTestHarness.ts'), 'utf8')
    .includes('export function getDevAudioVersionTestSongs')

  const proof = {
    homeProbe,
    searchProbe,
    apiSample,
    catalogState,
    diagnosticGetterAvailable: harnessAvailable,
    expectations: {
      homeMustNotShowDevAudio: homeProbe.hasDevAudioText === false,
      searchResultsMustNotShowDevAudio: searchProbe.resultHasDevAudio === false,
      apiMustNotContainHarness: apiSample?.hasDevIds === false && apiSample?.hasDevTitle === false,
      diagnosticFixtureStillAvailable: harnessAvailable === true,
    },
  }
  fs.writeFileSync(path.join(outDir, 'after-proof.json'), JSON.stringify(proof, null, 2))
  console.log('PROOF', JSON.stringify(proof.expectations))
  console.log('HOME', JSON.stringify({ hasDev: homeProbe.hasDevAudioText, titles: homeProbe.titles.slice(0, 8), featured: homeProbe.hasFeatured }))
  console.log('SEARCH', JSON.stringify(searchProbe))
  console.log('API', JSON.stringify(apiSample))

  const failed = Object.values(proof.expectations).some((v) => v !== true)
  if (failed) {
    console.error('FAIL: expectations not met')
    app.exit(1)
    return
  }
  console.log('DONE')
  app.exit(0)
}

main().catch((err) => {
  console.error(err)
  app.exit(1)
})
