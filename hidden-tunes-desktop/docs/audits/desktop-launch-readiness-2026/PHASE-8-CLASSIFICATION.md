# Phase 8 — Path Classification (Desktop status entries)

**Scope:** `hidden-tunes-desktop/` only (82 git status paths).  
**Excluded from Phase 8 commits by policy:** all `hidden-tunes-backend/**`, root `docs/audits/**` (backend sports).

Legend:  
`prod` required production source · `config` required configuration · `test` required test · `asset` required runtime asset · `docs` documentation · `evidence` audit evidence · `generated` generated output · `temp` temporary helper · `obsolete` obsolete · `unknown` unknown

| # | Status | Path | Class | Commit? | Rationale |
|--:|--------|------|-------|---------|-----------|
| 1 | M | electron/main.js | prod | YES | Security, fallback, IPC |
| 2 | M | electron/preload.js | prod | YES | Bridge allowlist |
| 3 | M | package.json | config | YES | verify scripts |
| 4 | M | scripts/test-route-independent-media.mjs | test | YES | Wired as verify:route-media |
| 5 | M | src/App.css | prod | YES | Shell styles |
| 6 | M | src/App.tsx | prod | YES | App shell |
| 7 | M | src/components/AtmosphereSettingsPanel.tsx | prod | YES | Uses split atmosphere hook |
| 8 | M | src/components/LaunchGate.tsx | prod | YES | Launch gate |
| 9 | M | src/components/home/MusicHomePage.tsx | prod | YES | Home |
| 10 | M | src/components/lectures/LectureSeriesPage.tsx | prod | YES | Lectures |
| 11 | M | src/components/lectures/LecturesPage.tsx | prod | YES | Lectures |
| 12 | M | src/components/motivationals/MotivationalsPage.tsx | prod | YES | Motivationals |
| 13 | M | src/components/player/PremiumFullscreenShell.tsx | prod | YES | Player |
| 14 | M | src/components/podcasts/PodcastShowPage.tsx | prod | YES | Podcasts |
| 15 | M | src/components/podcasts/PodcastsPage.tsx | prod | YES | Podcasts |
| 16 | M | src/components/tv/TvNowPlayingPanel.tsx | prod | YES | TV surface |
| 17 | M | src/components/tv/TvVideoSurface.tsx | prod | YES | Video mount |
| 18 | M | src/context/AtmosphereContext.tsx | prod | YES | Atmosphere provider |
| 19 | M | src/context/DesktopPlaybackProvider.tsx | prod | YES | Playback owner |
| 20 | M | src/data/artworkRegistry.ts | prod | YES | Artwork |
| 21 | M | src/lib/artworkIntegrity.ts | prod | YES | Artwork |
| 22 | M | src/lib/audiobooks/useAudiobookBookData.ts | prod | YES | Audiobooks |
| 23 | M | src/lib/audiobooks/useAudiobooksPageData.ts | prod | YES | Audiobooks |
| 24 | M | src/lib/config/desktopRuntimeConfig.ts | prod | YES | Runtime config |
| 25 | M | src/lib/desktopCatalogBridge.ts | prod | YES | Catalog IPC types |
| 26 | M | src/lib/downloads/bridge.ts | prod | YES | Downloads |
| 27 | M | src/lib/downloads/dispatchDownloadPlayback.ts | prod | YES | Downloads playback |
| 28 | M | src/lib/lectures/useDiscoverLectureSearch.ts | prod | YES | Lectures |
| 29 | M | src/lib/lectures/useLectureSeriesData.ts | prod | YES | Lectures |
| 30 | M | src/lib/lectures/useLecturesPageData.ts | prod | YES | Lectures |
| 31 | M | src/lib/lectures/useRelatedLectures.ts | prod | YES | Lectures |
| 32 | M | src/lib/localPreferences.ts | prod | YES | Preferences |
| 33 | M | src/lib/player/resolveActivePlayerSurface.ts | prod | YES | Player surface |
| 34 | M | src/lib/playerLyrics/usePlayerLyrics.ts | prod | YES | Lyrics |
| 35 | M | src/lib/playlists/dispatchPlaylistPlayback.ts | prod | YES | Playlists |
| 36 | M | src/lib/podcasts/podcastShowEnrichment.ts | prod | YES | Podcasts |
| 37 | M | src/lib/podcasts/usePodcastShowData.ts | prod | YES | Podcasts |
| 38 | M | src/lib/search/useGlobalDesktopSearch.ts | prod | YES | Search |
| 39 | M | src/lib/tv/tvCatalogApi.ts | prod | YES | TV catalog |
| 40 | M | src/lib/useAtmosphereSignals.ts | prod | YES | Atmosphere |
| 41 | M | src/lib/usePlayerOverlayController.ts | prod | YES | Player overlay |
| 42 | ?? | docs/audits/desktop-launch-readiness-2026/ | docs+evidence | YES | Authoritative Phase audit |
| 43 | ?? | docs/audits/launch-readiness/ | docs+evidence | YES | Prior phase proof (keep) |
| 44 | ?? | docs/audits/player-sidebar/_bak/ | obsolete | NO | Backup copies |
| 45 | ?? | docs/audits/player-sidebar/_bak_after/ | obsolete | NO | Backup copies |
| 46 | ?? | docs/audits/tv-catalogue-unification/ | docs | YES | TV unification docs |
| 47 | ?? | electron/fallback.html | prod+asset | YES | Crash recovery UI |
| 48 | ?? | electron/navigationPolicy.js | prod | YES | Required by main.js |
| 49–65 | ?? | scripts/_*.mjs (17 files) | temp | NO | One-off patch/probe helpers |
| 66 | ?? | scripts/capture-recently-added-evidence.mjs | test/evidence | YES | Evidence capture |
| 67 | ?? | scripts/capture-video-surface-cdp.mjs | test/evidence | YES | Evidence capture |
| 68 | ?? | scripts/capture-video-surface-evidence.mjs | test/evidence | YES | Evidence capture |
| 69 | ?? | scripts/smoke-electron-security.mjs | test | YES | Security smoke |
| 70 | ?? | scripts/smoke-eslint-lifecycle.mjs | test | YES | Lint smoke |
| 71 | ?? | scripts/verify-electron-security.mjs | test | YES | Wired verify |
| 72 | ?? | scripts/verify-motivational-video-layout.mjs | test | YES | Wired verify |
| 73 | ?? | scripts/verify-music-home-interactions.mjs | test | YES | Wired verify |
| 74 | ?? | scripts/verify-premium-honesty.mjs | test | YES | Wired verify |
| 75 | ?? | scripts/verify-recently-added-truthfulness.mjs | test | YES | Wired verify |
| 76 | ?? | scripts/verify-video-surface.mjs | test | YES | Wired verify |
| 77 | ?? | src/context/atmosphereContextInstance.ts | prod | YES | Atmosphere split |
| 78 | ?? | src/context/useAtmosphere.ts | prod | YES | Atmosphere split |
| 79 | ?? | src/lib/desktopBridgeTypes.ts | prod | YES | Bridge types for catalog/shell |
| 80 | ?? | src/lib/player/resolveVideoSurfaceLayout.ts | prod | YES | Video layout |
| 81 | ?? | src/lib/premium/ | prod | YES | premiumPresentation.ts |
| 82 | ?? | src/lib/tv/tvSearchQuery.ts | prod | YES | TV search |

**Temp scripts enumerated (exclude):**  
`_diag-home-albums.mjs`, `_isolate-app-catalog.mjs`, `_isolate-app-home-player.mjs`, `_patch-albums-fillers.mjs`, `_patch-albums-fillers2.mjs`, `_patch-app-display-meta.mjs`, `_patch-full-catalog-bounded.mjs`, `_patch-home-albums-worth.mjs`, `_patch-music-section-display.mjs`, `_peek-app-anchors.mjs`, `_peek-head-mojibake.mjs`, `_peek-player-fallback.mjs`, `_probe-home-albums.mjs`, `_probe-music-encoding.mjs`, `_repair-app-mojibake.mjs`, `_verify-encoding-fix.mjs`, `_verify-player-dash.mjs`

**Untracked production required for working app:**  
`electron/fallback.html`, `electron/navigationPolicy.js`, `src/context/atmosphereContextInstance.ts`, `src/context/useAtmosphere.ts`, `src/lib/desktopBridgeTypes.ts`, `src/lib/player/resolveVideoSurfaceLayout.ts`, `src/lib/premium/premiumPresentation.ts`, `src/lib/tv/tvSearchQuery.ts`, plus verify scripts referenced by `package.json`.

**Secret scan:** No API keys/tokens found. Only expected `localhost:5173` in navigationPolicy (dev CSP).
