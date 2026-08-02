import { createRequire } from 'node:module'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'

const require = createRequire(import.meta.url)
const dashBundle = require.resolve('dashjs').replace(
  `${path.sep}esm${path.sep}`,
  `${path.sep}umd${path.sep}`,
)
const DASH_FIXTURE = 'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd'

async function main() {
  await app.whenReady()
  const harnessDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ht-tv-dash-'))
  const harnessPath = path.join(harnessDir, 'index.html')
  const window = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  const bundleUrl = `file://${path.resolve(dashBundle).replace(/\\/g, '/')}`
  const html = `<!doctype html><html><body>
    <video id="video" muted playsinline></video>
    <script src="${bundleUrl}"></script>
    <script>
      window.runDashCheck = async (url) => {
        const video = document.getElementById('video')
        const player = window.dashjs.MediaPlayer().create()
        return new Promise((resolve) => {
          const timeout = setTimeout(() => finish({ ok: false, error: 'timeout' }), 30000)
          const finish = (result) => {
            clearTimeout(timeout)
            const metrics = {
              videoElementCount: document.querySelectorAll('video').length,
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
            }
            player.reset()
            resolve({ ...result, metrics })
          }
          player.on(window.dashjs.MediaPlayer.events.STREAM_INITIALIZED, async () => {
            try {
              await video.play()
              const started = Date.now()
              const tick = () => {
                if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                  finish({ ok: true })
                } else if (Date.now() - started > 15000) {
                  finish({ ok: false, error: 'no decoded frames' })
                } else requestAnimationFrame(tick)
              }
              tick()
            } catch (error) { finish({ ok: false, error: String(error) }) }
          })
          player.on(window.dashjs.MediaPlayer.events.ERROR, (event) => {
            finish({ ok: false, error: event?.error?.message || String(event?.error || 'DASH error') })
          })
          player.initialize(video, url, false)
        })
      }
    </script>
  </body></html>`
  await fs.writeFile(harnessPath, html, 'utf8')
  await window.loadFile(harnessPath)
  let outcome
  try {
    outcome = await window.webContents.executeJavaScript(
      `window.runDashCheck(${JSON.stringify(DASH_FIXTURE)})`,
      true,
    )
  } finally {
    await fs.rm(harnessDir, { recursive: true, force: true })
  }
  const exitCode = !outcome.ok || outcome.metrics.videoElementCount !== 1 ? 1 : 0
  await new Promise((resolve) => {
    process.stdout.write(
      `${JSON.stringify({ fixture: DASH_FIXTURE, ...outcome }, null, 2)}\n`,
      resolve,
    )
  })
  await window.close()
  app.exit(exitCode)
}

main().catch((error) => {
  console.error(error)
  app.exit(1)
})
