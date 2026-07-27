# Home + Persistent Player — BEFORE

**Workspace:** `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration`  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD at audit:** `59c532b3fabd8c57b91712fd6313670787213c4e`  
**Date:** 2026-07-27

## Current layout ownership

| Surface | Owner |
|---------|--------|
| Desktop shell | `AppShell` in `src/App.tsx` |
| Left sidebar | `Sidebar` in `src/App.tsx` (`SIDEBAR_PRIMARY_NAV`, `SIDEBAR_LIBRARY_NAV`) |
| Centre content | `.main-scroll` + `CatalogDetailRouter` / page components |
| Duplicate top route strip | `GlobalTopNav` (`src/components/music/GlobalTopNav.tsx`) via `PRIMARY_SECTION_NAV` |
| Page search header | `HomeTopBar` in `src/App.tsx` |
| Home page | `HomePage` → `MusicHomePage` (`src/components/home/MusicHomePage.tsx`) |
| Right rail (non-TV) | `QueueUpNextPanel` in `src/App.tsx` |
| Right rail (TV nav) | `TvNowPlayingPanel` (`src/components/tv/TvNowPlayingPanel.tsx`) — shared video owner |
| Bottom player bar | `PlayerBar` in `src/App.tsx` |
| Fullscreen player shells | `PremiumFullscreenShell` + overlay controller |
| Authoritative playback | `DesktopPlaybackProvider` (`src/context/DesktopPlaybackProvider.tsx`) |
| Queue panel rows | `PlayerQueuePanel` (`src/components/player/PlayerShellPanels.tsx`) |
| Capabilities | `resolvePlaybackCapabilities` (`src/lib/queue/capabilities.ts`) |
| Metadata | `resolvePlayerShellMetadata` (`src/lib/playerDisplayMetadata.ts`) |
| Progress subscription | `useDesktopPlaybackProgress` |

## Right-sidebar problem

- `QueueUpNextPanel` returns `null` when nothing is playing.
- When playing, it shows an “Up Next” queue list only — not a full Now Playing player surface.
- PSD Now Playing rail CSS (`.now-playing-rail`, `.rail-psd-*`) still exists from earlier work, but the live JSX was reduced to the queue-only panel.
- Empty artwork falls back to `deriveEntityInitials`, which returns `?` for empty labels — the source of the large question-mark placeholder appearance when idle/empty art is shown elsewhere (player bar / art frames).

## Real player elsewhere

Yes. Authoritative controls already exist in:

1. Bottom `PlayerBar` (compact, always available when overlays closed)
2. `PremiumFullscreenShell` / cinema overlays
3. `PlaybackTransportControls` / `FullPlayerTransportControls`
4. TV video surface owned by `TvVideoSurface` + `acquireTvVideoPlaybackService`

The right sidebar does **not** currently host that player experience.

## Layout problems observed

1. Home content hierarchy is thin (Continue / Recent / Made for You / Gems / Jump In) with duplicated top navigation above it.
2. Top `GlobalTopNav` duplicates left sidebar primary destinations.
3. Right rail is incomplete / missing when idle; not a persistent player.
4. At `max-width: 1265px`, `.queue-rail--workspace` is hidden — player rail disappears before 1024px requirement.

## Files expected to change (this task)

- New: `src/components/player/DesktopPersistentPlayer.tsx`
- `src/components/music/GlobalTopNav.tsx` (remove route strip)
- `src/components/home/MusicHomePage.tsx` (hierarchy)
- Surgical `src/App.tsx` (sidebar groups + wire right rail; preserve catalog dirty work)
- Scoped `src/App.css` (three-column persistence, responsive, home/player polish)
- Audit docs under `docs/audits/home-player-layout/`

## Files that must not change

- Catalog/pagination/config dirty set listed in `EXISTING-DIRTY-BOUNDARY.md`
- `DesktopPlaybackProvider.tsx` (unless a proven blocker appears — stop instead)
- Electron main/preload/catalog bridge
- Mobile / backend / other clones
- TV video ownership (`TvVideoSurface` / `tvVideoPlayback`)
