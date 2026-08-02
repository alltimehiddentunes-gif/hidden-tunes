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

const CONTROLLED_FIXTURES = [
  {
    label: 'Controlled HLS fixture (Mux x36xhzz)',
    channelId: 'fixture:mux-x36xhzz',
    streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    sourceType: 'controlled_hls_fixture',
    gate: 'architecture',
  },
  {
    label: 'Controlled HLS fixture (Mux test_001)',
    channelId: 'fixture:mux-test-001',
    streamUrl: 'https://test-streams.mux.dev/test_001/stream.m3u8',
    sourceType: 'controlled_hls_fixture',
    gate: 'architecture',
  },
]

const LIVE_HEALTH_CHANNELS = [
  {
    label: 'Vyas Channel (IN, NIC HLS)',
    channelId: 'd1da95cb-4291-470b-a5fa-f9a0a06b0c60',
    gate: 'source-health',
  },
  {
    label: 'Catalog HLS sample',
    discover: { limit: 40, country: 'DE' },
    gate: 'source-health',
  },
  {
    label: 'Catalog HLS sample (ID)',
    discover: { limit: 40, country: 'ID' },
    gate: 'source-health',
  },
  {
    label: 'Catalog HLS sample (FR)',
    discover: { limit: 40, country: 'FR' },
    gate: 'source-health',
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
  const cases = [...CONTROLLED_FIXTURES]
  for (const entry of LIVE_HEALTH_CHANNELS) {
    if (entry.channelId) {
      const resolved = await resolvePlayUrl(entry.channelId)
      cases.push({ label: entry.label, channelId: entry.channelId, gate: entry.gate, ...resolved })
      continue
    }
    if (entry.discover) {
      cases.push({ ...(await discoverHlsChannel(entry.discover)), gate: entry.gate })
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
      gate: testCase.gate,
      ...outcome,
    })
  }

  await window.close()
  return results
}

async function main() {
  console.log('[ht-tv-verify] preparing test cases…')
  const cases = await prepareCases()
  console.log(`[ht-tv-verify] running ${cases.length} playback checks in Electron…`)
  const results = await runElectronVerification(cases)

  let architectureFailures = 0
  let sourceHealthFailures = 0
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL'
    if (!result.ok && result.gate === 'architecture') architectureFailures += 1
    if (!result.ok && result.gate === 'source-health') sourceHealthFailures += 1
    console.log(`\n[${status}] ${result.label} [${result.gate}]`)
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

  if (sourceHealthFailures > 0) {
    console.warn(`\n[ht-tv-verify] ${sourceHealthFailures} external source-health probe(s) failed (non-blocking)`)
  }
  if (architectureFailures > 0) {
    console.error(`[ht-tv-verify] ${architectureFailures} controlled architecture fixture(s) failed`)
    app.exit(1)
    return
  }
  console.log('[ht-tv-verify] controlled TV architecture regression PASS')
  app.exit(0)
}

main().catch((error) => {
  console.error('[ht-tv-verify] fatal', error)
  process.exit(1)
})
