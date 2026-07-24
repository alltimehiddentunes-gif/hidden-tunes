# Sports — Playback Ownership

## Owner

Sports shares the **desktop video path** with TV (and other video families):

- `isSportsQueueSong` → queue id `sports-*`
- `usesDesktopVideoPath` includes `isSportsQueueSong`
- `playQueue(..., 'sports', ...)` via `dispatchSportsPlayback`

## Mutex expectations

- At most **one** `.player-bar`
- At most **one** `.ht-tv-video-element`
- Starting Sports after Music transfers ownership — no duplicate surfaces

## Cancellation

Abort / navigate-away → `AbortError` / `{ status: 'cancelled' }` — **silent**, not timeout error UI.

## History

Successful playback may mirror `type: 'sports'` with `positionSeconds: null`. Failures do not invent history.

## Deferred

Library favorites and Downloads remain out of ownership for Sports (`stream_only` / deferred).
