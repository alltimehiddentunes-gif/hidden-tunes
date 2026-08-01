/**
 * One-shot Electron capture for Phase 2 video-surface evidence.
 * Loads the Vite renderer (or packaged file), waits for shell, captures PNGs.
 *
 * Usage (dev server already on 5173):
 *   electron scripts/capture-video-surface-evidence.mjs
 */
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'docs', 'audits', 'launch-readiness', 'video-surface-repair', 'screenshots')
fs.mkdirSync(outDir, { recursive: true })

const targetUrl = process.env.HT_CAPTURE_URL || 'http://localhost:5173/'

async function capture(win, name) {
  const image = await win.webContents.capturePage()
  const file = path.join(outDir, name)
  fs.writeFileSync(file, image.toPNG())
  console.log('WROTE', file)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // No preload — this capture harness only needs the Vite renderer UI.
    },
  })

  await win.loadURL(targetUrl)
  await new Promise((r) => setTimeout(r, 5000))
  await capture(win, '01-shell-home.png')

  const clickResults = await win.webContents.executeJavaScript(`
    (() => {
      const clickNav = (label) => {
        const buttons = [...document.querySelectorAll('button, a, [role="button"], nav *')]
        const el = buttons.find((b) => (b.textContent || '').trim().toLowerCase() === label)
        if (el) { el.click(); return true }
        return false
      }
      const sports = clickNav('sports')
      return { sports }
    })()
  `).catch((e) => ({ error: String(e) }))

  await new Promise((r) => setTimeout(r, 2500))
  await capture(win, '02-sports-route.png')

  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = [...document.querySelectorAll('button, a, [role="button"], nav *')]
      const el = buttons.find((b) => (b.textContent || '').trim().toLowerCase() === 'motivationals')
      if (el) el.click()
      return Boolean(el)
    })()
  `).catch(() => false)
  await new Promise((r) => setTimeout(r, 2500))
  await capture(win, '03-motivationals-route.png')

  await win.webContents.executeJavaScript(`
    (() => {
      const buttons = [...document.querySelectorAll('button, a, [role="button"], nav *')]
      const el = buttons.find((b) => (b.textContent || '').trim().toLowerCase() === 'tv')
      if (el) el.click()
      return Boolean(el)
    })()
  `).catch(() => false)
  await new Promise((r) => setTimeout(r, 2500))
  await capture(win, '04-tv-route.png')

  const surfaceInfo = await win.webContents.executeJavaScript(`
    (() => {
      const rail = document.querySelector('[data-player-surface]')
      return {
        clickResults: ${JSON.stringify(clickResults)},
        playerSurface: rail?.getAttribute('data-player-surface') || null,
        hasVideoSurface: Boolean(document.querySelector('.tv-video-surface')),
        hasVideoEl: Boolean(document.querySelector('video')),
        hasParking: Boolean(document.querySelector('.ht-tv-video-parking')),
        title: document.title,
      }
    })()
  `).catch((e) => ({ error: String(e) }))

  fs.writeFileSync(path.join(outDir, 'runtime-dom-probe.json'), JSON.stringify(surfaceInfo, null, 2))
  console.log('PROBE', surfaceInfo)

  await capture(win, '05-final-state.png')
  app.quit()
})
