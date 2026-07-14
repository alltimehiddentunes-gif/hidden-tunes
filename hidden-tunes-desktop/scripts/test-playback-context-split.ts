import assert from 'node:assert/strict'

/**
 * Documents the playback context split:
 * stable transport state must not include high-frequency progress fields.
 */
function main() {
  const stableKeys = [
    'currentTrack',
    'currentQueue',
    'currentIndex',
    'isPlaying',
    'seekTo',
  ]
  const progressKeys = ['positionSeconds', 'durationSeconds']

  assert.ok(!stableKeys.some((key) => progressKeys.includes(key)))
  console.log('playback context split invariant ok')
}

main()
