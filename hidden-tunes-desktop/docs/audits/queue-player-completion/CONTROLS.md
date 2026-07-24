# Controls

## Previous threshold

| Family | Restart current when elapsed > |
| ------ | ------------------------------ |
| Music / Podcast | `QUEUE_PREVIOUS_RESTART_SECONDS` = **3s** |
| Audiobook | `AUDIOBOOK_PREVIOUS_RESTART_SECONDS` = **8s** |
| Motivational | `MOTIVATIONAL_PREVIOUS_RESTART_SECONDS` = **8s** |
| Lecture | `LECTURE_PREVIOUS_RESTART_SECONDS` = **8s** |
| Radio | **Never** restarts mid-stream — always goes to previous queue item when available |
| TV / Sports | No finite restart seek — previous walks the queue |

Below threshold (or radio), previous moves to `queueIndex - 1` (with repeat-all wrap when enabled).

## Seek

`seekTo` rejects live / non-seekable owners:

- Radio
- TV
- Sports

Emits `player_seek_rejected` diagnostic with reason `live-or-non-seekable`.

`canSeekQueueTrack` in `family.ts` mirrors the same policy for UI.

## Queue UI

`PlayerQueuePanel` (`.player-queue-panel` / `.player-queue-empty`):

- Clear (`.player-queue-clear`)
- Move up/down (`.player-queue-move`)
- Remove (`.player-queue-remove`)
- Radio rows show **LIVE** in `.player-queue-duration`

Workspace Up Next rail (`QueueUpNextPanel`) mounts only when `hasPlayback` (active track + queue). Fullscreen shell can open the Queue tab independently.
