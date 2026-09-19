#!/usr/bin/env node
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { app, BrowserWindow } from 'electron'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const Hls = require('hls.js')
const API_BASE = process.env.HT_TV_API_BASE ?? 'https://admin.hiddentunes.com'
const channelId = process.env.HT_TV_CANDIDATE_ID
const durationSeconds = Math.max(15, Number(process.env.HT_TV_RUNTIME_SECONDS ?? 15))
const evidencePath = process.env.HT_TV_EVIDENCE_PATH || null
const metricsPath = process.env.HT_TV_METRICS_PATH || null
const progressPath = process.env.HT_TV_PROGRESS_PATH || null
const evidenceIntervalSeconds = Math.max(0, Number(process.env.HT_TV_EVIDENCE_INTERVAL_SECONDS ?? 0))
const runtimeRoot = process.env.HT_TV_RUNTIME_ROOT || null
if (!channelId) throw new Error('HT_TV_CANDIDATE_ID is required')

async function main() {
  if (runtimeRoot) {
    const userData = path.join(runtimeRoot, 'user-data')
    const sessionData = path.join(runtimeRoot, 'session-data')
    const temp = path.join(runtimeRoot, 'temp')
    const logs = path.join(runtimeRoot, 'logs')
    const crashDumps = path.join(runtimeRoot, 'crash-dumps')
    await Promise.all([userData, sessionData, temp, logs, crashDumps].map((directory) => mkdir(directory, { recursive: true })))
    app.setPath('userData', userData)
    app.setPath('sessionData', sessionData)
    app.setPath('temp', temp)
    app.setPath('logs', logs)
    app.setPath('crashDumps', crashDumps)
    app.commandLine.appendSwitch('disk-cache-dir', path.join(runtimeRoot, 'disk-cache'))
  }
  let streamUrl = process.env.HT_TV_STREAM_URL
  if (!streamUrl) {
    let response = await fetch(`${API_BASE}/api/tv/channels/${channelId}/play`)
    if (response.status === 404) response = await fetch(`${API_BASE}/api/tv/videos/${channelId}/play`)
    if (!response.ok) throw new Error(`Playback resolver HTTP ${response.status}`)
    const payload = await response.json()
    streamUrl = payload.stream_url ?? payload.streamUrl ?? payload.playUrl ?? payload.url
  }
  if (!streamUrl?.startsWith('http')) throw new Error('Resolver returned no stream URL')

  await app.whenReady()
  const window = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
  const bundle = require.resolve('hls.js/dist/hls.min.js').replace(/\\/g, '/')
  const html = `<!doctype html><video id="v" playsinline></video><script src="file://${bundle}"></script><script>
  window.run = async (url) => {
    const v=document.getElementById('v'); if(!window.Hls) throw new Error('hls.js unavailable'); const h=new window.Hls({manifestLoadingMaxRetry:2,levelLoadingMaxRetry:2,fragLoadingMaxRetry:2});
    const fatal=[]; h.on(window.Hls.Events.ERROR,(_,d)=>{if(d.fatal)fatal.push(d.details)}); h.loadSource(url); h.attachMedia(v);
    await new Promise((ok,bad)=>{h.on(window.Hls.Events.MANIFEST_PARSED,ok); setTimeout(()=>bad(new Error('manifest timeout')),30000)});
    await v.play(); await new Promise((ok,bad)=>{const start=Date.now(); const tick=()=>{if(v.readyState>=2&&v.videoWidth>0&&!v.paused)return ok();if(Date.now()-start>30000)return bad(new Error('play timeout'));requestAnimationFrame(tick)};tick()});
    const startTime=v.currentTime; await new Promise(ok=>setTimeout(ok,${durationSeconds * 1000}));
    const result={readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,paused:v.paused,currentTime:v.currentTime,advancedSeconds:v.currentTime-startTime,videoElementCount:document.querySelectorAll('video').length,fatal};
    window.__htCandidateHls=h; return result;
  }</script>`
  const harnessPath = path.join(runtimeRoot ? path.join(runtimeRoot, 'temp') : tmpdir(), 'ht-tv-candidate-runtime.html')
  await writeFile(harnessPath, html, 'utf8')
  await window.loadFile(harnessPath)
  const runPromise = window.webContents.executeJavaScript(`window.run(${JSON.stringify(streamUrl)})`, true)
  const evidenceTimer = evidencePath && evidenceIntervalSeconds > 0 ? setInterval(async () => {
    try {
      const parsed = path.parse(evidencePath)
      const framePath = path.join(parsed.dir, `${parsed.name}-${Date.now()}${parsed.ext || '.png'}`)
      await window.webContents.capturePage().then((image) => image.toPNG()).then((bytes) => writeFile(framePath, bytes))
    } catch {}
  }, evidenceIntervalSeconds * 1000) : null
  const progressStartedAt = Date.now()
  const progressTimer = progressPath ? setInterval(async () => {
    try {
      const sample = await window.webContents.executeJavaScript(`(() => { const v=document.getElementById('v'); return { readyState:v?.readyState ?? 0,width:v?.videoWidth ?? 0,height:v?.videoHeight ?? 0,paused:v?.paused ?? true,currentTime:v?.currentTime ?? 0,videoElementCount:document.querySelectorAll('video').length }; })()`, true)
      await writeFile(progressPath, JSON.stringify({ candidateId: channelId, wallSeconds: (Date.now() - progressStartedAt) / 1000, sample }, null, 2))
    } catch {}
  }, 10000) : null
  const metrics = await runPromise
  if (evidenceTimer) clearInterval(evidenceTimer)
  if (progressTimer) clearInterval(progressTimer)
  const pass = metrics.readyState >= 2 && metrics.width > 0 && !metrics.paused && metrics.advancedSeconds >= durationSeconds - 5 && metrics.videoElementCount === 1 && metrics.fatal.length === 0
  if (metricsPath) await writeFile(metricsPath, JSON.stringify({ candidateId: channelId, streamHost: new URL(streamUrl).host, pass, metrics }, null, 2))
  if (evidencePath) await window.webContents.capturePage().then((image) => image.toPNG()).then((bytes) => writeFile(evidencePath, bytes))
  await window.close()
  await rm(harnessPath, { force: true })
  console.log(JSON.stringify({ candidateId: channelId, streamHost: new URL(streamUrl).host, pass, metrics }, null, 2))
  app.exit(pass ? 0 : 1)
}

main().catch((error)=>{ console.error(error instanceof Error ? error.message : String(error)); app.exit(1) })
