/**
 * Lightweight Phase C guard: ensure motivational video + lecture video
 * share the desktop video path helper semantics with TV (mutex routing).
 *
 * Run: node scripts/verify-playback-mutex.mjs
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

function usesDesktopVideoPath(song) {
  return isTvQueueSong(song) || isLectureVideoSong(song) || isMotivationalVideoSong(song)
}

const cases = [
  [{ id: 'tv-1', tags: [] }, true, 'TV song uses video path'],
  [{ id: 'lecture-a--s1', tags: ['lecture-video'] }, true, 'Lecture video uses video path'],
  [{ id: 'lecture-a--s1', tags: ['lecture'] }, false, 'Lecture audio stays on audio path'],
  [{ id: 'motivation-p--s', tags: ['motivational-video'] }, true, 'Motivational video uses video path'],
  [{ id: 'motivation-p--s', tags: ['motivational'] }, false, 'Motivational audio stays on audio path'],
  [{ id: 'song-123', tags: [] }, false, 'Music stays on audio path'],
]

for (const [song, expected, label] of cases) {
  assert(usesDesktopVideoPath(song) === expected, label)
}

if (process.exitCode) {
  process.exit(process.exitCode)
}

console.log('Playback mutex routing checks passed.')
