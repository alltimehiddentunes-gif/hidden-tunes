# Route-independent media persistence

**Date:** 2026-07-27  
**Branch:** `desktop/integrate-home-music-split`  
**Principle:** Browsing changes the page. Pressing Play changes the media.

## Root cause

Right-rail selection was route-coupled in `App.tsx`:

```tsx
{activeNavKey === 'tv' ? <TvNowPlayingPanel /> : <DesktopPersistentPlayer />}
```

Leaving the TV page unmounted the TV rail (video parked) and mounted the audio player UI even while the TV session remained active in `DesktopPlaybackProvider`.

## Fix

- Added `resolveActivePlayerSurface(currentTrack)` — route-agnostic.
- `AppShell` derives `activeSessionTrack` from playback state and mounts the rail from `activePlayerSurface`.
- Footer `PlayerBar` already preferred `currentTrack`; left unchanged.

## Ownership map

| Concern | Owner |
| --- | --- |
| activeRoute | `AppShell` `activeNavKey` / `activePage` |
| activeMediaSession | `DesktopPlaybackProvider` `currentTrack` / queue |
| Right sidebar | `TvNowPlayingPanel` or `DesktopPersistentPlayer` via `resolveActivePlayerSurface` |
| Bottom footer | `PlayerBar` from `currentTrack` |
| Audio owner | `HtmlAudioPlaybackService` (singleton via provider) |
| Video owner | `HtmlVideoPlaybackService` via `acquireTvVideoPlaybackService` |
| Mutex | `activeMediaRef` + `stopInactiveMedia` |

## Validation

```bash
node scripts/test-route-independent-media.mjs
electron scripts/capture-route-independent-media.mjs
```

Runtime sequence A+B passed (9/9). Screenshots under this folder.
