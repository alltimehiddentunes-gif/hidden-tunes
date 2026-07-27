#!/usr/bin/env node
/**
 * Capture Music page BEFORE/AFTER screenshots.
 * Usage: npx electron scripts/capture-music-page-repair.mjs BEFORE|AFTER
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'

const require = createRequire(import.meta.url)
const { fetchApprovedCatalog } = require('../electron/catalogBridge.js')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LABEL = (process.argv[2] || 'SHOT').toUpperCase()
const outDir = path.join(ROOT, 'docs', 'audits', 'music-page-repair')
const URL = process.env.HT_VALIDATE_URL || 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const WIDTHS = LABEL === 'BEFORE'
  ? [{ key: '', width: 1440, height: 900 }]
  : [
      { key: '-1024', width: 1024, height: 768 },
      { key: '-1280', width: 1280, height: 800 },
      { key: '-1440', width: 1440, height: 900 },
      { key: '-LARGE', width: 1720, height: 950 },
    ]

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

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-music-repair-')))
  await waitUrl(URL)
  ipcMain.handle('ht-catalog-get', async (_e, p) => {
    if (typeof p !== 'string' || !p.startsWith('/api/')) throw new Error('bad path')
    return fetchApprovedCatalog(p)
  })

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    backgroundColor: '#050508',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(ROOT, 'electron', 'preload.js'),
    },
  })

  await win.loadURL(URL)
  for (let i = 0; i < 80; i += 1) {
    const ready = await evalPage(win, `() => Boolean(document.querySelector('.sidebar')) && !document.querySelector('.launch-screen')`)
    if (ready) break
    await sleep(400)
  }

  await evalPage(win, `() => {
    [...document.querySelectorAll('.sidebar .nav-item')].find((n) => (n.textContent || '').trim().toLowerCase() === 'music')?.click()
    return true
  }`)
  await sleep(2000)

  const report = { label: LABEL, widths: {} }

  for (const spec of WIDTHS) {
    win.setMinimumSize(760, 600)
    win.setSize(spec.width, spec.height)
    await sleep(500)
    await evalPage(win, `() => {
      [...document.querySelectorAll('.sidebar .nav-item')].find((n) => (n.textContent || '').trim().toLowerCase() === 'music')?.click()
      return true
    }`)
    await sleep(600)

    const snap = await evalPage(win, `() => {
      const frames = [...document.querySelectorAll('.music-workspace .art-frame, .music-discover .art-frame, .page-view[data-page="music"] .art-frame')]
        .map((el) => {
          const r = el.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height), circle: el.classList.contains('art-frame--circle'), fills: r.height > 500 }
        })
      const input = document.querySelector('.home-top-search input, input[placeholder]')
      return {
        sections: [...document.querySelectorAll('.music-discover h2, .music-page-section h2, .music-section-page h2')].map((h) => h.textContent.trim()),
        placeholder: input?.getAttribute('placeholder') || input?.placeholder || '',
        giant: frames.some((f) => f.fills),
        maxH: frames.reduce((m, f) => Math.max(m, f.h), 0),
        frames: frames.slice(0, 12),
        workspace: Boolean(document.querySelector('.player-workspace-back')),
        discover: Boolean(document.querySelector('.music-discover')),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      }
    }`)
    report.widths[spec.key || '1440'] = snap
    const file = path.join(outDir, `${LABEL}${spec.key || ''}.png`)
    fs.writeFileSync(file, (await win.capturePage()).toPNG())
    console.log(`${LABEL}${spec.key || ''}: giant=${snap.giant} maxH=${snap.maxH} sections=${snap.sections.join('|')} ph=${JSON.stringify(snap.placeholder)}`)
  }

  fs.writeFileSync(path.join(outDir, `${LABEL}-metrics.json`), JSON.stringify(report, null, 2))
  app.exit(report.widths[Object.keys(report.widths)[0]]?.giant ? (LABEL === 'BEFORE' ? 0 : 2) : 0)
}

app.whenReady().then(() => main().catch((e) => { console.error(e); app.exit(1) }))
