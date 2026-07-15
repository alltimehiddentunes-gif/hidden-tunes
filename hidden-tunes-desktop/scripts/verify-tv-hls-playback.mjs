#!/usr/bin/env node
/**
 * Verifies HLS TV playback using the same hls.js strategy as HtmlVideoPlaybackService.
 * Run: node scripts/verify-tv-hls-playback.mjs
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow } from 'electron'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const Hls = require('hls.js')

const API_BASE = process.env.HT_TV_API_BASE ?? 'https://admin.hiddentunes.com'

const TEST_CHANNELS = [
  {
    label: 'Vyas Channel (IN, NIC HLS)',
    channelId: 'd1da95cb-4291-470b-a5fa-f9a0a06b0c60',
  },
  {
    label: 'Catalog HLS sample',
    discover: { limit: 40, country: 'DE' },
  },
  {
    label: 'Catalog HLS sample (ID)',
    discover: { limit: 40, country: 'ID' },
  },
]

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`)
  }
  return response.json()
}

async function resolvePlayUrl(channelId) {
  const payload = await fetchJson(`${API_BASE}/api/tv/channels/${channelId}/play`)
  const streamUrl =
    (typeof payload?.stream_url === 'string' && payload.stream_url)
    || (typeof payload?.streamUrl === 'string' && payload.streamUrl)
    || (typeof payload?.playUrl === 'string' && payload.playUrl)
    || (typeof payload?.url === 'string' && payload.url)
    || null
  if (!streamUrl || !streamUrl.startsWith('http')) {
    throw new Error('Resolver returned no stream URL')
  }
  return {
    streamUrl,
    sourceType: payload?.source_type ?? payload?.sourceType ?? 'unknown',
  }
}

async function discoverHlsChannel({ limit, country }) {
  const params = new URLSearchParams({ limit: String(limit) })
  if (country) params.set('country', country)
  const payload = await fetchJson(`${API_BASE}/api/tv/channels?${params}`)
  const channels = payload?.videos ?? payload?.channels ?? payload?.items ?? []
  for (const channel of channels) {
    try {
      const resolved = await resolvePlayUrl(channel.id)
      if (resolved.streamUrl.toLowerCase().includes('.m3u8')) {
        return {
          label: `${channel.title ?? channel.channelName ?? channel.id} (${channel.country ?? '—'})`,
          channelId: channel.id,
          ...resolved,
        }
      }
    } catch {
      // Try next channel.
    }
  }
  throw new Error(`No HLS channel discovered for ${country ?? 'catalog'}`)
}

async function prepareCases() {
  const cases = []
  for (const entry of TEST_CHANNELS) {
    if (entry.channelId) {
      const resolved = await resolvePlayUrl(entry.channelId)
      cases.push({ label: entry.label, channelId: entry.channelId, ...resolved })
      continue
    }
    if (entry.discover) {
      cases.push(await discoverHlsChannel(entry.discover))
    }
  }
  return cases
}

function buildHarnessHtml() {
  const hlsBundlePath = require.resolve('hls.js/dist/hls.min.js')
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>TV HLS verify</title></head>
  <body>
    <video id="video" playsinline style="width:640px;height:360px;background:#000"></video>
    <script src="file://${hlsBundlePath.replace(/\\/g, '/')}"></script>
    <script>
      window.__htTvVerify = async function verify(streamUrl) {
        const video = document.getElementById('video')
        const events = []
        const log = (name) => events.push({
          event: name,
          readyState: video.readyState,
          networkState: video.networkState,
          paused: video.paused,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          currentTime: video.currentTime,
          mediaErrorCode: video.error?.code ?? null,
        })

        const eventNames = [
          'loadstart','loadedmetadata','loadeddata','canplay','playing',
          'waiting','stalled','suspend','pause','ended','error','emptied','resize',
        ]
        for (const name of eventNames) video.addEventListener(name, () => log(name))

        const native = video.canPlayType('application/vnd.apple.mpegurl')
        let usesHlsJs = false
        let hls = null

        const waitFor = (predicate, timeoutMs = 30000) => new Promise((resolve, reject) => {
          const started = Date.now()
          const tick = () => {
            if (predicate()) return resolve()
            if (Date.now() - started > timeoutMs) {
              return reject(new Error('Timed out waiting for acceptable playback'))
            }
            requestAnimationFrame(tick)
          }
          tick()
        })

        try {
          if (native === 'probably' || native === 'maybe') {
            video.src = streamUrl
            video.load()
          } else if (window.Hls && window.Hls.isSupported()) {
            usesHlsJs = true
            hls = new window.Hls({
              manifestLoadingMaxRetry: 2,
              levelLoadingMaxRetry: 2,
              fragLoadingMaxRetry: 2,
            })
            await new Promise((resolve, reject) => {
              hls.on(window.Hls.Events.MANIFEST_PARSED, resolve)
              hls.on(window.Hls.Events.ERROR, (_evt, data) => {
                if (data.fatal) reject(new Error('HLS fatal: ' + data.details))
              })
              hls.loadSource(streamUrl)
              hls.attachMedia(video)
            })
          } else {
            throw new Error('HLS playback is not supported on this device.')
          }

          await video.play()
          await waitFor(() =>
            video.readyState >= 2
            && video.videoWidth > 0
            && video.videoHeight > 0
            && !video.paused,
          )

          await new Promise((resolve) => setTimeout(resolve, 5000))

          const metrics = {
            nativeHls: native === 'probably' || native === 'maybe',
            usesHlsJs,
            canPlayType: native,
            readyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            paused: video.paused,
            currentTime: video.currentTime,
            mediaErrorCode: video.error?.code ?? null,
            videoElementCount: document.querySelectorAll('video').length,
            events,
          }

          video.pause()
          if (hls) hls.destroy()
          video.removeAttribute('src')
          video.load()

          return { ok: true, metrics }
        } catch (error) {
          if (hls) hls.destroy()
          video.pause()
          video.removeAttribute('src')
          video.load()
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            metrics: {
              nativeHls: native === 'probably' || native === 'maybe',
              usesHlsJs,
              canPlayType: native,
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              paused: video.paused,
              mediaErrorCode: video.error?.code ?? null,
              videoElementCount: document.querySelectorAll('video').length,
              events,
            },
          }
        }
      }
    </script>
  </body>
</html>`
}

async function runElectronVerification(cases) {
  await app.whenReady()

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const harness = buildHarnessHtml()
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(harness)}`)

  const results = []
  for (const testCase of cases) {
    const outcome = await window.webContents.executeJavaScript(
      `window.__htTvVerify(${JSON.stringify(testCase.streamUrl)})`,
      true,
    )
    results.push({
      label: testCase.label,
      channelId: testCase.channelId,
      sourceType: testCase.sourceType,
      streamHost: new URL(testCase.streamUrl).host,
      ...outcome,
    })
  }

  await window.close()
  await app.quit()
  return results
}

async function main() {
  console.log('[ht-tv-verify] preparing test cases…')
  const cases = await prepareCases()
  console.log(`[ht-tv-verify] running ${cases.length} playback checks in Electron…`)
  const results = await runElectronVerification(cases)

  let failures = 0
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL'
    if (!result.ok) failures += 1
    console.log(`\n[${status}] ${result.label}`)
    console.log(`  channel: ${result.channelId}`)
    console.log(`  source: ${result.sourceType} via ${result.streamHost}`)
    if (result.metrics) {
      console.log(`  canPlayType(mpegurl): ${result.metrics.canPlayType || '(empty)'}`)
      console.log(`  strategy: ${result.metrics.usesHlsJs ? 'hls.js' : result.metrics.nativeHls ? 'native' : 'unknown'}`)
      console.log(`  readyState: ${result.metrics.readyState}`)
      console.log(`  dimensions: ${result.metrics.videoWidth}x${result.metrics.videoHeight}`)
      console.log(`  paused: ${result.metrics.paused}`)
      console.log(`  video elements: ${result.metrics.videoElementCount}`)
    }
    if (result.error) {
      console.log(`  error: ${result.error}`)
    }
  }

  if (failures > 0) {
    process.exitCode = 1
    console.error(`\n[ht-tv-verify] ${failures} playback check(s) failed`)
    return
  }
  console.log('\n[ht-tv-verify] all playback checks passed')
}

main().catch((error) => {
  console.error('[ht-tv-verify] fatal', error)
  process.exit(1)
})
