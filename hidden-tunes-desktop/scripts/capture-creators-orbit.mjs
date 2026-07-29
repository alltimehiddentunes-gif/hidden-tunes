#!/usr/bin/env node
/** Screenshot local HTML fixtures + capture live creators when Home is healthy. */
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

async function shotHtml(win, file, outName) {
  await win.loadFile(file)
  await sleep(800)
  fs.writeFileSync(path.join(outDir, outName), (await win.webContents.capturePage()).toPNG())
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ht-creators-shots-')))

  // Build AFTER fixture from live Express eligibility (same rules as product).
  const base = 'https://hidden-tunes-api.onrender.com'
  const artistsJson = await (await fetch(`${base}/api/artists?page=1&limit=40`, {
    headers: { Accept: 'application/json', 'x-ht-platform': 'desktop' },
  })).json()
  const artists = artistsJson.artists || []
  const eligible = []
  for (const a of artists) {
    const tracks = Array.isArray(a.tracks) ? a.tracks : []
    const playable = tracks.filter((t) => t.url || t.audio_url || t.audioUrl || t.streamUrl || t.stream_url)
    if (!a.id || !String(a.name || '').trim() || playable.length === 0) continue
    eligible.push({
      id: a.id,
      name: a.name,
      count: playable.length,
      art: a.artwork || a.image_url || '',
      score: Math.min(playable.length, 40),
    })
  }
  eligible.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const orbit = eligible.slice(0, 8)

  const afterHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>AFTER</title>
<style>
body{margin:0;font-family:Segoe UI,sans-serif;background:#0a0a10;color:#f5f3fa;padding:32px}
.eyebrow{letter-spacing:.12em;font-size:.7rem;color:rgba(245,243,250,.45)}
h1{font-size:1.1rem;margin:4px 0 18px}
.note{font-size:.75rem;color:#34d399;margin-bottom:18px;max-width:760px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:14px}
.card{display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.art{width:88px;height:88px;border-radius:999px;object-fit:cover;background:#222}
strong{font-size:.84rem;max-width:100%;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
span{font-size:.74rem;color:rgba(245,243,250,.52)}
</style></head><body>
<p class="eyebrow">CREATORS</p><h1>Creators In Your Orbit</h1>
<p class="note">AFTER: eligible creators only (≥1 playable via artist.tracks / indexes). Empty artists excluded. Counts match playable totals.</p>
<div class="grid">${orbit.map((e) => `<div class="card"><img class="art" src="${e.art}" alt=""/><strong>${e.name}</strong><span>${e.count} song${e.count === 1 ? '' : 's'}</span></div>`).join('')}</div>
</body></html>`
  fs.writeFileSync(path.join(outDir, '03-after-reconstructed.html'), afterHtml)

  const emptyHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>EMPTY</title>
<style>body{margin:0;font-family:Segoe UI,sans-serif;background:#0a0a10;color:#f5f3fa;padding:32px}
.note{color:rgba(245,243,250,.55);max-width:640px}</style></head><body>
<h1>Home (creators section omitted)</h1>
<p class="note">When buildCreatorsInOrbit returns [], MusicHomePage does not render the Creators In Your Orbit section (established hide-if-empty behaviour).</p>
</body></html>`
  fs.writeFileSync(path.join(outDir, '05-empty-section.html'), emptyHtml)

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

  await shotHtml(win, path.join(outDir, '01-before-reconstructed.html'), '01-creators-before-section.png')
  await shotHtml(win, path.join(outDir, '03-after-reconstructed.html'), '03-creators-after-section.png')
  await shotHtml(win, path.join(outDir, '05-empty-section.html'), '05-empty-section.png')

  // Live app capture
  try {
    await fetch(URL)
  } catch {
    console.log(JSON.stringify({ fixtures: true, live: false, orbit }, null, 2))
    app.exit(0)
    return
  }

  await win.loadURL(URL)
  for (let i = 0; i < 90; i++) {
    const s = await evalPage(win, `() => ({
      splash: Boolean(document.querySelector('.launch-screen, #launch-splash')),
      sidebar: Boolean(document.querySelector('.sidebar')),
      err: Boolean(/artistNames|Cannot read properties/i.test(document.body.innerText || '')),
      home: Boolean(document.querySelector('.music-home')),
    })`)
    if (s.sidebar && !s.splash) break
    await sleep(400)
  }
  await evalPage(win, `() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /reload app/i.test(b.textContent || ''))
    btn?.click()
    return true
  }`)
  await sleep(2000)
  await evalPage(win, `() => {
    [...document.querySelectorAll('.sidebar .nav-item')].find((n) => /home/i.test(n.textContent || ''))?.click()
    return true
  }`)

  let ready = null
  for (let i = 0; i < 90; i++) {
    ready = await evalPage(win, `() => {
      const text = document.body.innerText || ''
      const songsReady = text.match(/([\\d,]+)\\+\\s*songs ready/i)
      const n = songsReady ? Number(String(songsReady[1]).replace(/,/g, '')) : 0
      return {
        n,
        hasCreators: /Creators In Your Orbit/i.test(text),
        crash: /Cannot read properties/i.test(text),
        sections: [...document.querySelectorAll('.music-home-section h2, .music-home h2')].map((h) =>
          h.textContent.trim(),
        ),
      }
    }`)
    if (ready.crash) break
    if (ready.n > 0 || ready.hasCreators) break
    await sleep(1000)
  }
  await sleep(1500)

  const live = await evalPage(win, `() => {
    const section = [...document.querySelectorAll('.music-home section, .music-home-section')].find((el) =>
      /Creators In Your Orbit/i.test(el.textContent || '')
    )
    const cards = [...document.querySelectorAll('.music-home-artist-card')].map((btn) => ({
      name: btn.querySelector('strong')?.textContent?.trim() || '',
      count: btn.querySelector('span')?.textContent?.trim() || null,
    }))
    const r = section?.getBoundingClientRect()
    return {
      hasCreators: Boolean(section),
      cards,
      crash: /artistNames|Cannot read properties/i.test(document.body.innerText || ''),
      clip: r
        ? { x: Math.max(0, Math.floor(r.x)), y: Math.max(0, Math.floor(r.y)), width: Math.max(1, Math.floor(r.width)), height: Math.max(1, Math.floor(r.height)) }
        : null,
      sections: [...document.querySelectorAll('.music-home-section h2, .music-home h2')].map((h) => h.textContent.trim()),
    }
  }`)

  fs.writeFileSync(path.join(outDir, '03-creators-after-full-live.png'), (await win.webContents.capturePage()).toPNG())
  if (live.clip) {
    fs.writeFileSync(path.join(outDir, '03-creators-after-section-live.png'), (await win.webContents.capturePage(live.clip)).toPNG())
  }

  if (live.cards?.length) {
    await evalPage(win, `() => { document.querySelector('.music-home-artist-card')?.click(); return true }`)
    await sleep(1500)
    fs.writeFileSync(path.join(outDir, '04-creator-detail-live.png'), (await win.webContents.capturePage()).toPNG())
  }

  await win.setSize(1024, 800)
  await sleep(600)
  fs.writeFileSync(path.join(outDir, '06-creators-reduced-width.png'), (await win.webContents.capturePage()).toPNG())

  const report = { orbit, ready, live, zeroSongs: (live.cards || []).some((c) => /^0\\s/.test(c.count || '')) }
  fs.writeFileSync(path.join(outDir, 'capture-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  app.exit(report.zeroSongs || live.crash ? 1 : 0)
}

app.whenReady().then(() =>
  main().catch((e) => {
    console.error(e)
    app.exit(1)
  }),
)
