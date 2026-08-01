/**
 * Drive the running Electron app (or spawn one) via CDP and capture PNGs
 * after navigating Sports / Motivationals (Video) / TV and attempting play.
 *
 * Usage:
 *   1) Vite on 5173
 *   2) electron . --remote-debugging-port=9333
 *   OR this script spawns electron with that flag.
 *
 *   node scripts/capture-video-surface-cdp.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'docs', 'audits', 'launch-readiness', 'video-surface-repair', 'screenshots')
fs.mkdirSync(outDir, { recursive: true })

const PORT = 9333
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function cdpSession(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const msgId = ++id
          return new Promise((res, rej) => {
            pending.set(msgId, { res, rej })
            ws.send(JSON.stringify({ id: msgId, method, params }))
          })
        },
        close() { ws.close() },
      })
    })
    ws.addEventListener('message', (ev) => {
      const data = JSON.parse(String(ev.data))
      if (data.id && pending.has(data.id)) {
        const { res, rej } = pending.get(data.id)
        pending.delete(data.id)
        if (data.error) rej(new Error(JSON.stringify(data.error)))
        else res(data.result)
      }
    })
    ws.addEventListener('error', reject)
  })
}

async function waitForPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())
      const pages = list.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      const page = pages.find((t) => /localhost:5173\/?$|localhost:5173\/\?|index\.html/i.test(t.url || '') && !/devtools:\/\//i.test(t.url || ''))
        || pages.find((t) => /localhost:5173/i.test(t.url || '') && !/devtools/i.test(t.title || ''))
        || pages.find((t) => !/devtools|chrome-extension/i.test(`${t.url} ${t.title}`))
      if (page?.webSocketDebuggerUrl) return page
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('No CDP page')
}

async function screenshot(session, name) {
  const result = await session.send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(outDir, name)
  fs.writeFileSync(file, Buffer.from(result.data, 'base64'))
  console.log('WROTE', file)
}

async function evalJson(session, expression) {
  const result = await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'eval failed')
  }
  return result.result?.value
}

async function main() {
  let child = null
  let page
  try {
    page = await waitForPage()
    console.log('Reusing existing CDP page', page.url)
  } catch {
    console.log('Spawning Electron with remote debugging…')
    child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`], {
      cwd: root,
      env: { ...process.env },
      stdio: 'ignore',
      detached: true,
    })
    child.unref()
    page = await waitForPage()
  }

  const session = await cdpSession(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await sleep(3000)
  await screenshot(session, '10-cdp-home.png')

  const clickNav = async (label) => evalJson(session, `
    (() => {
      const wanted = ${JSON.stringify(label)}.toLowerCase()
      const nodes = [...document.querySelectorAll('button, a, [role="button"], nav *')]
      const el = nodes.find((n) => (n.textContent || '').trim().toLowerCase() === wanted)
      if (!el) return false
      el.click()
      return true
    })()
  `)

  await clickNav('sports')
  await sleep(3500)
  // Prefer Upcoming fixtures when Live is empty.
  await evalJson(session, `
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim().toLowerCase() === 'upcoming')
      if (btn) { btn.click(); return true }
      return false
    })()
  `)
  await sleep(2500)
  await screenshot(session, '11-cdp-sports.png')
  const sportsProbe = await evalJson(session, `
    (() => ({
      url: location.href,
      title: document.title,
      textHasFixtures: /fixture|sports|upcoming|live/i.test(document.body.innerText),
      emptyLive: /no live events|no fixtures|no upcoming/i.test(document.body.innerText),
      playButtons: [...document.querySelectorAll('button')].filter((b) => /play|watch/i.test((b.textContent||'') + (b.getAttribute('aria-label')||''))).length,
      playerSurface: document.querySelector('[data-player-surface]')?.getAttribute('data-player-surface') || null,
      hasVideoSurface: Boolean(document.querySelector('.tv-video-surface')),
      snippet: document.body.innerText.replace(/\\s+/g,' ').slice(0, 400),
    }))()
  `)
  fs.writeFileSync(path.join(outDir, '11-sports-probe.json'), JSON.stringify(sportsProbe, null, 2))

  // Try first obvious play control on sports if any
  await evalJson(session, `
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()
        return t.includes('play') || t.includes('watch')
      })
      if (btn) { btn.click(); return true }
      return false
    })()
  `)
  await sleep(4000)
  await screenshot(session, '12-cdp-sports-after-play-attempt.png')

  await clickNav('motivationals')
  await sleep(3500)
  await screenshot(session, '13-cdp-motivationals.png')
  // Click Video filter
  await evalJson(session, `
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim().toLowerCase() === 'video')
      if (btn) { btn.click(); return true }
      return false
    })()
  `)
  await sleep(2500)
  await screenshot(session, '14-cdp-motivationals-video-filter.png')
  await evalJson(session, `
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()
        return t.includes('play')
      })
      if (btn) { btn.click(); return true }
      // card click fallback
      const card = document.querySelector('[data-session-id], .motivational-card, article button, .ht-card button')
      if (card) { card.click(); return 'card' }
      return false
    })()
  `)
  await sleep(5000)
  await screenshot(session, '15-cdp-motivationals-after-play.png')
  const motivProbe = await evalJson(session, `
    (() => ({
      playerSurface: document.querySelector('[data-player-surface]')?.getAttribute('data-player-surface') || null,
      hasVideoSurface: Boolean(document.querySelector('.tv-video-surface')),
      videoFamily: document.querySelector('[data-video-family]')?.getAttribute('data-video-family') || null,
      header: document.querySelector('.tv-rail-header h2')?.textContent || null,
      hasParkingVideo: Boolean(document.querySelector('.ht-tv-video-parking video, .ht-tv-video-parking')),
      bodySnippet: document.body.innerText.slice(0, 500),
    }))()
  `)
  fs.writeFileSync(path.join(outDir, '15-motivational-probe.json'), JSON.stringify(motivProbe, null, 2))

  await clickNav('tv')
  await sleep(3000)
  await screenshot(session, '16-cdp-tv.png')
  await evalJson(session, `
    (() => {
      const btn = [...document.querySelectorAll('button')].find((b) => {
        const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()
        return t.includes('play') || t.includes('watch')
      })
      if (btn) { btn.click(); return true }
      return false
    })()
  `)
  await sleep(6000)
  await screenshot(session, '17-cdp-tv-after-play.png')
  const tvProbe = await evalJson(session, `
    (() => ({
      url: location.href,
      playerSurface: document.querySelector('[data-player-surface]')?.getAttribute('data-player-surface') || null,
      hasVideoSurface: Boolean(document.querySelector('.tv-video-surface')),
      videoFamily: document.querySelector('[data-video-family]')?.getAttribute('data-video-family') || null,
      header: document.querySelector('.tv-rail-header h2')?.textContent || null,
      snippet: document.body.innerText.replace(/\\s+/g,' ').slice(0, 300),
    }))()
  `)
  fs.writeFileSync(path.join(outDir, '17-tv-probe.json'), JSON.stringify(tvProbe, null, 2))

  await clickNav('home')
  await sleep(2000)
  await screenshot(session, '18-cdp-home-with-active-session.png')
  const persistProbe = await evalJson(session, `
    (() => ({
      playerSurface: document.querySelector('[data-player-surface]')?.getAttribute('data-player-surface') || null,
      hasVideoSurface: Boolean(document.querySelector('.tv-video-surface')),
      videoFamily: document.querySelector('[data-video-family]')?.getAttribute('data-video-family') || null,
    }))()
  `)
  fs.writeFileSync(path.join(outDir, '18-persist-probe.json'), JSON.stringify(persistProbe, null, 2))

  session.close()
  console.log('CDP capture complete')
  console.log(JSON.stringify({ sportsProbe, motivProbe, tvProbe, persistProbe }, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
