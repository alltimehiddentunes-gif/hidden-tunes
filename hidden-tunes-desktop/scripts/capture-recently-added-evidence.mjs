/**
 * Capture Home Recently Added truthfulness evidence via Electron CDP.
 * Requires Vite on 5173. Spawns electron with --remote-debugging-port=9333.
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
const outDir = path.join(root, 'docs', 'audits', 'launch-readiness', 'recently-added-truthfulness', 'screenshots')
fs.mkdirSync(outDir, { recursive: true })

const PORT = 9334
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
      const page = pages.find((t) => /localhost:5173/i.test(t.url || '') && !/devtools/i.test(`${t.url} ${t.title}`))
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'eval failed')
  return result.result?.value
}

async function main() {
  const child = spawn(electronPath, ['.', `--remote-debugging-port=${PORT}`], {
    cwd: root,
    env: { ...process.env },
    stdio: 'ignore',
    detached: true,
  })
  child.unref()

  const page = await waitForPage()
  const session = await cdpSession(page.webSocketDebuggerUrl)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await sleep(6000)
  await screenshot(session, '01-home.png')

  // Ensure Home is selected
  await evalJson(session, `
    (() => {
      const el = [...document.querySelectorAll('button, a')].find((n) => (n.textContent || '').trim().toLowerCase() === 'home')
      if (el) el.click()
      return Boolean(el)
    })()
  `)
  await sleep(4000)
  await screenshot(session, '02-home-recently-added.png')

  const probe = await evalJson(session, `
    (() => {
      const cards = [...document.querySelectorAll('.music-home-release-card')]
      const items = cards.slice(0, 6).map((card) => {
        const title = card.querySelector('strong')?.textContent?.trim() || null
        const artist = card.querySelector('small')?.textContent?.trim() || null
        const aria = card.getAttribute('aria-label') || ''
        const img = card.querySelector('img')
        return {
          title,
          artist,
          aria,
          ariaMatchesVisible: aria.includes(title || '') && aria.includes(artist || ''),
          hasImg: Boolean(img),
          imgSrc: img?.getAttribute('src') || null,
          fakeTitles: ['Sunset Dreams', 'Electric Hearts', 'Lost in Tokyo', 'Golden Hour', 'Echoes', 'Better Days'],
          isFakeTitle: ['Sunset Dreams', 'Electric Hearts', 'Lost in Tokyo', 'Golden Hour', 'Echoes', 'Better Days'].includes(title),
        }
      })
      return {
        cardCount: cards.length,
        hasFakeArrayResidue: document.body.innerText.includes('Sunset Dreams'),
        sectionPresent: /Recently Added/i.test(document.body.innerText),
        items,
      }
    })()
  `)
  fs.writeFileSync(path.join(outDir, 'recently-added-probe.json'), JSON.stringify(probe, null, 2))
  console.log('PROBE', JSON.stringify(probe, null, 2))

  // Click first card and capture player identity
  const playResult = await evalJson(session, `
    (() => {
      const card = document.querySelector('.music-home-release-card')
      if (!card) return { clicked: false }
      const title = card.querySelector('strong')?.textContent?.trim() || null
      const artist = card.querySelector('small')?.textContent?.trim() || null
      card.click()
      return { clicked: true, title, artist }
    })()
  `)
  await sleep(3500)
  await screenshot(session, '03-after-play.png')

  const afterPlay = await evalJson(session, `
    (() => {
      const footerTitle = document.querySelector('.player-bar .track-title, [class*="player"] h3, .ht-player-track-title, .rail-psd-track-title')?.textContent?.trim() || null
      const footerArtist = document.querySelector('.player-bar .track-artist, .ht-player-track-artist, .rail-psd-track-artist')?.textContent?.trim() || null
      const rail = document.querySelector('[data-player-surface]')
      return {
        playResult: ${JSON.stringify(playResult)},
        footerTitle,
        footerArtist,
        playerSurface: rail?.getAttribute('data-player-surface') || null,
        titleMatch: ${JSON.stringify(playResult?.title)} && footerTitle
          ? footerTitle.includes(${JSON.stringify(playResult?.title)})
          : null,
      }
    })()
  `)
  fs.writeFileSync(path.join(outDir, 'after-play-probe.json'), JSON.stringify(afterPlay, null, 2))
  console.log('AFTER_PLAY', JSON.stringify(afterPlay, null, 2))
  await screenshot(session, '04-player-identity.png')

  session.close()
  console.log('Capture complete')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
