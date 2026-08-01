# Root cause (Phase 2) — before/with repair

## Exact surface controller

`src/lib/player/resolveActivePlayerSurface.ts`

App mounts the rail from session track only:

```tsx
const activePlayerSurface = resolveActivePlayerSurface(activeSessionTrack)
// ...
activePlayerSurface === 'tv' ? <TvNowPlayingPanel /> : <DesktopPersistentPlayer />
```

(`src/App.tsx`)

## Why TV displayed

`resolveActivePlayerSurface` (committed HEAD) returned `'tv'` only when `isTvQueueSong(currentTrack)`.
`TvNowPlayingPanel` then mounted `TvVideoSurface`, which attaches the singleton `HtmlVideoPlaybackService` video element into the visible rail.

## Why Sports did not display

1. `usesDesktopVideoPath` already included Sports → shared video **owner** received the stream.
2. `resolveActivePlayerSurface` returned `'audio'` for Sports → App mounted `DesktopPersistentPlayer` (audio chrome).
3. Video element stayed in the offscreen parking host (`.ht-tv-video-parking`) → audio/progress possible, **no visible video**.
4. `TvNowPlayingPanel` additionally gated on `isTvQueueSong` only → even a forced rail would show “Discover More”.

## Why Motivational video did not display

Same as Sports: `isMotivationalVideoSong` uses video path for mutex, but surface resolver ignored it. Audio-tagged Motivationals correctly stay on audio.

## Route influence?

Surface resolution does **not** take `activeNavKey` / route. The bug was **session classification**, not route ownership. Route changes already preserved the session; they simply preserved an invisible Sports/Motivational video session.

## Discriminators (reliable)

| Family | Video? | Helper |
|--------|--------|--------|
| TV | always (queue song) | `isTvQueueSong` |
| Sports | always (queue song = fixture video path) | `isSportsQueueSong` |
| Motivational | only `motivational-video` / `motivational-stream` tags | `isMotivationalVideoSong` |
| Motivational audio | `motivational` tag only | audio path |
| Lecture video | page-local mount | intentionally **excluded** from shared rail |

## Multiple video elements?

No — single `acquireTvVideoPlaybackService()` / `HtmlVideoPlaybackService`. Repair mounts that same element into the visible surface for Sports/Motivational video.
