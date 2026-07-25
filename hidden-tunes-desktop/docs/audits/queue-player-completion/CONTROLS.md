# Controls

## Previous threshold

One consistent finite-media restart threshold:

| Constant | Value |
| -------- | ----- |
| `QUEUE_PREVIOUS_RESTART_SECONDS` | **3** (within required 3–5s) |

Applies to Music, Podcast, Audiobook, Motivational, Lecture, and downloaded finite audio of those families.

| Family | Behavior |
| ------ | -------- |
| Finite seekable | Restart current when elapsed > 3s; else previous queue item |
| Radio / TV live | Never fake-restart; previous walks queue when capability allows |
| Sports live | Previous/next disabled by default (`resolvePlaybackCapabilities`) |

## Seek

`seekTo` rejects live / non-seekable owners (Radio, TV, Sports).
`resolvePlaybackCapabilities` / `canSeekQueueTrack` drive UI.

## Keyboard

Provider `keydown` (single listener):

- Space → play / pause
- ArrowLeft / ArrowRight → previous / next when capability allows
- Ignored inside `input`, `textarea`, `select`, and contenteditable

## Queue UI

`PlayerQueuePanel`:

- Clear / move / remove
- Family label + LIVE + Downloaded markers
- Uses stored queue metadata (no catalog fetch to render rows)
