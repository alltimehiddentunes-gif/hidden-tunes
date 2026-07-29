# Architecture Owners — Desktop Completion Audit

**Source of truth:** `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` (live dirty tree).

## Shell

| Concern | Owner | Complete? | Duplicated? | Protected? | Risks |
|---------|-------|-----------|-------------|------------|-------|
| Electron main | `electron/main.js` | Yes | No | Yes (sandbox, isolation) | No single-instance lock; no will-navigate / setWindowOpenHandler |
| Preload | `electron/preload.js` | Yes | No | Yes (`hiddenTunesDesktop` only) | Allowlist breadth for `/api/*` |
| Renderer entry | `src/main.tsx` | Yes | No | — | — |
| Vite entry | `index.html` + `vite.config.ts` | Yes | No | — | No CSP |
| Routing | `src/App.tsx` (`NavKey` / `PageContent`) | Yes as state machine | Partial vs `PRIMARY_SECTION_NAV` | DEV drift warn only | No React Router registry module |
| App shell | `AppShell` in `App.tsx` | Yes | — | — | ~8.5k-line megafile |
| Left nav | `Sidebar` + `SIDEBAR_*` in `App.tsx` | Yes | — | — | — |
| Centre content | `PageContent` / `CatalogDetailRouter` | Yes | — | — | Detail + pages concentrated in App.tsx |
| Right persistent player | `DesktopPersistentPlayer` / `TvNowPlayingPanel` via `resolveActivePlayerSurface` | Mostly | Transport UI duplicated | Surface resolver untracked WIP | Sports video may lack dedicated surface |
| Compact bottom player | `PlayerBar` in `App.tsx` | Yes | Duplicated transport controls | — | Hidden on some overlays |

## Playback

| Concern | Owner | Notes |
|---------|-------|-------|
| Audio owner | `HtmlAudioPlaybackService` | Singleton via provider |
| Provider | `DesktopPlaybackProvider.tsx` | Authoritative |
| Mutex | Provider `stopInactiveMedia` + video/audio paths | Verified by static scripts; no formal Mutex class |
| Identity | `currentTrack` / queue commit | — |
| Transport | Provider actions + multi UI | Mute is UI volume=0 pattern |
| Capabilities | `lib/queue/capabilities.ts` | Live/finite/seek policy by family |
| Smart continuation | `smartContinuation.ts` (**untracked**) | WIP; wired from dirty provider |

## Video

| Concern | Owner | Notes |
|---------|-------|-------|
| Shared video service | `HtmlVideoPlaybackService` / `tvVideoPlayback.ts` | Singleton |
| TV UI | `TvVideoSurface` + `TvNowPlayingPanel` | Fullscreen + PiP |
| Sports video | Same service + `dispatchSportsPlayback.ts` | **No dedicated Sports video surface UI** |
| Lecture video mount | `LectureSeriesPage` | Uses mount API |

## Queue

| Concern | Owner | Notes |
|---------|-------|-------|
| Live queue | `DesktopPlaybackProvider` | `ApiSong[]` |
| Typed persist shape | `lib/queue/types.ts` | TV/Sports not persistable |
| Panel | `PlayerQueuePanel` in `PlayerShellPanels.tsx` | UI only |
| Dead stub | `QueueUpNextPanel` in App.tsx | returns null |

## Catalog

| Concern | Owner | Notes |
|---------|-------|-------|
| Music Express API | `lib/api.ts` + `musicCatalog/*` | Renderer fetch |
| Multi-family admin | `desktopCatalogBridge` + Electron `catalogBridge.js` | IPC allowlisted hosts |
| Runtime config | `desktopRuntimeConfig.ts` + `electron/runtimeConfig.js` | Intentional split; drift risk |
| Cache / dedupe / stale | `catalogCache`, `pageCache`, `dedupe.ts` | Music solid; families vary |
| Search | `useGlobalDesktopSearch` + DiscoverPage | Debounce + abort |

## Highest architecture risks

1. Monolithic `App.tsx` / `App.css`
2. Dirty tree with untracked production modules required by running app
3. Sports video surface gap
4. Dual catalog transports (Express vs admin IPC)
5. Missing Electron single-instance + navigation guards
