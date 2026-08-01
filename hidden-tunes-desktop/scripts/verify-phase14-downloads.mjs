/**
 * Phase 14 — Downloads lifecycle and offline playback contracts (static + owners).
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
const manager = read('electron/downloads/downloadManager.js')
const policy = read('electron/downloads/downloadability.js')
const constants = read('electron/downloads/constants.js')
const page = read('src/components/downloads/DesktopDownloadsPage.tsx')
const prefer = read('src/lib/downloads/preferLocalPlayback.ts')
const types = read('src/lib/downloads/types.ts')
const offlineBanner = read('src/components/shell/DesktopOfflineBanner.tsx')
const playback = read('src/context/DesktopPlaybackProvider.tsx')
const preload = read('electron/preload.js')
const pkg = read('package.json')

check('single-download-manager', manager.includes('class DownloadManager') && fs.existsSync(path.join(root, 'electron/downloads/downloadManager.js')))
check('no-second-playback-provider', (playback.match(/export function DesktopPlaybackProvider/g) || []).length === 1)
check('preload-downloads-api', preload.includes('ht-downloads-start') && preload.includes('getPlayableUrl'))
check('temp-partial-path', manager.includes('partial') && manager.includes('renameSync'))
check('checksum-on-complete', manager.includes('sha256File') && manager.includes('checksum'))
check('size-mismatch-guard', manager.includes('size_mismatch'))
check('corrupt-reconcile', manager.includes("status: 'corrupt'") && types.includes("'corrupt'"))
check('pause-not-fake-resume', manager.includes('resumable: false') && manager.includes('no_resume'))
check('settings-cancel-retry-honest', app.includes('True pause/resume (byte-range)') && app.includes('Cancel stops a transfer'))
check('local-prefer-helper', prefer.includes('applyLocalDownloadUrls') && prefer.includes('ht-download'))
check('family-play-prefers-local', app.includes('applyLocalDownloadUrls'))
check('downloads-page-owner', page.includes('DesktopDownloadsPage') && page.includes('downloadItemToQueueSong'))
check('stream-only-radio-tv-sports', /radio/.test(constants) && /tv/.test(constants) && /sports/.test(constants) && constants.includes('STREAM_ONLY'))
check('stream-only-classifier', policy.includes('STREAM_ONLY_TYPES') && policy.includes('stream_only'))
check('phase13-offline-banner-intact', offlineBanner.includes('data-connectivity="offline"'))
check('verify-downloads-script', pkg.includes('verify:downloads') || fs.existsSync(path.join(root, 'scripts/verify-downloads-contract.mjs')))
check('playback-provider-untouched-file', fs.existsSync(path.join(root, 'src/context/DesktopPlaybackProvider.tsx')))

if (failed > 0) {
  console.error(`\nverify:phase14-downloads FAILED (${failed} failing, ${passed} passing)`)
  process.exit(1)
}
console.log(`\nverify:phase14-downloads PASS (${passed} checks)`)
