/**
 * Phase 13 — Settings, preferences, offline UX contracts (static).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

let passed = 0
let failed = 0
function check(label, cond, detail = '') {
  if (cond) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const app = read('src/App.tsx')
const offline = read('src/components/shell/DesktopOfflineBanner.tsx')
const session = read('src/components/shell/DesktopSessionStatusBanner.tsx')
const phase9 = read('scripts/verify-phase9-product-honesty.mjs')

check('settings-phase-marker', app.includes("data-settings-phase=\"13\"") || app.includes("data-settings-phase='13'"))
check('settings-section-nav', app.includes("id: 'playback'") && app.includes("id: 'shortcuts'") && app.includes("id: 'diagnostics'"))
check('playback-quality-persists', app.includes('AudioQualitySelector') && app.includes('setAudioQualityMode'))
check('autoplay-honest-fixed-off', app.includes('Autoplay after restart') && app.includes('Fixed off'))
check('appearance-language-honest', app.includes('English only') && app.includes('Cinematic dark theme'))
check('notifications-settings-honest', app.includes('Push and in-app alerts are not available'))
check('downloads-prefs-route-real', app.includes("onNavigateNav('downloads')") && app.includes('Download manager'))
check('storage-disk-usage', app.includes('getDesktopDownloadDiskUsage'))
check('account-isolation-disclosure', app.includes('does not automatically wipe device-local'))
check('shortcuts-documented', app.includes('Keyboard shortcuts') && app.includes('Space'))
check('diagnostics-panel', app.includes('settings-diagnostics') || app.includes("id: 'diagnostics'"))
check('legal-links-present', app.includes('Privacy Policy') && app.includes('Terms of Use'))
check('offline-banner-component', offline.includes('data-connectivity="offline"'))
check('offline-banner-mounted', app.includes('DesktopOfflineBanner'))
check('session-expired-banner', session.includes('data-auth="session-expired"') && app.includes('DesktopSessionStatusBanner'))
check('updates-still-unavailable', app.includes('Automatic updates are not configured'))
check('no-fake-accent-slider', !/Accent glow intensity/.test(app))
check('phase9-script-intact', phase9.includes('verify-phase9') || phase9.includes('Phase 9'))
check('playback-owner-untouched-marker', fs.existsSync(path.join(root, 'src/context/DesktopPlaybackProvider.tsx')))

console.log(`\nPhase 13 settings verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
