# Ownership

See also `PLAYBACK-OWNERSHIP.md` (same contract).

| Role | Owner |
| ---- | ----- |
| Queue state | `DesktopPlaybackProvider` (`currentQueue` / index) + typed module `src/lib/queue` |
| Audio element | `HtmlAudioPlaybackService` inside `DesktopPlaybackProvider` |
| TV / Sports / lecture video / motivational video | Single `HtmlVideoPlaybackService` inside the same provider |
| Player bar | One `PlayerBar` in `App.tsx` |
| Queue panel UI | `PlayerQueuePanel` (does not own playback) |
| Playback mutex | Existing desktop mutex + generation invalidation on switch / clear / active remove |
| Ended / auto-advance | Provider audio/video `ended` handlers only |
| Keyboard | One `keydown` listener in provider; ignores input / textarea / select / contenteditable |
| Media Session | `bindMediaSessionActions` in provider |

No second queue React provider. No second player bar. No offline-only player.
