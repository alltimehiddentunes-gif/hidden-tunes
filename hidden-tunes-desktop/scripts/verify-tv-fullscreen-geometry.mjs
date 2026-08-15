import assert from 'node:assert/strict'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]
const browser = browserCandidates.find(existsSync)
assert.ok(browser, 'A Chromium browser is required for fullscreen geometry verification')

const evidenceRoot = resolve(process.env.HT_FULLSCREEN_GEOMETRY_ROOT || '')
assert.match(evidenceRoot, /^D:\\HiddenTunes\\/i, 'Fullscreen geometry evidence must remain on D:')
mkdirSync(evidenceRoot, { recursive: true })

const fixture = fileURLToPath(new URL('./fixtures/tv-fullscreen-geometry.html', import.meta.url))
const profile = resolve(evidenceRoot, 'chromium-profile')
rmSync(profile, { recursive: true, force: true })

const result = spawnSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profile}`,
  '--window-size=1280,720',
  '--virtual-time-budget=1000',
  '--dump-dom',
  pathToFileURL(fixture).href,
], { encoding: 'utf8', windowsHide: true })

assert.equal(result.status, 0, result.stderr || 'Chromium geometry run failed')
assert.match(result.stdout, /data-test-status="pass"/, 'Runtime fullscreen geometry assertions did not pass')
const measurement = result.stdout.match(/<pre id="geometry-result" hidden="">([^<]+)<\/pre>/)?.[1]
assert.ok(measurement, 'Runtime geometry measurements were not emitted')

console.log(measurement.replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
console.log('TV fullscreen runtime geometry: PASS')
