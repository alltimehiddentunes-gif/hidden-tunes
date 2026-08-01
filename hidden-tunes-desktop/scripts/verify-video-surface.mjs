/**
 * Phase 2 guard: visible video surface classification must match shared video ownership.
 *
 * Mirrors src/lib/player/resolveActivePlayerSurface.ts — keep in sync.
 * Run: node scripts/verify-video-surface.mjs
 */

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${message}`)
  }
}

function isTvQueueSong(song) {
  return Boolean(song?.id?.startsWith('tv-'))
}

function isLectureVideoSong(song) {
  return Boolean(
    song?.id?.startsWith('lecture-')
    && song?.tags?.includes('lecture-video'),
  )
}

function isMotivationalVideoSong(song) {
  return Boolean(
    song?.id?.startsWith('motivation-')
    && song?.tags?.some((tag) => tag === 'motivational-video' || tag === 'motivational-stream'),
  )
}

function isMotivationalQueueSong(song) {
  return Boolean(song?.id?.startsWith('motivation-'))
}

function isSportsQueueSong(song) {
  return Boolean(song?.id?.startsWith('sports-'))
}

function isRadioQueueSong(song) {
  return Boolean(song?.id?.startsWith('radio-'))
}

function isPodcastQueueSong(song) {
  return Boolean(song?.id?.startsWith('podcast-') || song?.tags?.includes('podcast'))
}

/** Same rule as resolveActivePlayerSurface.requiresVideoSurface */
function requiresVideoSurface(song) {
  if (!song) return false
  if (isTvQueueSong(song)) return true
  if (isSportsQueueSong(song)) return true
  if (isMotivationalVideoSong(song)) return true
  return false
}

function resolveActivePlayerSurface(song) {
  return requiresVideoSurface(song) ? 'tv' : 'audio'
}

function usesDesktopVideoPath(song) {
  return isTvQueueSong(song)
    || isSportsQueueSong(song)
    || isLectureVideoSong(song)
    || isMotivationalVideoSong(song)
}

const surfaceCases = [
  [{ id: 'tv-1', tags: [] }, true, 'tv', 'TV video requires visible video surface'],
  [{ id: 'sports-fixture-1', tags: ['sports', 'live'] }, true, 'tv', 'Sports video requires visible video surface'],
  [{ id: 'motivation-p--s', tags: ['motivational-video'] }, true, 'tv', 'Motivational video requires visible video surface'],
  [{ id: 'motivation-p--s', tags: ['motivational'] }, false, 'audio', 'Motivational audio does not require video surface'],
  [{ id: 'radio-1', tags: [] }, false, 'audio', 'Radio does not require video surface'],
  [{ id: 'podcast-ep-1', tags: ['podcast'] }, false, 'audio', 'Podcast does not require video surface'],
  [null, false, 'audio', 'null/idle session does not require video surface'],
  [{ id: 'song-1', tags: [] }, false, 'audio', 'Music does not require video surface'],
  [{ id: 'audiobook-b--c', tags: ['audiobook'] }, false, 'audio', 'Audiobook does not require video surface'],
  [{ id: 'lecture-a--s1', tags: ['lecture-video'] }, false, 'audio', 'Lecture video stays on page-local mount (not rail)'],
  [{ id: 'motivation-p--s', tags: ['motivational-stream'] }, true, 'tv', 'Motivational stream tag requires visible video surface'],
]

for (const [song, expectSurface, expectRail, label] of surfaceCases) {
  assert(requiresVideoSurface(song) === expectSurface, label)
  assert(resolveActivePlayerSurface(song) === expectRail, `${label} → rail=${expectRail}`)
}

// Mutex path still includes lecture video for ownership, but rail excludes it.
assert(usesDesktopVideoPath({ id: 'lecture-a--s1', tags: ['lecture-video'] }) === true, 'Lecture video still uses desktop video path (mutex)')
assert(requiresVideoSurface({ id: 'lecture-a--s1', tags: ['lecture-video'] }) === false, 'Lecture video does not steal shared rail mount')

// Invalid / incomplete sources must not be classified as motivational video.
assert(
  requiresVideoSurface({ id: 'motivation-p--s', tags: ['motivational'] }) === false,
  'Invalid motivational (audio tags only) does not enter video rail',
)

assert(isMotivationalQueueSong({ id: 'motivation-p--s', tags: ['motivational'] }), 'Motivational audio remains motivational family')
assert(isRadioQueueSong({ id: 'radio-1' }), 'Radio classifier intact')
assert(isPodcastQueueSong({ id: 'x', tags: ['podcast'] }), 'Podcast classifier intact')

if (process.exitCode) {
  process.exit(process.exitCode)
}

console.log('Video surface classification checks passed.')
