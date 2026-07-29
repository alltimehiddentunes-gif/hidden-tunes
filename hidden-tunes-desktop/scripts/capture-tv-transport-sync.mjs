#!/usr/bin/env node
/**
 * Capture TV sidebar/footer transport proof screenshots.
 * Requires Vite on :5173.
 * Writes under docs/audits/tv-transport-sync/
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog, fetchApprovedCatalogRequest } = require('../electron/catalogBridge.js')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const outDir = path.join(ROOT, 'docs', 'audits', 'tv-transport-sync')

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

async function recoverShell(win) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const href = `${URL}${URL.includes('?') ? '&' : '?'}ht_capture=${Date.now()}_${attempt}`
    await win.loadURL(href)
    await sleep(2000)
    const state = await evalPage(win, `() => {
      const broken = Boolean(document.querySelector('.app-error-fallback'))
      if (broken) {
        const btn = document.querySelector('.app-error-fallback button')
        btn?.click()
      }
      document.getElementById('launch-splash')?.remove()
      return {
        broken,
        sidebar: Boolean(document.querySelector('.sidebar')),
        navCount: document.querySelectorAll('.sidebar .nav-item').length,
        bodyText: (document.body?.innerText || '').slice(0, 160),
      }
    }`)
    console.log('RECOVER:', JSON.stringify(state))
    if (!state.broken && state.sidebar && state.navCount > 0) {
      await sleep(1500)
      const stillBroken = await evalPage(win, `() => Boolean(document.querySelector('.app-error-fallback'))`)
      if (!stillBroken) return state
    }
    await sleep(1000)
  }
  throw new Error('UI not ready after recover')
}

async function clickNav(win, label) {
  const ok = await evalPage(win, `() => {
    const el = [...document.querySelectorAll('.sidebar .nav-item')]
      .find((n) => (n.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase().includes('${label}'.toLowerCase()))
    el?.click()
    return Boolean(el)
  }`)
  await sleep(1200)
  return ok
}

async function capture(win, name) {
  fs.mkdirSync(outDir, { recursive: true })
  const img = await win.webContents.capturePage()
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  console.log(`SHOT: ${file}`)
  return file
}

async function captureSelector(win, selector, name) {
  const clip = await evalPage(win, `() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      x: Math.max(0, Math.floor(r.x)),
      y: Math.max(0, Math.floor(r.y)),
      width: Math.max(1, Math.floor(r.width)),
      height: Math.max(1, Math.floor(r.height)),
    }
  }`)
  if (!clip || clip.width < 2 || clip.height < 2) {
    console.warn(`MISS: ${selector} for ${name}`)
    return null
  }
  const img = await win.webContents.capturePage(clip)
  const file = path.join(outDir, `${name}.png`)
  fs.writeFileSync(file, img.toPNG())
  console.log(`SHOT: ${file}`)
  return file
}

async function waitForTvPage(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 30000) {
    const state = await evalPage(win, `() => ({
      rail: Boolean(document.querySelector('.tv-rail')),
      cards: document.querySelectorAll('.tv-station-card-hit').length,
      filters: [...document.querySelectorAll('button, [role="tab"]')].some((el) => /kids/i.test(el.textContent || '')),
    })`)
    if (state.rail || state.cards > 0) return state
    await sleep(400)
  }
  return { rail: false, cards: 0, filters: false }
}

async function playKidsChannel(win) {
  return evalPage(win, `() => {
    const kids = [...document.querySelectorAll('button, [role="tab"]')]
      .find((el) => /^\\s*kids\\s*$/i.test((el.textContent || '').trim()) || /kids/i.test(el.getAttribute('aria-label') || ''))
    kids?.click()

    const hits = [...document.querySelectorAll('button.tv-station-card-hit')]
    const target = hits[0] || null
    if (!target) return { clicked: false, cards: hits.length, kids: Boolean(kids) }
    target.click()
    return {
      clicked: true,
      cards: hits.length,
      kids: Boolean(kids),
      label: (target.getAttribute('aria-label') || '').slice(0, 120),
    }
  }`)
}

async function waitForNowPlaying(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    const state = await evalPage(win, `() => {
      const railTitle = document.querySelector('.tv-rail-meta h3')?.textContent?.trim() || null
      const footerMeta = document.querySelector('footer .player-meta, .player-bar .player-meta')
      const footerTitle = footerMeta?.querySelector('h3, .player-title, strong')?.textContent?.trim()
        || footerMeta?.textContent?.trim()?.split('\\n').map((s) => s.trim()).filter(Boolean)[0]
        || null
      return {
        railTitle,
        footerTitle,
        nowPlaying: Boolean(document.querySelector('.tv-rail--now-playing')),
        hasRailTransport: Boolean(document.querySelector('.tv-video-surface-transport')),
        videoCount: document.querySelectorAll('video.ht-tv-video-element, video').length,
      }
    }`)
    if (state.nowPlaying && state.railTitle) return state
    await sleep(500)
  }
  return null
}

async function readTransportState(win) {
  return evalPage(win, `() => {
    const railTitle = document.querySelector('.tv-rail-meta h3')?.textContent?.trim() || null
    const footerTitle = document.querySelector('footer .player-meta h3, .player-bar .player-meta h3, footer h3.player-title')?.textContent?.trim()
      || document.querySelector('footer .player-meta .player-title, footer .player-track-title')?.textContent?.trim()
      || null
    const railPrev = document.querySelector('.tv-video-surface-transport button[aria-label^="Previous"]')
    const railNext = document.querySelector('.tv-video-surface-transport button[aria-label^="Next"]')
    const railPlay = document.querySelector('.tv-video-surface-transport button.tv-rail-btn--gold')
    const footerPrev = document.querySelector('.transport-controls button[aria-label*="Previous"]')
    const footerNext = document.querySelector('.transport-controls button[aria-label*="Next"]')
    const footerPlay = document.querySelector('.transport-controls button.play')
    const upcoming = [...document.querySelectorAll('.tv-upnext-list li')].map((li) => li.textContent?.trim()).filter(Boolean)
    return {
      railTitle,
      footerTitle,
      titlesMatch: Boolean(railTitle && footerTitle && (footerTitle === railTitle || footerTitle.startsWith(railTitle))),
      hasRailPrevNext: Boolean(railPrev && railNext && railPlay),
      hasFooterPrevNext: Boolean(footerPrev && footerNext && footerPlay),
      railPrevDisabled: railPrev?.disabled ?? null,
      railNextDisabled: railNext?.disabled ?? null,
      footerPrevDisabled: footerPrev?.disabled ?? null,
      footerNextDisabled: footerNext?.disabled ?? null,
      videoCount: document.querySelectorAll('video.ht-tv-video-element, video').length,
      railPlayLabel: railPlay?.getAttribute('aria-label') || null,
      footerPlayLabel: footerPlay?.getAttribute('aria-label') || null,
      upcoming,
    }
  }`)
}

async function waitForSettledTransport(win) {
  const t0 = Date.now()
  while (Date.now() - t0 < 45000) {
    const state = await readTransportState(win)
    if (
      state.hasRailPrevNext
      && state.railPlayLabel
      && state.railPlayLabel !== 'Connecting channel'
      && state.footerPlayLabel
      && state.footerPlayLabel !== 'Connecting channel'
      && state.railNextDisabled === false
    ) {
      return state
    }
    await sleep(500)
  }
  return readTransportState(win)
}

async function clickAria(win, selector) {
  return evalPage(win, `() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el || el.disabled) return false
    el.click()
    return true
  }`)
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ht-tv-transport-'))
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
  ipcMain.handle('ht-downloads-list', async () => [])
  ipcMain.handle('ht-downloads-disk-usage', async () => ({ usedBytes: 0, itemCount: 0 }))
  ipcMain.handle('ht-downloads-reconcile', async () => ({ ok: true, removed: 0 }))
  ipcMain.handle('ht-downloads-start', async () => ({ ok: false, error: 'unavailable in screenshot capture' }))
  ipcMain.handle('ht-downloads-pause', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-resume', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-cancel', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-remove', async () => ({ ok: false }))
  ipcMain.handle('ht-downloads-get-playable-url', async () => ({ ok: false, error: 'unavailable' }))

  const win = new BrowserWindow({
    width: 1440,
    height: 920,
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

  await recoverShell(win)

  const navOk = await clickNav(win, 'TV')
  console.log('NAV_TV:', navOk)
  const tvPage = await waitForTvPage(win)
  console.log('TV_PAGE:', JSON.stringify(tvPage))

  await capture(win, '01-tv-page-before-play')
  await captureSelector(win, '.tv-rail', '02-sidebar-before')
  await captureSelector(win, 'footer.player-bar, footer', '03-footer-before')

  const play = await playKidsChannel(win)
  console.log('PLAY:', JSON.stringify(play))
  const first = await waitForNowPlaying(win)
  console.log('FIRST:', JSON.stringify(first))
  let state = await waitForSettledTransport(win)
  console.log('SETTLED:', JSON.stringify(state))

  await capture(win, '04-both-surfaces-first-channel')
  await captureSelector(win, '.tv-rail--now-playing, .tv-rail', '05-sidebar-with-transport')
  await captureSelector(win, 'footer.player-bar, footer', '06-footer-with-transport')
  fs.writeFileSync(path.join(outDir, 'state-first.json'), JSON.stringify({ play, first, state }, null, 2))

  const titleBefore = state.railTitle
  const nextRail = await clickAria(win, '.tv-video-surface-transport button[aria-label^="Next"]')
  console.log('NEXT_RAIL:', nextRail)
  await sleep(1500)
  state = await waitForSettledTransport(win)
  console.log('STATE2:', JSON.stringify(state))
  await capture(win, '07-both-after-sidebar-next')
  fs.writeFileSync(path.join(outDir, 'state-after-sidebar-next.json'), JSON.stringify({ titleBefore, state }, null, 2))

  const titleAfterRailNext = state.railTitle
  const nextFooter = await clickAria(win, '.transport-controls button[aria-label*="Next"]')
  console.log('NEXT_FOOTER:', nextFooter)
  await sleep(1500)
  state = await waitForSettledTransport(win)
  console.log('STATE3:', JSON.stringify(state))
  await capture(win, '08-both-after-footer-next')

  const prevFooter = await clickAria(win, '.transport-controls button[aria-label*="Previous"]')
  console.log('PREV_FOOTER:', prevFooter)
  await sleep(1500)
  state = await waitForSettledTransport(win)
  console.log('STATE4:', JSON.stringify(state))
  await capture(win, '09-both-after-footer-previous')
  fs.writeFileSync(path.join(outDir, 'state-after-previous.json'), JSON.stringify({
    titleBefore,
    titleAfterRailNext,
    state,
  }, null, 2))

  win.setSize(1100, 820)
  await sleep(800)
  await capture(win, '10-narrow-desktop')

  const summary = { navOk, tvPage, play, first, finalState: state, outDir }
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log('DONE:', JSON.stringify(summary))
  app.quit()
}

app.whenReady().then(main).catch((error) => {
  console.error(error)
  app.exit(1)
})
