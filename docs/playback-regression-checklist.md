# Hidden Tunes Playback Regression Checklist

Use this checklist before release builds and before any native Track Player migration work. Run on a real Android tester device and a real iPhone when possible.

## Environment setup

- [ ] Development build with `[HiddenTunes:playback]` logs visible in Metro/console
- [ ] At least one Hidden Tunes cloud track with a valid stream URL
- [ ] At least one Audius or archive track (optional multi-source check)
- [ ] Slow network profile enabled for one pass (OS network throttle or weak Wi‑Fi)

## Android tester playback

- [ ] Tap a song on Home — audio starts, MiniPlayer appears, no duplicate load errors in logs
- [ ] Tap the same song rapidly twice — second tap is ignored while load is in progress (`duplicate_play_ignored`)
- [ ] Switch to a different song quickly — new song plays, no stuck loading state
- [ ] Background the app for 30s — audio continues or resumes correctly on return
- [ ] Return to foreground — `background_state_change` logs appear, playback position is sane

## iPhone playback

- [ ] Repeat Android smoke tests on iPhone
- [ ] Silent switch on — audio still plays (existing silent-mode behavior)
- [ ] Interruption (incoming call sample) — app recovers without crash

## Lock screen auto-next

- [ ] Play a queue of 3+ Hidden Tunes tracks
- [ ] Lock the device before track 1 ends
- [ ] Track advances to next item without opening the app
- [ ] Logs show `track_finished` / `auto_next_attempt` / `auto_next_success` (or explicit skip reason)

## Queue shuffle / repeat

- [ ] Shuffle on — next track is not always the list neighbor; `shuffle_state` log updates
- [ ] Repeat one — track restarts at end; auto-next logs cite repeat one
- [ ] Repeat all — last track wraps to first; auto-next logs cite repeat all
- [ ] Queue screen next/previous matches audible playback

## Lyrics screen playback

- [ ] Open lyrics for the current track while playing
- [ ] Playback continues; synced lines advance (if LRC available)
- [ ] Seek from lyrics (if supported) does not desync queue index

## MiniPlayer controls

- [ ] Play/pause from MiniPlayer
- [ ] Next/previous from MiniPlayer
- [ ] Tap MiniPlayer opens full player with correct track metadata

## Slow network playback

- [ ] Start playback on slow network — `audio_load_start` then `audio_load_success` or controlled failure
- [ ] Failed load does not crash the app (`audio_load_failure` logged)
- [ ] Retry play on same track after network improves

## Long session playback

- [ ] Play 45+ minutes across multiple tracks (mix manual next and auto-next)
- [ ] No memory runaway; no orphaned `Audio.Sound` loads in logs
- [ ] Finish watchdog fires near end (`finish_watchdog_armed` / `finish_watchdog_fired`) without double-advance loops

## TV / YouTube (must remain isolated)

- [ ] YouTube results still route to `/youtube-player`, not native `playSong`
- [ ] Hidden Tunes TV tab playback unchanged

## Cache-first screens (must remain intact)

- [ ] Home / Explore / Search still show cached catalog instantly
- [ ] Dev performance overlay still visible in `__DEV__` only

## Sign-off

| Device | OS | Tester | Date | Pass |
|--------|-----|--------|------|------|
|        |     |        |      |      |
