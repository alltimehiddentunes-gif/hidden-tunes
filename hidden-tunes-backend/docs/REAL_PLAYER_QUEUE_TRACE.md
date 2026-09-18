# REAL_PLAYER_QUEUE_TRACE

Date: 2026-09-18  
Client root: `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` @ `a504b382`  
Backend prep: search-session only via `GET /api/media` → `onTrackStarted`

## Verdict

**Client knows Next as soon as the queue is set (at tap / playSong).**  
**Backend does not learn the player's real Next until that opaque `/api/media/<id>` is requested** (usually at track end / manual next).  
Search-session prewarm is **not** wired to the player queue. Client `preloadUpcomingTrack` is a **no-op** (only clears preload).

That is the root pattern for multi-minute auto-next: cold resolve starts when B is first fetched.

---

## Lifecycle (production)

| Event | Where | When Next is known |
|-------|--------|--------------------|
| Queue formed | `playSong(song, queue, index)` → `syncActiveQueue` | **Immediately** — B/C already in `activeQueueRef` |
| Current plays | `loadAndPlay` → `GET /api/media/<A>` | Backend prepares search-order next, **not** player B |
| ~15s before end | status callback → `preloadUpcomingTrack` | Client knows B; **does not notify backend**; function only `clearPreloadedSound()` |
| Track ends | `didJustFinish` → `scheduleTrackAdvance` → `nextSong({source:"auto"})` | Client picks `queue[nextIndex]` |
| B URI load | `loadAndPlay(B)` → first `GET /api/media/<B>` | **Backend first learns B** → cold ingest/yt-dlp |

Key lines:
- Queue advance: `PlayerContext.tsx` ~4481–4694 (`nextSong`)
- End signal: ~5447–5458 (`didJustFinish` → `scheduleTrackAdvance`)
- Preload stub: ~3893–3911 (`preloadUpcomingTrack`)
- Near-end hook: ~5481–5491 (`PRELOAD_BEFORE_END_MS = 15000`)
- URI from queue: `getPlayableUri` ~1553–1564 (`streamUrl` / `url` preserved in `normalizeSong`)

## Identity preservation

`normalizeSong` keeps `streamUrl`/`url` for non-YouTube tracks. External HT songs retain opaque `https://api.hiddentunes.com/api/media/<uuid>` through the queue.

Auto-next does **not** re-search when Next exists in queue; it `loadAndPlay`s the queued song. Smart-extend only runs when `nextIndex === -1`.

## Backend session gap

`routes/media.js` on GET calls `onTrackStarted` → `rollingWindowAfter` from **search** registration order. Player queue order can differ; search prewarm never receives explicit `{current, next[]}`.

## Failure classification (1–3 min)

Primary: **PREWARM_NOT_TRIGGERED** for real queue Next + **YT_DLP_COLD_RESOLVE** / worker wait when B is first requested at transition.  
Contributing: **PREWARM_QUEUE_STARVED** if search speculative jobs hold slots; **PLAYBACK_MAPPING_EXPIRED** if API restart drops in-memory store (secondary).

Not primary: stream URL lost, YouTube rebuild, unnecessary `/api/songs` on in-queue auto-next.

## Required fix

1. `POST /api/media/prepare` `{ current, next[] }` opaque IDs only → async P1/P2 prepare  
2. Client fire-and-forget prepare on queue set / index change / near-end  
3. Unify with existing `PlaybackPreparationService`  
4. OTA authorized for minimal JS hook
