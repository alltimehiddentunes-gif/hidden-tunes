#!/usr/bin/env node
/**
 * Deterministic Home visual audit.
 *
 * Vite must already be running (defaults to http://localhost:5173). This process
 * redirects only this Electron session's catalog calls to an ephemeral local
 * fixture server. Production catalog code and records are never changed.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const EXPECTED_ROOT = path.normalize('D:\\HiddenTunes\\Active\\HiddenTunes-Desktop\\hidden-tunes-desktop')
const EXPECTED_GIT_ROOT = path.normalize('D:\\HiddenTunes\\Active\\HiddenTunes-Desktop')
const EXPECTED_BRANCH = 'desktop/integrate-home-music-split'
const RENDERER_URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outDir = path.join(ROOT, 'docs', 'audits', 'player-sidebar')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const auditUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-home-visual-audit-'))
app.setPath('userData', auditUserData)

const artworkNames = [
  'release-golden-hour.webp',
  'release-better-days.webp',
  'release-echoes.webp',
  'release-electric-hearts.webp',
  'release-lost-in-tokyo.webp',
  'release-sunset-dreams.webp',
  'mood-chill.webp',
  'mood-party.webp',
  'mood-focus.webp',
  'mood-road-trip.webp',
  'mood-romance.webp',
  'mood-workout.webp',
]

function wavTone(seconds = 120, sampleRate = 8000) {
  const samples = seconds * sampleRate
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i += 1) {
    buffer.writeInt16LE(Math.round(Math.sin((i * Math.PI * 2 * 220) / sampleRate) * 500), 44 + i * 2)
  }
  return buffer
}

function buildFixtures(origin) {
  const artistNames = ['Amara Vale', 'Kofi Amani', 'Lina Grey', 'The Night Choir']
  const songs = Array.from({ length: 24 }, (_, index) => ({
    id: `visual-audit-song-${index + 1}`,
    title: [
      'Golden Hour', 'Better Days', 'Echoes', 'Electric Hearts', 'Lost in Tokyo', 'Sunset Dreams',
      'Midnight Drive', 'Stay Awhile', 'Northern Lights', 'Open Skies', 'Afterglow', 'New Horizons',
    ][index % 12],
    artist: artistNames[index % artistNames.length],
    artistId: `visual-audit-artist-${(index % artistNames.length) + 1}`,
    album: `Hidden Sessions Vol. ${(index % 4) + 1}`,
    albumId: `visual-audit-album-${(index % 6) + 1}`,
    genre: ['Afrobeats', 'R&B', 'Pop', 'Soul', 'Worship', 'Hip-Hop'][index % 6],
    mood: ['Chill', 'Party', 'Focus', 'Road Trip', 'Romance', 'Workout'][index % 6],
    tags: ['visual-audit', 'local-fixture'],
    description: 'Local deterministic content for Home visual validation.',
    artwork: `${RENDERER_URL}/home-reference/${artworkNames[index % artworkNames.length]}`,
    audioUrl: `${origin}/audit-tone.wav`,
    duration_seconds: 120,
    created_at: new Date(Date.UTC(2026, 0, 24 - index)).toISOString(),
  }))
  const albums = Array.from({ length: 6 }, (_, index) => ({
    id: `visual-audit-album-${index + 1}`,
    title: `Hidden Sessions Vol. ${index + 1}`,
    artwork: `${RENDERER_URL}/home-reference/${artworkNames[index]}`,
    release_year: 2026,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    artistId: `visual-audit-artist-${(index % artistNames.length) + 1}`,
  }))
  const artists = artistNames.map((name, index) => ({
    id: `visual-audit-artist-${index + 1}`,
    name,
    artwork: `${RENDERER_URL}/home-reference/${artworkNames[index + 6]}`,
    songCount: 6,
    tracks: songs.filter((song) => song.artistId === `visual-audit-artist-${index + 1}`),
  }))
  return { songs, albums, artists }
}

async function startFixtureServer() {
  const tone = wavTone()
  let fixtures
  const server = http.createServer((request, response) => {
    fs.appendFileSync(path.join(outDir, 'visual-audit-network.log'), `FIXTURE ${request.method} ${request.url}\n`)
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Cache-Control', 'no-store')
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
    if (requestUrl.pathname === '/audit-tone.wav') {
      response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': tone.length })
      response.end(tone)
      return
    }
    response.setHeader('Content-Type', 'application/json')
    if (requestUrl.pathname === '/api/songs') {
      response.end(JSON.stringify(fixtures.songs))
    } else if (requestUrl.pathname === '/api/albums') {
      response.end(JSON.stringify({ albums: fixtures.albums, count: fixtures.albums.length }))
    } else if (requestUrl.pathname === '/api/artists') {
      response.end(JSON.stringify({ artists: fixtures.artists, count: fixtures.artists.length }))
    } else {
      response.writeHead(404)
      response.end(JSON.stringify({ error: 'visual audit fixture route not found' }))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind')
  const origin = `http://127.0.0.1:${address.port}`
  fixtures = buildFixtures(origin)
  return { server, origin, fixtures, tone }
}

function proveWorkspace() {
  const gitRoot = path.normalize(execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim())
  const branch = execFileSync('git', ['branch', '--show-current'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  if (path.normalize(ROOT).toLowerCase() !== EXPECTED_ROOT.toLowerCase()) {
    throw new Error(`wrong workspace: ${ROOT}`)
  }
  if (gitRoot.toLowerCase() !== EXPECTED_GIT_ROOT.toLowerCase()) {
    throw new Error(`wrong Git root: ${gitRoot}`)
  }
  if (branch !== EXPECTED_BRANCH) throw new Error(`wrong branch: ${branch}`)
  console.log('WORKSPACE_PROOF', JSON.stringify({ root: ROOT, gitRoot, branch }))
}

async function waitUrl(url, timeoutMs = 60000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await fetch(url)
      if (result.ok || result.status === 304) return
    } catch {}
    await sleep(400)
  }
  throw new Error(`renderer timeout: ${url}`)
}

async function evalPage(win, source) {
  return win.webContents.executeJavaScript(`(${source})()`, true)
}

async function waitFor(win, description, source, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await evalPage(win, source)) return
    await sleep(150)
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function waitForHydratedHome(win) {
  await waitFor(win, 'Home catalog content', `() =>
    Boolean(
      document.querySelector('.music-home-product-hero')
      && document.querySelector('.music-home-mix-column')
      && document.querySelectorAll('.music-home-release-card').length >= 6
      && !document.querySelector('.launch-screen, #launch-splash')
    )
  `, 90000)
  await evalPage(win, `() => {
    const scrollContainer = document.querySelector('.main-scroll')
    if (scrollContainer) scrollContainer.scrollTop = 0
    window.scrollTo(0, 0)
    return true
  }`)
  await waitFor(win, 'hydrated Home catalog and artwork', `() => {
    const images = [
      document.querySelector('.music-home-mix-card img'),
      ...[...document.querySelectorAll('.music-home-release-card img')].slice(0, 6),
    ].filter(Boolean)
    return Boolean(
      images.length === 7
      && images.every((image) => image.complete && image.naturalWidth > 0)
    )
  }`, 90000)
  await evalPage(win, `() => {
    const home = document.querySelector('.music-home')
    home.dataset.visualAuditMount = 'stable-home'
    return true
  }`)
}

async function readState(win) {
  return evalPage(win, `() => {
    const shell = document.querySelector('.app-shell')
    const rail = document.querySelector('[data-ht-persistent-player="true"]')
    const images = [
      document.querySelector('.music-home-mix-card img'),
      ...[...document.querySelectorAll('.music-home-release-card img')].slice(0, 6),
    ].filter(Boolean)
    return {
      route: document.querySelector('.page-view')?.getAttribute('data-nav') || '',
      home: Boolean(document.querySelector('.music-home[data-visual-audit-mount="stable-home"]')),
      hero: Boolean(document.querySelector('.music-home-product-hero')),
      releases: document.querySelectorAll('.music-home-release-card').length,
      mix: Boolean(document.querySelector('.music-home-mix-column')),
      quick: Boolean(document.querySelector('.music-home-active-quick-access')),
      active: shell?.getAttribute('data-has-active-media') === 'true',
      player: Boolean(rail),
      playing: rail?.getAttribute('data-playing') === 'true',
      bottomTransport: Boolean(document.querySelector('.player-bar')),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      brokenImages: images.filter((image) => !image.complete || image.naturalWidth <= 0).length,
      heroWidth: Math.round(document.querySelector('.music-home-product-hero')?.getBoundingClientRect().width || 0),
      playerWidth: Math.round(rail?.getBoundingClientRect().width || 0),
    }
  }`)
}

function assertState(label, state, expected) {
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(`${label}: expected ${key}=${value}, received ${JSON.stringify(state[key])}`)
    }
  }
  if (!state.home || !state.hero || state.releases < 6 || state.brokenImages !== 0 || state.overflow) {
    throw new Error(`${label}: invalid Home evidence ${JSON.stringify(state)}`)
  }
}

async function capture(win, name) {
  await evalPage(win, `() => {
    const scrollContainer = document.querySelector('.main-scroll')
    if (scrollContainer) scrollContainer.scrollTop = 0
    window.scrollTo(0, 0)
    return true
  }`)
  await sleep(120)
  const image = await win.webContents.capturePage()
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, image.toPNG())
  if (fs.statSync(file).size < 50_000) throw new Error(`${name}: suspiciously small screenshot`)
  console.log('SHOT', file)
}

async function startPlayback(win) {
  const clicked = await evalPage(win, `() => {
    const button = document.querySelector('.music-home-product-hero-primary')
    button?.click()
    return Boolean(button)
  }`)
  if (!clicked) throw new Error('Start Listening control missing')
  await waitFor(win, 'authoritative playing session', `() => {
    const rail = document.querySelector('[data-ht-persistent-player="true"]')
    return document.querySelector('.app-shell')?.getAttribute('data-has-active-media') === 'true'
      && rail?.getAttribute('data-playing') === 'true'
      && Boolean(document.querySelector('.player-bar'))
      && !document.querySelector('.music-home-mix-column')
  }`)
}

async function stopPlayback(win) {
  const stopped = await evalPage(win, `() => {
    const seam = window.__HT_HOME_VISUAL_AUDIT__
    seam?.stop()
    return Boolean(seam?.stop)
  }`)
  if (!stopped) throw new Error('development-only visual audit stop seam unavailable')
  await waitFor(win, 'authoritative stopped session', `() =>
    document.querySelector('.app-shell')?.getAttribute('data-has-active-media') === 'false'
    && Boolean(document.querySelector('.music-home-mix-column'))
    && Boolean(
      document.querySelector('.music-home-mix-card img')?.complete
      && document.querySelector('.music-home-mix-card img')?.naturalWidth > 0
    )
    && !document.querySelector('[data-ht-persistent-player="true"]')
    && !document.querySelector('.player-bar')
  `)
}

async function main() {
  proveWorkspace()
  fs.mkdirSync(outDir, { recursive: true })
  console.log('AUDIT_STAGE', 'starting-fixture-server')
  const { server, origin, fixtures, tone } = await startFixtureServer()
  console.log('AUDIT_STAGE', 'fixture-ready', origin)
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
  await waitUrl(RENDERER_URL)

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
  for (const channel of ['ht-downloads-list', 'ht-downloads-reconcile']) {
    ipcMain.handle(channel, async () => [])
  }
  ipcMain.handle('ht-downloads-disk-usage', async () => ({ usedBytes: 0, itemCount: 0 }))

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    show: true,
    backgroundColor: '#050508',
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const consoleErrors = []
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) consoleErrors.push({ level, message, line, sourceId })
  })
  win.webContents.session.webRequest.onBeforeRequest({
    urls: ['http://*/*', 'https://*/*'],
  }, (details, callback) => {
    const requestUrl = new URL(details.url)
    if (/api|song|album|artist|audit-tone/i.test(requestUrl.pathname)) {
      fs.appendFileSync(
        path.join(outDir, 'visual-audit-network.log'),
        `REQUEST ${details.method} ${details.url}\n`,
      )
    }
    callback({})
  })
  win.webContents.debugger.attach('1.3')
  win.webContents.debugger.on('message', async (_event, method, params) => {
    if (method !== 'Fetch.requestPaused') return
    const requestUrl = new URL(params.request.url)
    let body = null
    let contentType = 'application/json'
    if (requestUrl.pathname === '/api/songs') {
      body = Buffer.from(JSON.stringify(fixtures.songs))
    } else if (requestUrl.pathname === '/api/albums') {
      body = Buffer.from(JSON.stringify({ albums: fixtures.albums, count: fixtures.albums.length }))
    } else if (requestUrl.pathname === '/api/artists') {
      body = Buffer.from(JSON.stringify({ artists: fixtures.artists, count: fixtures.artists.length }))
    } else if (requestUrl.pathname === '/audit-tone.wav') {
      body = tone
      contentType = 'audio/wav'
    }
    try {
      if (body) {
        fs.appendFileSync(
          path.join(outDir, 'visual-audit-network.log'),
          `FULFILL ${params.request.method} ${params.request.url}\n`,
        )
        await win.webContents.debugger.sendCommand('Fetch.fulfillRequest', {
          requestId: params.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: contentType },
            { name: 'Access-Control-Allow-Origin', value: '*' },
            { name: 'Cache-Control', value: 'no-store' },
          ],
          body: body.toString('base64'),
        })
      } else {
        await win.webContents.debugger.sendCommand('Fetch.continueRequest', {
          requestId: params.requestId,
        })
      }
    } catch (error) {
      console.error('AUDIT_FETCH_INTERCEPT_FAIL', error)
    }
  })
  await win.webContents.debugger.sendCommand('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/songs?*', requestStage: 'Request' },
      { urlPattern: '*/api/albums?*', requestStage: 'Request' },
      { urlPattern: '*/api/artists?*', requestStage: 'Request' },
      { urlPattern: '*/audit-tone.wav', requestStage: 'Request' },
    ],
  })

  const auditUrl = new URL(RENDERER_URL)
  auditUrl.searchParams.set('visualAudit', 'home')
  await win.loadURL(auditUrl.toString())
  console.log('AUDIT_STAGE', 'renderer-loaded')
  await waitForHydratedHome(win)
  console.log('AUDIT_STAGE', 'home-hydrated')

  const results = {}
  const captureIdleAndPlaying = async (width, height, includePauseStop = false) => {
    win.setSize(width, height)
    await sleep(350)
    const idleName = `home-mix-${width}-idle`
    const idleState = await readState(win)
    assertState(idleName, idleState, {
      route: 'home', mix: true, quick: false, active: false, player: false,
      bottomTransport: false, playing: false,
    })
    results[idleName] = idleState
    await capture(win, idleName)

    await startPlayback(win)
    const playingName = `home-mix-${width}-playing`
    const playingState = await readState(win)
    assertState(playingName, playingState, {
      route: 'home', mix: false, quick: true, active: true, player: true,
      bottomTransport: true, playing: true,
    })
    if (playingState.playerWidth > 336) {
      throw new Error(`${playingName}: player width ${playingState.playerWidth}px exceeds 336px`)
    }
    results[playingName] = playingState
    await capture(win, playingName)

    if (includePauseStop) {
      const paused = await evalPage(win, `() => {
        const button = document.querySelector('button[aria-label="Pause"]')
        button?.click()
        return Boolean(button)
      }`)
      if (!paused) throw new Error('authoritative Pause control missing')
      await waitFor(win, 'paused state', `() =>
        document.querySelector('[data-ht-persistent-player="true"]')?.getAttribute('data-playing') === 'false'
        && document.querySelector('.app-shell')?.getAttribute('data-has-active-media') === 'true'
      `)
      const pausedName = `home-mix-${width}-paused`
      const pausedState = await readState(win)
      assertState(pausedName, pausedState, {
        route: 'home', mix: false, quick: true, active: true, player: true,
        bottomTransport: true, playing: false,
      })
      results[pausedName] = pausedState
      await capture(win, pausedName)

      await stopPlayback(win)
      const stoppedName = `home-mix-${width}-stopped`
      const stoppedState = await readState(win)
      assertState(stoppedName, stoppedState, {
        route: 'home', mix: true, quick: false, active: false, player: false,
        bottomTransport: false, playing: false,
      })
      results[stoppedName] = stoppedState
      await capture(win, stoppedName)
      return
    }
    await stopPlayback(win)
  }

  await captureIdleAndPlaying(1440, 900, true)
  await captureIdleAndPlaying(1366, 768)
  await captureIdleAndPlaying(1280, 800)
  await captureIdleAndPlaying(1024, 768)

  const actionableConsoleErrors = consoleErrors.filter(({ message }) =>
    !/DevTools|favicon|Autofill|Electron Security Warning \(Insecure Content-Security-Policy\)/i.test(message),
  )
  if (actionableConsoleErrors.length > 0) {
    throw new Error(`renderer console errors: ${JSON.stringify(actionableConsoleErrors, null, 2)}`)
  }
  fs.writeFileSync(
    path.join(outDir, 'visual-audit-results.json'),
    JSON.stringify({
      workspace: ROOT,
      fixtureOrigin: origin,
      fixtureMode: 'ephemeral audit-process HTTP interception',
      results,
      consoleErrors: actionableConsoleErrors,
    }, null, 2),
  )
  console.log('VISUAL_AUDIT_PASS', Object.keys(results).length, 'validated states')
  win.destroy()
  await new Promise((resolve) => server.close(resolve))
  app.exit(0)
}

app.whenReady().then(() => main().catch((error) => {
  const rendered = error instanceof Error ? `${error.stack || error.message}\n` : `${error}\n`
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'visual-audit-failure.log'), rendered)
  console.error('VISUAL_AUDIT_FAIL', rendered)
  setTimeout(() => app.exit(1), 500)
}))
