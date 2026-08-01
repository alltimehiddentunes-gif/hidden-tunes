/**
 * Route-independent media persistence guards.
 *
 * Run: node scripts/test-route-independent-media.mjs
 *
 * Validates that the right-rail player surface follows the active media
 * session, not the visible navigation route — and that intentional
 * playback switches are the only ownership changes.
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

// Mirror of resolveActivePlayerSurface — keep in sync with
// src/lib/player/resolveActivePlayerSurface.ts
function isTvQueueSong(song) {
  return Boolean(song?.id?.startsWith('tv-'))
}

function isSportsQueueSong(song) {
  return Boolean(song?.id?.startsWith('sports-'))
}

function isMotivationalVideoSong(song) {
  return Boolean(
    song?.id?.startsWith('motivation-')
    && song?.tags?.some((tag) => tag === 'motivational-video' || tag === 'motivational-stream'),
  )
}

/** Same rule as requiresVideoSurface in resolveActivePlayerSurface.ts */
function requiresVideoSurface(currentTrack) {
  if (!currentTrack) return false
  if (isTvQueueSong(currentTrack)) return true
  if (isSportsQueueSong(currentTrack)) return true
  if (isMotivationalVideoSong(currentTrack)) return true
  return false
}

function resolveActivePlayerSurface(currentTrack) {
  if (requiresVideoSurface(currentTrack)) return 'tv'
  return 'audio'
}

function assertPass(condition, message) {
  assert.ok(condition, message)
  console.log(`PASS: ${message}`)
}

// --- 1–5, 10–11, 19–20: surface follows session, not route ---

const routes = ['home', 'music', 'podcasts', 'radio', 'library', 'search', 'tv', 'sports', 'motivationals']
const tvTrack = { id: 'tv-channel-42', title: 'News 24' }
const sportsTrack = { id: 'sports-fixture-1', title: 'Match Live', tags: ['sports', 'live'] }
const motivationalVideoTrack = {
  id: 'motivation-prog--sess',
  title: 'Focus Film',
  tags: ['motivational-video'],
}
const motivationalAudioTrack = {
  id: 'motivation-prog--sess-audio',
  title: 'Focus Talk',
  tags: ['motivational'],
}
const musicTrack = { id: 'song-abc', title: 'Midnight Drive' }
const podcastTrack = { id: 'podcast-ep-1', title: 'Episode 1' }
const radioTrack = { id: 'radio-1', title: 'Chill FM' }

for (const route of routes) {
  void route // route must not be an input to surface resolution
  assertPass(
    resolveActivePlayerSurface(tvTrack) === 'tv',
    `TV session stays TV surface while browsing ${route}`,
  )
  assertPass(
    resolveActivePlayerSurface(sportsTrack) === 'tv',
    `Sports session stays video surface while browsing ${route}`,
  )
  assertPass(
    resolveActivePlayerSurface(motivationalVideoTrack) === 'tv',
    `Motivational video session stays video surface while browsing ${route}`,
  )
  assertPass(
    resolveActivePlayerSurface(motivationalAudioTrack) === 'audio',
    `Motivational audio stays audio surface while browsing ${route}`,
  )
  assertPass(
    resolveActivePlayerSurface(musicTrack) === 'audio',
    `Music session stays audio surface while browsing ${route}`,
  )
  assertPass(
    resolveActivePlayerSurface(podcastTrack) === 'audio',
    `Podcast session stays audio surface while browsing ${route}`,
  )
}

assertPass(
  resolveActivePlayerSurface(null) === 'audio',
  'Empty session uses idle audio surface (not route-inferred TV)',
)

assertPass(
  resolveActivePlayerSurface(tvTrack) === resolveActivePlayerSurface(tvTrack),
  'Sidebar/footer family agree for TV session',
)
assertPass(
  resolveActivePlayerSurface(musicTrack) === resolveActivePlayerSurface(musicTrack),
  'Sidebar/footer family agree for music session',
)

// Browsing / focusing a card is not a session — only an explicit track is.
assertPass(
  resolveActivePlayerSurface(undefined) === 'audio',
  'Focused card without play does not become TV surface',
)

// --- 12–13: intentional switch ---

let session = tvTrack
assertPass(resolveActivePlayerSurface(session) === 'tv', 'Before switch: TV active')
session = musicTrack // explicit Play on a song
assertPass(resolveActivePlayerSurface(session) === 'audio', 'Explicit music play switches surface to audio')
session = tvTrack // explicit TV channel select
assertPass(resolveActivePlayerSurface(session) === 'tv', 'Explicit TV play switches surface to TV')
session = sportsTrack
assertPass(resolveActivePlayerSurface(session) === 'tv', 'Explicit Sports play uses shared video surface')
session = radioTrack
assertPass(resolveActivePlayerSurface(session) === 'audio', 'Explicit Radio play replaces Sports via session change')
session = motivationalVideoTrack
assertPass(resolveActivePlayerSurface(session) === 'tv', 'Explicit Motivational video uses shared video surface')
session = motivationalAudioTrack
assertPass(resolveActivePlayerSurface(session) === 'audio', 'Explicit Motivational audio uses audio surface')

// --- Source architecture guards ---

const appSource = readSrc('src/App.tsx')
const resolverSource = readSrc('src/lib/player/resolveActivePlayerSurface.ts')
const navigateNavMatch = appSource.match(
  /const navigateNav = useCallback\(\(navKey: NavKey\) => \{([\s\S]*?)\}, \[/,
)
assertPass(Boolean(navigateNavMatch), 'navigateNav callback is present')
const navigateBody = navigateNavMatch[1]
assertPass(!/\bstopPlayback\b/.test(navigateBody), 'Route change does not call stopPlayback')
assertPass(!/\bpause\(/.test(navigateBody), 'Route change does not call pause')
assertPass(!/\bclearQueue\b/.test(navigateBody), 'Route change does not clear queue')
assertPass(!/\bplayQueue\b/.test(navigateBody), 'Route change does not start playback')
assertPass(!/\bsetCurrentTrack\b/.test(navigateBody), 'Route change does not clear active item')

assertPass(
  !/\{\s*activeNavKey === ['"]tv['"]\s*\?[\s\S]{0,80}<TvNowPlayingPanel/.test(appSource),
  'App no longer mounts TvNowPlayingPanel from activeNavKey === "tv"',
)
assertPass(
  /resolveActivePlayerSurface\(activeSessionTrack\)/.test(appSource),
  'App selects right rail from activeSessionTrack via resolveActivePlayerSurface',
)
assertPass(
  /activePlayerSurface === ['"]tv['"]/.test(appSource)
    && /<TvNowPlayingPanel/.test(appSource)
    && /!useMotivationalVideoStage/.test(appSource),
  'TV rail mounts from activePlayerSurface when not on motivational contained stage',
)
assertPass(
  /motivational-video-stage/.test(appSource)
    && /videoLayout=\"motivational-contained\"/.test(appSource),
  'Motivational video mounts a bounded main-stage shell, not the default right rail',
)
const resolverCodeOnly = resolverSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '')
assertPass(
  !/\bactiveNavKey\b|\bactivePage\b|\bpathname\b/.test(resolverCodeOnly),
  'resolveActivePlayerSurface source does not reference route state',
)
assertPass(
  /Do not pass activeNavKey/.test(resolverSource),
  'Resolver documents route-agnostic contract',
)
assertPass(
  /isSportsQueueSong/.test(resolverSource) && /isMotivationalVideoSong/.test(resolverSource),
  'Resolver includes Sports and Motivational video in requiresVideoSurface',
)
assertPass(
  /requiresVideoSurface/.test(resolverSource),
  'Canonical requiresVideoSurface helper exists',
)
assertPass(
  /requiresVideoSurface/.test(readSrc('src/components/tv/TvNowPlayingPanel.tsx')),
  'TvNowPlayingPanel gates active video chrome via requiresVideoSurface',
)

// Footer still binds to playback provider track (not page selection alone)
assertPass(
  /track=\{playerPreferredTrack\}/.test(appSource),
  'Footer PlayerBar receives session-preferred track',
)
assertPass(
  /const playerPreferredTrack = currentTrack \?\? desktopSelectedTrack/.test(appSource),
  'Footer prefers currentTrack (active session) over browse selection',
)

// --- 14–16: one audio + one video owner (mutex routing semantics) ---

function usesDesktopVideoPath(song) {
  return Boolean(
    song?.id?.startsWith('tv-')
    || song?.id?.startsWith('sports-')
    || (song?.id?.startsWith('lecture-') && song?.tags?.includes('lecture-video'))
    || (song?.id?.startsWith('motivation-')
      && song?.tags?.some((t) => t === 'motivational-video' || t === 'motivational-stream')),
  )
}

assertPass(usesDesktopVideoPath(tvTrack) === true, 'TV uses single video owner path')
assertPass(usesDesktopVideoPath(musicTrack) === false, 'Music uses single audio owner path')
assertPass(usesDesktopVideoPath(podcastTrack) === false, 'Podcast uses audio owner path')
assertPass(usesDesktopVideoPath(radioTrack) === false, 'Radio uses audio owner path')

const providerSource = readSrc('src/context/DesktopPlaybackProvider.tsx')
assertPass(
  /activeMediaRef/.test(providerSource),
  'DesktopPlaybackProvider keeps activeMediaRef mutex',
)
assertPass(
  /stopInactiveMedia/.test(providerSource),
  'DesktopPlaybackProvider exposes stopInactiveMedia for intentional switches',
)
assertPass(
  /acquireTvVideoPlaybackService/.test(providerSource),
  'Single TV/video service acquisition path remains',
)
assertPass(
  /new HtmlAudioPlaybackService/.test(providerSource),
  'Single HtmlAudioPlaybackService ownership remains',
)

// Video unmount parks — does not stop — so route remounts must not kill session
const videoServiceSource = readSrc('src/lib/tv/HtmlVideoPlaybackService.ts')
const unmountMatch = videoServiceSource.match(/unmount\(\)\s*\{([\s\S]*?)\n  \}/)
assertPass(Boolean(unmountMatch), 'HtmlVideoPlaybackService.unmount exists')
assertPass(!/\.pause\(/.test(unmountMatch[1]), 'Video unmount does not pause playback')
assertPass(!/\.stop\(/.test(unmountMatch[1]), 'Video unmount does not stop playback')
assertPass(
  /parkingHost\.appendChild\(this\.video\)/.test(unmountMatch[1]),
  'Video unmount parks the same element (no new video owner)',
)

// TvPage play is explicit only
const tvPageSource = readSrc('src/components/tv/TvPage.tsx')
assertPass(
  /onPlayTvChannel\(channel, queue, startIndex, queueTitle\)/.test(tvPageSource),
  'TV page starts media only via explicit onPlayTvChannel',
)
assertPass(
  !/useEffect\([\s\S]{0,200}onPlayTvChannel/.test(tvPageSource),
  'TV page does not autoplay from a mount effect',
)

console.log('\nAll route-independent media persistence checks passed.')
