#!/usr/bin/env node
/**
 * TV sidebar/footer transport sync + single-owner contract checks (static).
 * Run: node scripts/verify-tv-transport-sync.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const require = createRequire(import.meta.url)

let passed = 0
let failed = 0

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`PASS: ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function readSrc(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel))
}

/* ——— Pure helpers (mirror src/lib/tv/tvChannelTransport.ts) ——— */

const TV_CHANNEL_FAIL_SKIP_LIMIT = 5

function resolveTvChannelTransportAvailability(input) {
  const { isActive, currentIndex, queueLength, isLoading, repeatMode } = input
  if (!isActive || queueLength <= 0 || currentIndex < 0) {
    return { hasPrevious: false, hasNext: false, canChangeChannel: false }
  }
  const hasPrevious = currentIndex > 0 || (repeatMode === 'all' && queueLength > 1)
  const hasNext = currentIndex < queueLength - 1 || (repeatMode === 'all' && queueLength > 1)
  return {
    hasPrevious,
    hasNext,
    canChangeChannel: !isLoading,
  }
}

function simulateBoundedFailSkip(queueLength, startIndex, failIndexes) {
  let index = startIndex
  let skips = 0
  const visited = [index]
  const failSet = new Set(failIndexes)
  while (failSet.has(index) && skips < TV_CHANNEL_FAIL_SKIP_LIMIT) {
    const next = index + 1
    if (next >= queueLength) break
    skips += 1
    index = next
    visited.push(index)
  }
  return { index, skips, visited, exhausted: failSet.has(index) }
}

/* ——— Pure availability cases ——— */

{
  const mid = resolveTvChannelTransportAvailability({
    isActive: true,
    currentIndex: 2,
    queueLength: 6,
    isLoading: false,
    repeatMode: 'off',
  })
  check('mid-queue has previous + next', mid.hasPrevious && mid.hasNext && mid.canChangeChannel)
}

{
  const first = resolveTvChannelTransportAvailability({
    isActive: true,
    currentIndex: 0,
    queueLength: 4,
    isLoading: false,
    repeatMode: 'off',
  })
  check('first channel disables previous', !first.hasPrevious && first.hasNext)
}

{
  const last = resolveTvChannelTransportAvailability({
    isActive: true,
    currentIndex: 3,
    queueLength: 4,
    isLoading: false,
    repeatMode: 'off',
  })
  check('last channel disables next (no wrap)', last.hasPrevious && !last.hasNext)
}

{
  const loading = resolveTvChannelTransportAvailability({
    isActive: true,
    currentIndex: 1,
    queueLength: 4,
    isLoading: true,
    repeatMode: 'off',
  })
  check('loading locks channel switch', loading.hasNext && !loading.canChangeChannel)
}

{
  const sim = simulateBoundedFailSkip(8, 0, [0, 1, 2])
  check('failed next channels skipped safely', sim.index === 3 && sim.skips === 3)
}

{
  const sim = simulateBoundedFailSkip(20, 0, [...Array(12).keys()])
  check(
    'failure retries are bounded',
    sim.skips === TV_CHANNEL_FAIL_SKIP_LIMIT && sim.exhausted,
    `skips=${sim.skips}`,
  )
}

/* ——— Source contract ——— */

check('tvChannelTransport helper exists', exists('src/lib/tv/tvChannelTransport.ts'))
check('TvNowPlayingPanel exists', exists('src/components/tv/TvNowPlayingPanel.tsx'))
check('TvVideoSurface exists', exists('src/components/tv/TvVideoSurface.tsx'))
check('HtmlVideoPlaybackService exists', exists('src/lib/tv/HtmlVideoPlaybackService.ts'))
check('tvVideoPlayback singleton exists', exists('src/lib/tv/tvVideoPlayback.ts'))

const panel = readSrc('src/components/tv/TvNowPlayingPanel.tsx')
const surface = readSrc('src/components/tv/TvVideoSurface.tsx')
const app = readSrc('src/App.tsx')
const provider = readSrc('src/context/DesktopPlaybackProvider.tsx')
const videoSingleton = readSrc('src/lib/tv/tvVideoPlayback.ts')
const transport = readSrc('src/lib/tv/tvChannelTransport.ts')

check('sidebar wires shared next()', panel.includes('handleNext') && panel.includes('onNext={handleNext}') && /next,/.test(panel))
check('sidebar wires shared previous()', panel.includes('onPrevious={handlePrevious}') && /previous,/.test(panel))
check('sidebar uses shared availability helper', panel.includes('resolveTvChannelTransportAvailability'))
check('sidebar does not create local isPlaying state', !/useState\(.*playing/i.test(panel))
check('surface primary transport order Previous/Play/Next', /Channel transport[\s\S]*Previous channel[\s\S]*Pause[\s\S]*Next channel/.test(surface)
  || /onPrevious[\s\S]*onPlayPause[\s\S]*onNext/.test(surface))
check('surface keeps mute/volume/stop/fullscreen/pip',
  surface.includes('onMuteToggle')
  && surface.includes('onVolumeChange')
  && surface.includes('onStop')
  && surface.includes('onFullscreen')
  && surface.includes('onPictureInPicture'))
check('surface mounts shared video service once',
  surface.includes('acquireTvVideoPlaybackService()') && surface.includes('service.mount(mount)'))
check('no second <video> in surface JSX', !/<video[\s>]/.test(surface))
check('footer transport uses shared next/previous',
  app.includes('PlaybackTransportControls')
  && /handleNext[\s\S]*next\(\)/.test(app)
  && /handlePrevious[\s\S]*previous\(\)/.test(app))
check('footer uses same TV availability helper', app.includes('resolveTvChannelTransportAvailability'))
check('footer TV labels say channel', app.includes('resolveTvTransportLabels'))
check('provider commits active track on next/previous', provider.includes('commitActiveQueueTrack'))
check('provider has single video service acquisition', /acquireTvVideoPlaybackService/.test(provider))
check('provider TV fail skip bound imported', provider.includes('TV_CHANNEL_FAIL_SKIP_LIMIT'))
check('provider guards rapid TV next', provider.includes('tvChannelSwitchInFlightRef'))
check('provider trySkipFailedTvChannel exists', provider.includes('trySkipFailedTvChannel'))
check('video singleton only', videoSingleton.includes('let singleton') && videoSingleton.includes('acquireTvVideoPlaybackService'))
check('fail skip limit exported', transport.includes('TV_CHANNEL_FAIL_SKIP_LIMIT = 5'))
check('TV capabilities keep previous/next', (() => {
  const caps = readSrc('src/lib/queue/capabilities.ts')
  return /isTvQueueSong[\s\S]*previous:\s*true[\s\S]*next:\s*true/.test(caps)
})())
check('playTvChannel captures browse queue context',
  /buildTvQueueSongs\(queue\)/.test(app) && /playQueue\(apiQueue,\s*safeIndex,\s*'tv'/.test(app))
check('TV rail mounts from active TV session (not a second owner)',
  /activePlayerSurface === 'tv'[\s\S]*TvNowPlayingPanel[\s\S]*DesktopPersistentPlayer/.test(app)
  || /resolveActivePlayerSurface[\s\S]*TvNowPlayingPanel/.test(app))
check('PlayerBar always mounted with shared session', /<PlayerBar[\s\S]*track={playerPreferredTrack}/.test(app))

/* ——— Mutex routing still intact ——— */
{
  const mutexScript = path.join(ROOT, 'scripts/verify-playback-mutex.mjs')
  check('playback mutex script present', fs.existsSync(mutexScript))
  if (fs.existsSync(mutexScript)) {
    try {
      require('child_process').execFileSync(process.execPath, [mutexScript], {
        cwd: ROOT,
        stdio: 'pipe',
      })
      check('playback mutex nested run', true)
    } catch (error) {
      check('playback mutex nested run', false, String(error?.message || error))
    }
  }
}

console.log(`\nTV transport sync checks: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
console.log('TV transport sync contract passed.')
