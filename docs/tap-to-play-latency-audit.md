# Tap-To-Play Latency Audit

## Scope

This audit targeted the song tap path only:

- Song card handlers route into playSong.
- playSong prepares immediate UI state and queue context.
- playQueue preserves the existing queue architecture.
- loadAndPlay hands off to HiddenAudio.

No queue architecture, radio discovery, podcast discovery, search architecture, Android Auto, CarPlay, Desktop, radio playback, podcast playback, or video playback changes were made.

## Measured Timing

A physical-device before/after measurement was not available from this shell. Development-only timing logs were added under [HTTapLatency] so device QA can capture exact timings:

- 	ap_received
- playSong_started
- playable_url_resolved
- udio_load_started
- irst_audio_playing
-
on_critical_work_completed

The expected measurement source is Metro/device logs while tapping songs from Home, Search, Album, Artist, and Playlist.

## Root Cause Found

The tap path had several audio-start blockers:

- playSong awaited HiddenAudio/native bridge reconciliation before optimistic player state updates.
- Latest-tap invalidation did not happen until deeper in loadAndPlay, so older pending work could survive early awaits.
- User-initiated replacements could silence/probe native audio in interruptCurrentPlaybackForUserTap, then probe/silence again inside loadAndPlay.
- Cleanup of an unrelated preloaded sound was awaited before the new track load.
- loadAndPlay performed a duplicate Now Playing metadata update before calling ctivateHiddenAudioPlayback, even though activation already updates metadata before loading.
- Remote queue availability sync was awaited after audio activation before confirming state.

## Changes Made

- Optimistic UI now happens before bridge reconciliation, so current song/loading/player state responds immediately.
- Each playSong tap increments a latest-tap generation and invalidates older load requests immediately.
- Older taps are ignored after interrupt and before queue handoff if a newer tap arrives.
- HiddenAudio bridge reconciliation now runs in the background for taps instead of blocking the tap path.
- User-initiated loads that already interrupted playback skip the second native probe/silence pass.
- Unrelated preloaded sound cleanup is deferred instead of awaited before the new load.
- Duplicate pre-load Now Playing update was removed from loadAndPlay; activation still updates metadata.
- Remote queue availability sync after activation is deferred.
- Deferred non-critical side effects now log completion timing in development.

## Files Changed

- context/PlayerContext.tsx
- docs/tap-to-play-latency-audit.md

A separate dirty favorite-button change in components/catalog/CatalogSongRow.tsx was missing a COLORS import and blocked typecheck in the working tree. The import was added locally to validate the tree, but the broader favorite changes were not part of this latency fix.

## Remaining Risks

- HiddenAudio native load time still depends on network and stream readiness.
- Manual QA must confirm the latest tap wins when multiple songs are tapped quickly.
- Device logs are required to compare before/after latency numbers.
- Same-track resume still checks native state because it may avoid a full reload.

## Manual QA Checklist

- Tap song from Home.
- Tap song from Search.
- Tap song from Album.
- Tap song from Artist.
- Tap song from Playlist.
- Tap multiple songs quickly and confirm only the latest starts.
- Confirm UI and mini player update immediately.
- Confirm loading state appears immediately when audio is not ready.
- Confirm radio still works.
- Confirm podcasts still work.
