# Hidden Tunes Desktop — Reproducibility Manifest

Snapshot date: 2026-08-07  
Repository: `D:\HiddenTunes\Active\HiddenTunes-Desktop`  
Branch: `desktop/integrate-home-music-split`  
Baseline HEAD: `07c5fd1ea83379ca784cf6ac325f967f7b944b28`  
Current dirty paths: 234  
Commit status: intentionally uncommitted until installed Windows validation passes

## Reproduction equation

The currently tested product is reproducible only from:

1. baseline HEAD above;
2. every product/runtime file listed below in its current working-tree state;
3. `package-lock.json` and `npm ci` dependencies;
4. an Electron-capable Windows environment;
5. configured HTTPS admin catalog access through the Electron catalog bridge;
6. required runtime environment variables documented by `electron/runtimeConfig.js`;
7. backend Emotional Worlds files listed below when that production feature is enabled.

The application is **not yet reproducible from a fresh checkout** because required files remain modified or untracked.

## Required Desktop entry/build assets

- `package.json`
- `package-lock.json` (tracked dependency lock)
- `index.html`
- `electron/main.js`
- `electron/preload.js`
- `electron/catalogBridge.js`
- `electron/runtimeConfig.js`
- `build/icon.ico`
- `build/icon.png`
- `electron/tray-icon.png`
- `public/brand/hidden-tunes-mark.png`
- `public/brand/hidden-tunes-official.png`
- `public/artwork/worlds/emotional-world-{calm,chill,energetic,happy,melancholy,motivational,romantic}.png`

## Required Desktop application source

- `src/App.tsx`
- `src/App.css`
- `src/player-premium.css`
- `src/context/DesktopPlaybackProvider.tsx`
- `src/components/LaunchScreen.tsx`
- `src/components/DesktopWindowControls.tsx`
- `src/components/HiddenTunesBrandMark.tsx`
- `src/components/PlayerModeLauncher.tsx`
- `src/components/PlayerModeSwitcher.tsx`
- `src/components/account/SignInDialog.tsx`
- `src/components/home/MusicHomePage.tsx`
- `src/components/home/MusicHomePage.css`
- `src/components/library/DesktopLibraryPage.tsx`
- `src/components/music/GlobalTopNav.tsx`
- `src/components/music/MusicSectionContent.tsx`
- `src/components/player/DesktopPersistentPlayer.tsx`
- `src/components/player/PlayerShellPanels.tsx`
- `src/components/player/PremiumFullscreenShell.tsx`
- `src/components/playlists/DesktopPlaylistsPage.tsx`
- `src/components/playlists/PlaylistPickerProvider.tsx`
- `src/components/playlists/playlistPicker.ts`
- `src/components/podcasts/PodcastShowPage.tsx`
- `src/components/sports/DesktopSportsPage.tsx`
- `src/components/sports/SportsFixtureDetails.tsx`
- `src/data/artworkRegistry.ts`

## Required Desktop libraries

- `src/lib/api.ts`
- `src/lib/artistIdentity.ts`
- `src/lib/brandAssets.ts`
- `src/lib/catalogIndexes.ts`
- `src/lib/desktopBridgeTypes.ts`
- `src/lib/desktopPlayback/queueIntelligence.ts`
- `src/lib/desktopPlayback/smartContinuation.ts`
- `src/lib/desktopPlayback/types.ts`
- `src/lib/emotionalWorldApi.ts`
- `src/lib/emotionalWorlds.ts`
- `src/lib/home/mobileHomeParity.ts`
- `src/lib/lectures/lectureCatalogApi.ts`
- `src/lib/lectures/useDiscoverLectureSearch.ts`
- `src/lib/lectures/useLectureSeriesData.ts`
- `src/lib/lectures/useLecturesPageData.ts`
- `src/lib/lectures/useRelatedLectures.ts`
- `src/lib/localPreferences.ts`
- `src/lib/musicGenres.ts`
- `src/lib/nowPlayingStyle.ts`
- `src/lib/playerQueueDisplay.ts`
- `src/lib/playlists/index.ts`
- `src/lib/playlists/playlistService.ts`
- `src/lib/playlists/useDesktopPlaylists.ts`
- `src/lib/podcasts/podcastFormatters.ts`
- `src/lib/premiumAudioVisualizer/engine.ts`
- `src/lib/search/musicSearchRanking.ts`
- `src/lib/useAutoOpenPreferredPlayer.ts`
- `src/lib/usePlayerOverlayController.ts`

## Required localization source

- `src/localization/LocalizationProvider.tsx`
- `src/localization/context.ts`
- `src/localization/index.ts`
- `src/localization/localeLoaders.ts`
- `src/localization/normalizeLocale.ts`
- `src/localization/preference.ts`
- `src/localization/supportedLocales.ts`
- `src/localization/translate.ts`
- `src/localization/types.ts`
- `src/localization/validation.ts`
- `src/localization/locales/{en,es,fr,de,pt,it,nl,pl,ru,tr,ar,hi,zh-CN,zh-TW,ja,ko,id,vi,th,fil}.ts`

## Required backend source for current Desktop product

- `hidden-tunes-backend/hidden-tunes-admin/app/api/music/emotional-worlds/route.ts`
- `hidden-tunes-backend/hidden-tunes-admin/app/api/music/emotional-worlds/[worldId]/route.ts`
- `hidden-tunes-backend/hidden-tunes-admin/lib/emotionalWorldCatalog.ts`
- `hidden-tunes-backend/hidden-tunes-admin/lib/emotionalWorldIntelligence.ts`
- `hidden-tunes-backend/hidden-tunes-admin/lib/emotionalWorldRegistry.ts`

The protected upload route, compatibility router, R2 helper, Supabase helpers, and audiobook catalog/ingestion code are tracked baseline dependencies. They are protected even when not dirty.

## Required release/test source (not renderer runtime)

The following dirty/untracked checks are necessary to reproduce the completion evidence and must be retained until the release commit is curated:

- `.github/workflows/desktop-cross-platform.yml`
- `scripts/runtime-validation-harness.mjs`
- modified runtime scripts for catalog, Search, Playlists, Podcast/Radio/Audiobook, TV, settings, sports, Home albums, and Auto-Next
- untracked `verify-*.mjs` contract scripts covering audio output, branding, identity, cross-platform, Emotional Worlds, Favorites, localization, media session, Now Playing, sidebar/viewport, playlist picker, Podcast player, harness, Search relevance, direct TV playback, fullscreen, and window controls
- `scripts/audit-hardcoded-copy.mjs`
- `scripts/measure-favorites-performance.mjs`

These are classified **REQUIRED TEST**, not product runtime files.

## Active feature work

- Emotional Worlds backend routes/intelligence and their test/package-script wiring
- cross-platform build workflow
- branch-recovery audit notes
- the completion-sprint Podcast speed repair and expanded runtime harness assertions

These remain **ACTIVE WORK IN PROGRESS** until their respective product and release gates pass.

## Generated/test artifacts

The following families are evidence only and are not runtime dependencies:

- `docs/audits/**` screenshots and JSON results
- `docs/home-music-split/runtime-validation/results.json`
- backend `data/africa-tv-*/**`
- backend `data/romania-tv-deep/**`
- backend `data/tv-deep-import-top10/**`
- backend `data/tv-expansion-25k/**`
- backend `data/audiobooks-multisource/**`

They are classified **GENERATED/TEST ARTIFACT**. This classification does not authorize deletion.

## Optional P2/P3 or unrelated to current release path

- country-scale TV import/audit runner scripts
- audiobook multisource audit dry-run script
- temporary investigative data outputs

These must not be staged into the Desktop completion commit unless later promoted by a release requirement.

## Locked dependency set

Runtime dependencies:

- `@supabase/supabase-js`
- `dashjs`
- `hls.js`
- `react`
- `react-dom`

Build/test dependencies include Electron, electron-builder, TypeScript, Vite, ESLint, React plugins/types, concurrently, cross-env, and wait-on. Exact versions are authoritative in `package-lock.json`.

## Fresh-checkout gate

Before Phase 9 can pass, a clean checkout at the eventual release SHA must satisfy:

```text
npm ci
npm run build
focused and full quality gates
NSIS x64 build
installed-app runtime matrix
```

No required file may remain anonymous, untracked, or dependent on an external dirty workspace at that point.
