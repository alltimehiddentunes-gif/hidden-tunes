# Architecture Audit

**Verdict:** Single playback owner and single queue owner hold. Shared video singleton for TV/Sports/lecture-video/motivational-video. Audio/video mutex present. Electron bridge is allowlisted.

---

## Ownership map

| Concern | Owner | Status |
|---------|-------|--------|
| Playback transport | `DesktopPlaybackProvider` | PASS — single owner |
| Queue | Same provider (`queueRef` / playQueue / enqueue) | PASS |
| Audio element | `HtmlAudioPlaybackService` (one `Audio`) | PASS |
| Video element | `HtmlVideoPlaybackService` singleton via `acquireTvVideoPlaybackService` | PASS |
| TV UI mount | `TvVideoSurface` / `TvNowPlayingPanel` | PASS — mount only |
| Sports video | Same video service via sports adapters | PASS |
| Motivational / lecture video | Same video path when flagged | PASS |
| Audio ↔ video mutex | `stopInactiveMedia` + `activeMediaRef` | PASS (`verify:playback-mutex`) |
| Persistent player | `DesktopPersistentPlayer` | PASS — view only |
| Compact / footer | `PlayerBar` in `App.tsx` | PASS — view only |
| Fullscreen | `PremiumFullscreenShell` | PASS — view only |
| Catalog fetch | Electron catalog IPC + renderer catalog bridge | PASS |
| Search | `useGlobalDesktopSearch` | PASS |
| Downloads | Main `DownloadManager` + renderer bridge | PASS |
| Navigation | In-memory `NavKey` / `PageId` / `ActiveView` (no react-router) | PASS |
| Atmosphere / visualizer | Separate contexts; visualizer attaches to existing audio | PASS — not a second player |

### Duplicate playback engines?

**None found.** Only:

1. `HtmlAudioPlaybackService` → `new Audio()`
2. `HtmlVideoPlaybackService` → one `<video>`
3. Premium visualizer analyzes existing audio element

Family adapters dispatch into `playQueue` only.

---

## Provider tree

```
PreferencesResetProvider
  DesktopPlaybackProvider
    AtmosphereProvider
      PremiumAudioVisualizerProvider
        CatalogProvider
          LaunchGate → AppShell
```

---

## Routing model

- **20 NavKeys** including home, music, radio, podcasts, audiobooks, motivationals, lectures, tv, sports, worlds, search, library, liked, recent, downloads, playlists, artists, albums, premium, settings
- Detail views: song/album/artist/mood/podcast-show/audiobook-book/motivational-program/lecture-series/lecture-item
- **No dedicated Queue or More routes**

---

## Electron / IPC

| Control | Value |
|---------|-------|
| contextIsolation | true |
| nodeIntegration | false |
| sandbox | true |
| webSecurity | true |
| preload | `electron/preload.js` → `window.hiddenTunesDesktop` only |
| IPC allowlist | runtime, shell.openExternalUrl, catalog, downloads |
| Navigation | `navigationPolicy.js` classifier + will-navigate + deny window.open |
| CSP | Response headers; prod `script-src 'self'` (no unsafe-eval) |
| External URLs | Validated open-external only |

`verify:electron-security` — **PASS** (58 checks).

---

## Monolith risk

| Asset | Size |
|-------|------|
| `src/App.tsx` | ~8335 lines / ~310 KB |
| `src/App.css` | ~688 KB |

**Risk:** High change-collision and review cost. Not a functional regression by itself, but blocks safe parallel launch work.

---

## Regressions checked (scripted)

| Check | Result |
|-------|--------|
| Playback mutex routing | PASS |
| Route-independent media | PASS |
| Recently Added truthfulness | PASS |
| Premium honesty | PASS |
| Electron security | PASS |

---

## Architecture gaps (non-regressions)

1. No auto-update subsystem  
2. No product auth layer (only Follow session helper)  
3. Queue page optional but unwired  
4. Dirty WIP spans architecture-sensitive files (main, preload, provider, App) — freeze required before release
