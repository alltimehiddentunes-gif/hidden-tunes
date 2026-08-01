/**
 * Phase 6A: Motivational video uses a bounded premium layout — not a full-page surface.
 *
 * Run: node scripts/verify-motivational-video-layout.mjs
 *   or: npm run verify:motivational-video-layout
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function readSrc(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function pass(condition, message) {
  assert.ok(condition, message)
  console.log(`PASS: ${message}`)
}

const layoutSource = readSrc('src/lib/player/resolveVideoSurfaceLayout.ts')
const panel = readSrc('src/components/tv/TvNowPlayingPanel.tsx')
const surface = readSrc('src/components/tv/TvVideoSurface.tsx')
const app = readSrc('src/App.tsx')
const css = readSrc('src/App.css')
const adapter = readSrc('src/lib/motivationals/motivationalPlaybackAdapter.ts')
const resolver = readSrc('src/lib/player/resolveActivePlayerSurface.ts')

pass(/VideoSurfaceLayout/.test(layoutSource), 'VideoSurfaceLayout type exists')
pass(/motivational-contained/.test(layoutSource), 'motivational-contained layout is defined')
pass(/tv-cinema/.test(layoutSource), 'tv-cinema layout is defined')
pass(/sports-wide/.test(layoutSource), 'sports-wide layout is defined')
pass(
  layoutSource.includes("return 'motivational-contained'")
    && layoutSource.includes('isMotivationalVideoSong'),
  'Motivational video resolves to motivational-contained',
)
pass(
  layoutSource.includes("return 'sports-wide'") && layoutSource.includes('isSportsQueueSong'),
  'Sports resolves to sports-wide',
)
pass(
  layoutSource.includes("return 'tv-cinema'") && layoutSource.includes('isTvQueueSong'),
  'TV resolves to tv-cinema',
)

pass(
  /motivational-video-stage/.test(app) && /useMotivationalVideoStage/.test(app),
  'App mounts Motivational video in the main-stage region',
)
pass(
  /data-video-layout=\{videoSurfaceLayout\}/.test(app),
  'App exposes video layout on the shell for CSS',
)
pass(
  /!useMotivationalVideoStage/.test(app),
  'Default right rail is suppressed while Motivational contained stage is active',
)
pass(
  /videoLayout=\"motivational-contained\"/.test(app),
  'Motivational stage passes motivational-contained layout to the panel',
)

pass(/videoLayout/.test(panel), 'TvNowPlayingPanel accepts videoLayout')
pass(/data-video-layout=\{videoLayout\}/.test(panel), 'Panel stamps data-video-layout')
pass(/data-video-layout=\{videoLayout\}/.test(surface), 'TvVideoSurface stamps data-video-layout')

pass(
  /data-video-layout='motivational-contained'/.test(css)
    && /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/.test(css),
  'CSS collapses the right-rail column for motivational-contained',
)
pass(
  /aspect-ratio:\s*16\s*\/\s*9/.test(css)
    && /max-height:\s*min\(72vh/.test(css),
  'Motivational mount is bounded 16:9 with max-height cap',
)
pass(
  /object-fit:\s*contain\s*!important/.test(css),
  'Motivational video forces object-fit contain',
)
pass(
  !/\.tv-rail\[data-video-layout='motivational-contained'\][\s\S]{0,400}object-fit:\s*cover/.test(css),
  'Motivational contained layout does not use object-fit cover',
)
pass(
  /\.tv-video-surface:fullscreen/.test(css) || /\.tv-video-surface:-webkit-full-screen/.test(css),
  'Fullscreen styles remain explicit (user-triggered only)',
)
pass(
  !/position:\s*fixed[\s\S]{0,80}inset:\s*0/.test(
    css.match(/motivational-contained[\s\S]{0,1200}/)?.[0] ?? '',
  ),
  'Motivational default layout is not fixed fullscreen inset-0',
)

pass(
  /isMotivationalVideoSong/.test(adapter),
  'Motivational video classifier exists (audio stays off video path)',
)
pass(
  /requiresVideoSurface/.test(resolver) && /isMotivationalVideoSong/.test(resolver),
  'Shared video owner path still includes Motivational video via requiresVideoSurface',
)
pass(
  /acquireTvVideoPlaybackService/.test(panel) || /TvVideoSurface/.test(panel),
  'Panel still uses the shared video surface / owner path',
)
pass(
  /acquireTvVideoPlaybackService/.test(surface),
  'TvVideoSurface still mounts the single shared video service',
)

// Audio-only Motivationals must not use video layout
pass(
  /export function isMotivationalVideoSong/.test(adapter),
  'isMotivationalVideoSong gate exists so audio Motivationals skip video layout',
)

console.log('\nverify:motivational-video-layout PASS')
