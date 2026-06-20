# Heat + Smooth Scrolling Audit

Audit date: 2026-06-19

Scope: audit only. No code fixes were made. This report focuses on phone heat during browsing/surfing, scroll smoothness, tap latency, JS-thread stalls, memory pressure, and network/image pressure. Playback, HiddenAudio, queue, lockscreen, background playback, CarPlay, Android Auto, downloads, uploads, and premium UI design were intentionally not modified.

Important context: this audit was run on the current dirty working tree after the search provider work. Some findings below are from current uncommitted files, not necessarily committed production code.

## Top 10 Heat Sources

| Rank | Files | Likely cause | Estimated impact | Risk level | Safe fix direction |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/search.tsx`, `services/universalSearchService.ts`, `utils/catalogSongRanking.ts`, `utils/searchApkParity.ts` | Search performs multiple full-catalog passes per submitted query: local universal search, backend merge, direct song filtering, ranking, reliable results, APK song ranking, album/artist/genre/station derivation, and lyric scanning up to `LIMITS.lyricScan = 6000`. | High CPU during search; can heat phone and delay taps after typing. | High | Precompute a catalog search index, cap lyric scan more aggressively on mobile, and use staged search results by priority. |
| 2 | `app/music-feed.tsx` | Home rebuilds mood/open-room groups by scanning all songs for each group: `buildMoodRooms(songs)`, `buildOpenRooms(songs)`, `becauseYouListened`, `smartQueueSongs`, and preferred genre sorting all run when catalog/player preference inputs change. | High CPU when home hydrates, refreshes, or player state changes. | High | Cache derived home sections by catalog fingerprint and user preference signature. |
| 3 | `components/HTImage.tsx` | Every image tile owns several states/effects, computes candidates, subscribes to global fast-scroll state, may prefetch visible URI, tracks fallback failures, and runs fade transitions. On image-heavy rails this multiplies quickly. | High heat/network pressure while browsing artwork-heavy home/search/results. | High | Use a lighter image component for dense lists, disable per-item prefetch, and pass stable primitive props. |
| 4 | `app/music-feed.tsx` | Multiple horizontal `ScrollView` rails inside a vertical `FlatList` render many artwork cards without virtualization. `ScrollView` eagerly mounts each rail's children. | High memory/GPU pressure on home. | High | Replace heavy horizontal rails with horizontal `FlatList` using existing list performance settings. |
| 5 | `services/freeMusicProviders.ts`, `app/search.tsx` | Free provider search can fan out to Audius, Archive, FMA, Musopen, and conditional Jamendo. Archive-like providers each fetch search results plus metadata for every document via `Promise.all`. | Medium-high CPU/network/battery during search; can stack with local ranking. | High | Limit Archive metadata fanout, stagger providers, cache provider results per query, and skip external providers while local/backend results are still sufficient. |
| 6 | `services/hiddenTunes.ts`, `services/hiddenTunesApi.ts`, `state/catalogFetchLayer.ts` | Catalog hydration and derived catalog generation create large arrays of normalized songs, albums, artists, genres, playlists. `getCachedHiddenTunesCatalog()` calls `syncDerivedCatalogFromSnapshot()`, which can map snapshots before returning cached data. | Medium-high startup/home heat on large catalogs. | Medium | Persist derived catalog fingerprint/results or compute indexes incrementally off the first visible frame. |
| 7 | `app/music-feed.tsx` | Hero carousel interval every 6.5s calls `setHeroIndex` and `scrollToIndex` while the screen is focused and active. It can animate during browsing even when user is interacting elsewhere on home. | Medium GPU/JS activity. | Medium | Pause carousel during vertical scrolling and when hero is offscreen. |
| 8 | `components/MiniPlayer.tsx` | Polling timer periodically loads YouTube mini state from AsyncStorage while no current song is active. | Medium background-ish storage churn on browsing screens that show MiniPlayer. | Medium | Convert to event/subscription-based state or increase/back off polling interval. |
| 9 | `services/onboardingPrewarm.ts`, `utils/startupScheduler.ts`, `services/startupCoordinator.ts` | Startup/onboarding prewarm performs network fetches, ranking, image preloads, cache writes, and genre prewarm after paint/interaction/idle. | Medium heat after launch, especially on low-end devices. | Medium | Gate nonessential prewarm behind app idle, battery/network conditions, and visible screen relevance. |
| 10 | `context/PlayerContext.tsx`, `services/catalogViewPersistence.ts`, `services/hiddenTunesApi.ts`, `state/emotionalFlowSession.ts` | Many AsyncStorage reads/writes exist. Most are playback/state-related and out of scope for edits, but they can contend with browsing if invoked during startup, restore, or state transitions. | Medium JS bridge/storage pressure. | Medium | Batch noncritical writes, keep browse screens independent from restore-heavy work, and preserve existing debounce patterns. |

## Top 10 Scroll / Tap Lag Sources

| Rank | Files | Likely cause | Estimated impact | Risk level | Safe fix direction |
| --- | --- | --- | --- | --- | --- |
| 1 | `app/music-feed.tsx` | Vertical `FlatList` has a very large `ListHeaderComponent` containing many sections and nested rails. Header content is not virtualized by the parent list. | Severe home scroll jank once deferred sections render. | High | Split home into virtualized section rows or a `SectionList`; keep above-the-fold header small. |
| 2 | `app/search.tsx` | Search results render inside a `ScrollView` with many mapped rows/rails rather than a single virtualized result list. | High lag for result-heavy queries. | High | Keep current visual design, but render results through a virtualized grouped list. |
| 3 | `components/HTImage.tsx` | Fast-scroll global subscription updates every mounted image when fast-scroll state changes. Dense screens may re-render many images at scroll start/end. | High tap/scroll hitch at gesture boundaries. | High | Move fast-scroll transition behavior to parent/list-level context or make it non-stateful per image. |
| 4 | `app/search.tsx` | Local search ranking and result derivation run on the JS thread after debounce; external provider completion triggers another merge/render pass. | High delayed taps after typing/searching. | High | Use query result cache and defer low-priority sections until after interactions. |
| 5 | `app/music-feed.tsx` | Horizontal `ScrollView` rails with artwork cards inside parent list compete with vertical gestures and mount eagerly. | Medium-high scroll stutter and gesture contention. | High | Use horizontal `FlatList` with `initialNumToRender`, `windowSize`, and stable item layouts. |
| 6 | `components/UniversalSearchGroupedResults.tsx`, `components/catalog/NestedSongList.tsx` | Nested `FlatList` with `scrollEnabled={false}` means nested lists still mount/layout inside an outer scroll surface; virtualization benefits are limited. | Medium-high layout cost in grouped results and detail screens. | Medium | Prefer one list owner per screen; flatten rows into one list model. |
| 7 | `app/music-feed.tsx` | Home hero carousel uses `scrollToIndex({ animated: true })` from a timer. It may collide with user scroll/gesture or image loading. | Medium scroll/tap hitch every 6.5s. | Medium | Pause timer while user is scrolling or after recent touch. |
| 8 | `components/navigation/AppShell.tsx`, `components/MiniPlayer.tsx`, `components/PremiumBackground.tsx` | App shell renders premium background, mini player layer, blur nav, and children on many browse screens. Blur and animated backgrounds add GPU overdraw. | Medium on lower-end Android devices. | Medium | Keep design, but reduce offscreen/hidden work and avoid re-rendering MiniPlayer/background for unrelated child state. |
| 9 | `app/lyrics.tsx`, `app/youtube-player.tsx`, `components/PerformanceOverlay.tsx`, `utils/runtimeInstrumentation.ts` | Timers/RAF monitors exist for lyrics sync, YouTube player, perf overlay, and runtime instrumentation. Most are gated, but when enabled they consume JS budget. | Medium in dev/test builds. | Medium | Keep diagnostics disabled by default; never enable heavy/runtime instrumentation in tester builds. |
| 10 | `services/freeMusicProviders.ts` | Archive provider metadata lookups can resolve together and then enqueue a result state update, image loads, and extra result rendering. | Medium lag after provider results arrive. | Medium | Stream provider results in capped batches or delay provider rendering until local search is idle. |

## Current Dirty-Tree Red Flags

These are not proposed fixes; they are audit observations from the current working tree.

- `app/music-feed.tsx` currently appears to contain a duplicated `ListFooterComponent={` token near the main home `FlatList`. If that exact dirty file is running, this is more serious than performance: it can break compile/render entirely or create a blank/frozen screen.
- `services/freeMusicProviders.ts` currently appears to contain a duplicate `const results = dedupeResults(outcome.value).slice(0, limit);` declaration in the provider success branch. If present in the active code, this is a compile-time error rather than a heat issue.
- `app/search.tsx` has mixed line endings from prior surgical edits. That is not a runtime heat issue, but it can keep diffs noisy and should be normalized only when it will not churn the whole file.

## Files Involved

- Search: `app/search.tsx`, `services/universalSearchService.ts`, `utils/catalogSongRanking.ts`, `utils/searchRanking.ts`, `utils/searchApkParity.ts`, `services/freeMusicProviders.ts`
- Home/Explore: `app/music-feed.tsx`, `app/worlds/index.tsx`, `components/explore/WorldsExploreSection.tsx`, `services/smartDiscovery.ts`, `utils/discoveryPreferences.ts`
- Artwork/images: `components/HTImage.tsx`, `utils/imagePreloader.ts`, `utils/artwork.ts`
- Lists/scrolling: `app/music-feed.tsx`, `app/search.tsx`, `components/UniversalSearchGroupedResults.tsx`, `components/catalog/NestedSongList.tsx`, entity screens using `FlatList`
- Startup/background: `app/_layout.tsx`, `app/index.tsx`, `services/startupCoordinator.ts`, `utils/startupScheduler.ts`, `services/onboardingPrewarm.ts`
- Diagnostics/persistence: `utils/devDiagnostics.ts`, `utils/runtimeInstrumentation.ts`, `utils/performanceLogs.ts`, `components/PerformanceOverlay.tsx`, `services/catalogViewPersistence.ts`, `services/hiddenTunesApi.ts`

## Safe Fixes Only

1. Cache search/index work by catalog fingerprint and normalized query.
2. Move lyric search to a delayed/secondary pass or smaller mobile cap.
3. Convert home horizontal `ScrollView` rails to horizontal `FlatList` without changing card design.
4. Flatten search result sections into one virtualized list model.
5. Cache home mood/open-room sections by catalog fingerprint and preference signature.
6. Stop per-image fast-scroll subscriptions; use list-level transition flags or simply disable image transitions while scrolling without forcing state into each image.
7. Cap Archive metadata fanout and cache free-provider query results.
8. Pause hero carousel during user scroll and while home is not visibly focused.
9. Keep heavy/runtime diagnostics disabled in non-dev and tester builds.
10. Batch AsyncStorage writes that are not needed for immediate UI feedback.

## Risky Fixes To Avoid

1. Do not touch HiddenAudio, playback engine ownership, queue playback, lockscreen, or background playback as part of scroll/heat work.
2. Do not remove artwork globally; users will perceive that as a premium UI regression.
3. Do not replace the whole search screen or home design in one rewrite.
4. Do not disable catalog hydration entirely; it would cause empty states and broken discovery.
5. Do not run external provider searches on every keystroke without debounce and cancellation.
6. Do not prefetch all artwork in the catalog.
7. Do not increase FlatList window sizes to hide blanking; that usually increases memory/heat.
8. Do not enable runtime instrumentation or perf overlays in production/tester builds.
9. Do not mix performance fixes with Android Auto/CarPlay/playback native changes.
10. Do not fix line endings by converting large tracked CRLF files unless the diff is intentionally isolated.

## Priority Recommendation

The safest first pass is:

1. Fix current dirty-tree compile red flags separately if they are real.
2. Virtualize search results and home rails without visual redesign.
3. Cache catalog-derived home/search sections by fingerprint.
4. Reduce HTImage per-cell state/subscription work.
5. Cap/stagger free provider metadata fanout.

These target browsing heat and smoothness while avoiding playback and premium UI risk.
