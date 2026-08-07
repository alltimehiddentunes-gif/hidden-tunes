#!/usr/bin/env node
import { app, BrowserWindow } from 'electron'

const fixture = process.env.HT_DIRECT_VIDEO_FIXTURE
  || 'https://www.w3schools.com/html/mov_bbb.mp4'

async function main() {
  const win = new BrowserWindow({
    width: 800,
    height: 520,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })

  await win.loadURL('data:text/html,<video id="video" muted playsinline></video>')
  const result = await win.webContents.executeJavaScript(`(() => {
    const video = document.getElementById('video')
    video.src = ${JSON.stringify(fixture)}
    video.load()
    return new Promise((resolve) => {
      let finished = false
      const finish = (extra = {}) => {
        if (finished) return
        finished = true
        resolve({
          paused: video.paused,
          readyState: video.readyState,
          width: video.videoWidth,
          height: video.videoHeight,
          currentTime: video.currentTime,
          videoCount: document.querySelectorAll('video').length,
          ...extra,
        })
      }
      const timeout = setTimeout(() => finish({ error: 'direct MP4 timeout' }), 30000)
      video.addEventListener('error', () => {
        clearTimeout(timeout)
        finish({ error: 'media error ' + (video.error?.code || 'unknown') })
      }, { once: true })
      video.play().then(() => {
        const started = Date.now()
        const tick = () => {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.currentTime > 0) {
            clearTimeout(timeout)
            finish()
          } else if (Date.now() - started > 20000) {
            clearTimeout(timeout)
            finish({ error: 'no decoded frames' })
          } else requestAnimationFrame(tick)
        }
        tick()
      }).catch((error) => {
        clearTimeout(timeout)
        finish({ error: String(error) })
      })
    })
  })()`, true)

  const pass = !result.paused
    && result.readyState >= 2
    && result.width > 0
    && result.height > 0
    && result.currentTime > 0
    && result.videoCount === 1
  console.log(JSON.stringify({ fixture, pass, ...result }, null, 2))
  app.exit(pass ? 0 : 1)
}

app.whenReady().then(main).catch((error) => {
  console.error(error)
  app.exit(1)
})
