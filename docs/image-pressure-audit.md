# HT-PERF-3 Image Pressure Audit

Audit date: 2026-06-19

Scope: artwork/image pressure only. No code was changed for this audit.

## Executive Summary

The biggest likely image-related source of browsing heat and freezing is not a missing disk cache in `HTImage`; `HTImage` is memoized and uses `expo-image` with `cachePolicy="disk"`. The larger risk is eager mounting and decoding: several premium browsing screens render vertical `ScrollView` containers with many horizontal `ScrollView` rails, so every card in each mounted rail can create an `HTImage`, resolve candidates, subscribe to fast-scroll state, and prefetch/decode artwork.

Highest-risk screens:

1. `app/search.tsx`
2. `app/worlds/index.tsx`
3. `app/music-feed.tsx`
4. `app/genre.tsx`
5. Album/artist detail screens when headers include large hero artwork plus track rows

## Evidence

### HTImage Usage Density

`git grep -n HTImage -- app components` shows the heaviest files by call site count:

- `app/search.tsx`: 12
- `app/worlds/index.tsx`: 9
- `app/music-feed.tsx`: 6
- `app/genre.tsx`: 6
- `app/artist.tsx`: 4
- `app/album.tsx`, `app/album/[id].tsx`, `app/artist/[id].tsx`, `app/playlists.tsx`: 3 each

### HTImage Behavior

File: `components/HTImage.tsx`

- Uses `expo-image`.
- Exports `memo(HTImage)`, so the component itself is memoized.
- Uses `cachePolicy="disk"`.
- Builds up to `MAX_ARTWORK_CANDIDATES = 5` per image.
- Keeps a bounded `imageSourceCache` of 240 URI source objects.
- Subscribes every mounted image to `subscribeFastScrolling`.
- Prefetches each resolved URI through `Image.prefetch(uriValue)` unless fast scrolling is active.
- Uses a 220 ms transition unless fast scrolling or fallback is active.

Conclusion: `HTImage` has useful safeguards, but every mounted image still has several effects, candidate resolution, possible prefetch, fast-scroll subscription, placeholder state, fallback state, and decode work.

### Existing Cache / Preload Logic

File: `utils/artwork.ts`

- Caches artwork candidate arrays in a bounded `artworkCandidateCache` of 512.
- Tracks failed artwork URLs in a bounded set of 512.
- Normalizes only HTTPS artwork URLs.

File: `utils/imagePreloader.ts`

- Provides `preloadImages`.
- Limits preloading to `PRELOAD_MAX_IMAGES = 4`.
- Uses `PRELOAD_BATCH_SIZE = 1`.
- Skips prefetch during playback.
- Skips non-essential work when app is inactive or fast scrolling.

File: `services/onboardingPrewarm.ts`

- Calls `preloadImages` after interactions for onboarding/catalog prewarm.

Conclusion: cache policy is present. The bigger concern is duplicate visible-image prefetch/decode from many mounted `HTImage` instances, not unbounded global preloading.

## 1. Screens That Render The Most Artwork

### Search

File: `app/search.tsx`

Search has the highest number of direct `HTImage` call sites. It renders:

- Song rows
- Album rail cards
- Artist rail cards
- Genre/room cards
- Station cards
- Playlist rail cards
- External free/legal audio rows
- TV rows with YouTube thumbnail URLs
- Discovery quick picks
- Discovery artist/album rails

The main container is a vertical `ScrollView`, not a virtualized vertical list. Result sections are conditionally mounted, and several sections use horizontal `ScrollView` rails.

Impact: high. A broad query can mount many different artwork sections at once.

### Worlds / Explore

File: `app/worlds/index.tsx`

Worlds uses a vertical `ScrollView` with many horizontal `ScrollView` rails:

- Visual discovery carousel
- Continue listening
- Listening rooms
- Mood room grid
- Station rooms
- Genre spotlights
- Deep albums/deep cuts
- Creators

Impact: high. This screen is artwork-dense and mostly non-virtualized.

### Home / Music Feed

File: `app/music-feed.tsx`

Home has a virtualized outer `FlatList`, but the header contains artwork-heavy sections:

- Hero carousel
- Mood rooms
- Recently added
- Albums
- Open rooms
- Genres
- Creators

Some sections are deferred by `showDeferredHomeSections`, and the main list uses `getListPerformanceSettings`. Still, horizontal rails are plain `ScrollView` sections that eagerly mount their contents once the header is mounted.

Impact: medium-high.

### Genre

File: `app/genre.tsx`

Genre pages render a hero image, featured horizontal rails, album rail, artist rail, and track rows. The vertical track area is a `FlatList`, but the header rails use horizontal `ScrollView`.

Impact: medium-high for large genres.

### Album / Artist Detail

Files:

- `app/album.tsx`
- `app/album/[id].tsx`
- `app/artist.tsx`
- `app/artist/[id].tsx`

Detail screens combine large hero artwork with track rows. Some detail screens use tuned `FlatList` settings, which is good. Risk increases when hero artwork receives `candidates={tracks}`, because candidate resolution can inspect multiple tracks for a single hero image.

Impact: medium.

## 2. Screens That Decode The Most Artwork

Most likely decode pressure ranking:

1. `app/search.tsx`: Many result sections can mount together after one query.
2. `app/worlds/index.tsx`: Many always-present rails inside one vertical `ScrollView`.
3. `app/music-feed.tsx`: Header rails plus hero carousel, partially mitigated by deferred sections and tuned outer `FlatList`.
4. `app/genre.tsx`: Header rails plus track rows.
5. `app/artist/[id].tsx`: Hero plus album rail plus tracks.
6. `app/album/[id].tsx`: Hero plus track list.
7. `app/recently-played.tsx`: Track list artwork, but uses list performance settings.
8. `app/favorites.tsx`: Track list artwork.
9. `app/playlists.tsx`: Playlist and smart cover artwork.
10. `components/MiniPlayer.tsx`: Always visible artwork, but only a small number of mounted images.

## 3. Is HTImage Memoized?

PASS.

`components/HTImage.tsx` exports `memo(HTImage)`.

Important nuance: memoization only avoids rerendering when props are referentially stable. Many call sites pass inline objects, dynamic candidates arrays, or source objects derived during render. Those can defeat memo benefits even though `HTImage` itself is memoized.

Examples of higher-risk prop shapes:

- `app/search.tsx`: TV thumbnail source object is created inline.
- `app/genre.tsx`: hero source object is created inline.
- `app/album.tsx`, `app/album/[id].tsx`, `app/artist/[id].tsx`: hero images can receive broad `candidates={tracks}`.

## 4. Are Artwork URLs Rebuilt Every Render?

Partially yes.

Safeguards:

- `utils/artwork.ts` caches candidate arrays for object-like sources by ID/title/fallback.
- `components/HTImage.tsx` caches URI source objects in `imageSourceCache`.

Remaining risks:

- Inline `source={{ artwork: ... }}` objects create new references on each render.
- `candidates={tracks}` passes large arrays to hero images; when tracks changes or when object identity changes, candidate resolution can rerun.
- Rail `.map` calls create new `onPress` closures and can trigger child prop changes around image cards.
- `HTImage` resets `candidateIndex`, fallback state, and image-ready state when `candidates`, `source`, or `uri` identity changes.

Impact: medium-high on Search, Genre, Album, Artist, and Worlds.

## 5. Is Large Artwork Rendered Off-Screen?

Yes, in several places.

Highest confidence:

- `app/search.tsx`: vertical `ScrollView` with sections below the fold. Horizontal rails inside mounted sections can create all their images.
- `app/worlds/index.tsx`: vertical `ScrollView` with many large horizontal rails and grids.
- `app/music-feed.tsx`: outer `FlatList` virtualizes rows, but its header contains multiple horizontal rails once deferred sections are shown.
- `app/genre.tsx`: header horizontal rails can render many album/artist/featured images before the user scrolls through them.

Lower risk:

- `app/album/[id].tsx`, `app/artist/[id].tsx`, and `app/recently-played.tsx` use `FlatList` with tuning for main rows.

## 6. Are FlatList Virtualization Settings Weak?

Mixed.

Strong areas:

- `utils/performanceMode.ts` defines tuned list settings.
- `app/music-feed.tsx`, `app/album/[id].tsx`, `app/artist/[id].tsx`, `app/recently-played.tsx`, `components/catalog/NestedSongList.tsx`, and parts of `components/UniversalSearchGroupedResults.tsx` use `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, `updateCellsBatchingPeriod`, and `removeClippedSubviews`.

Weak areas:

- Search uses a vertical `ScrollView` for the whole page instead of a virtualized result list.
- Worlds uses a vertical `ScrollView` for an artwork-dense browsing surface.
- Many horizontal rails use plain horizontal `ScrollView` instead of tuned horizontal `FlatList`.
- Some `FlatList` screens such as `app/album.tsx`, `app/artist.tsx`, and `app/genre.tsx` do not consistently use all available list tuning.

## 7. Is Image Cache Policy Missing?

Mostly no.

`HTImage` uses `cachePolicy="disk"`, and most app artwork routes through `HTImage`.

Risks that remain:

- Disk cache does not prevent first decode cost.
- Disk cache does not prevent too many mounted images from competing for decode/memory.
- Prefetching can add network/decode pressure if many `HTImage` instances mount at once.
- Any raw React Native `Image` usage outside `HTImage` would not receive this policy, though the audit found core artwork surfaces mostly use `HTImage`.

## 8. Top 10 Safest Performance Wins

1. Replace horizontal `ScrollView` artwork rails with tuned horizontal `FlatList` one section at a time.
   - Safest targets: Search album/artist/playlist rails, Worlds rails, Genre header rails.
   - Keep card components and styles unchanged.

2. Add a lightweight `deferPrefetch` or `prefetch={false}` prop to `HTImage` for below-the-fold rails.
   - Visible image loading still works.
   - Avoids every mounted rail image also calling `Image.prefetch`.

3. Batch or centralize `HTImage` prefetch.
   - Use a small queue instead of each image independently prefetching.
   - Respect existing `shouldRunNonEssentialWork` and fast-scroll state.

4. Avoid inline `source={{ ... }}` objects for image props.
   - Memoize TV thumbnail source objects in Search and hero source objects in Genre.
   - Reduces `HTImage` state resets.

5. Limit broad `candidates={tracks}` on hero images.
   - Pass only the best first few artwork candidates, not whole track arrays.
   - Keep fallback behavior but reduce candidate scanning.

6. Add horizontal rail tuning where `FlatList` already exists elsewhere.
   - Reuse `getHorizontalListPerformanceSettings`.
   - Use `initialNumToRender`, `maxToRenderPerBatch`, `windowSize`, and `removeClippedSubviews`.

7. Memoize rail item components and render callbacks in Search/Worlds/Genre.
   - Keep UI identical.
   - Reduces non-image rerender churn around image cards.

8. Consider disabling transitions for small list thumbnails during fast scrolling and first result bursts.
   - `HTImage` already disables transition during fast scroll.
   - A row/rail prop could make small thumbnails transition-free by default.

9. Add stable image dimensions where any artwork style is dynamic.
   - Prevents layout recalculation and decode resizing churn.
   - Most styles already appear fixed; audit specific rail cards during implementation.

10. Add a mounted-image diagnostic counter in dev only.
   - Count mounted `HTImage` instances per screen.
   - Helps verify that virtualization changes reduce active image count.

## 9. Biggest Likely Source Of Heat/Freezing

The biggest likely source is eager artwork mounting and decoding from nested `ScrollView` rails, especially in `app/search.tsx` and `app/worlds/index.tsx`.

Why:

- Search and Worlds are visually rich and render many artwork categories on one screen.
- Vertical `ScrollView` containers do not virtualize screen sections.
- Horizontal `ScrollView` rails mount all their children in the mounted section.
- Every `HTImage` instance performs candidate resolution, state setup, fast-scroll subscription, possible prefetch, placeholder handling, and eventual decode.
- Disk caching helps repeat loads but does not remove JS work, layout work, native image decode work, or memory pressure.

## File-by-File Notes

### `components/HTImage.tsx`

Risk level: medium.

Good:

- Memoized.
- Uses `expo-image`.
- Uses disk cache.
- Uses bounded source cache.
- Disables transition during fast scrolling.
- Skips per-image prefetch while fast scrolling.

Concerns:

- Every mounted image subscribes to fast scrolling.
- Every mounted image may call `Image.prefetch`.
- Candidate resolution supports many fields and fallback paths.
- State resets are tied to prop identity for `candidates`, `source`, and `uri`.

### `app/search.tsx`

Risk level: high.

Concerns:

- Most direct `HTImage` call sites.
- Vertical `ScrollView`.
- Multiple horizontal `ScrollView` rails.
- Result sections can mount together after broad queries.
- TV thumbnail source object is built inline.

Safe fixes:

- Convert one horizontal rail at a time to tuned horizontal `FlatList`.
- Memoize inline image source objects.
- Cap visible artwork rows per section where already visually capped.
- Keep result card design unchanged.

### `app/worlds/index.tsx`

Risk level: high.

Concerns:

- Vertical `ScrollView`.
- Many artwork-heavy horizontal rails.
- Large carousel artwork plus room cards plus album/creator cards.

Safe fixes:

- Convert rails to horizontal `FlatList`.
- Defer below-the-fold sections.
- Memoize rail cards and image sources.

### `app/music-feed.tsx`

Risk level: medium-high.

Good:

- Outer `FlatList` uses `getListPerformanceSettings`.
- Deferred home sections exist.
- Hero carousel is already managed separately.

Concerns:

- Header contains many rails once deferred sections show.
- Horizontal rails are `ScrollView`.
- Hero images are large and animated/glowing.

Safe fixes:

- Keep outer `FlatList`.
- Convert header rails to horizontal `FlatList` gradually.
- Avoid prefetch for deferred/off-screen rail artwork.

### `app/genre.tsx`

Risk level: medium-high.

Concerns:

- Hero uses broad candidates.
- Header has multiple horizontal `ScrollView` rails.
- Main track list is virtualized, but header artwork can be eager.

Safe fixes:

- Tune main `FlatList` if missing full settings.
- Convert header rails to horizontal `FlatList`.
- Reduce hero candidates to a small stable set.

### `app/album/[id].tsx` and `app/artist/[id].tsx`

Risk level: medium.

Good:

- Main track lists use tuned `FlatList`.
- Artist album rail uses horizontal `FlatList` tuning.

Concerns:

- Hero image can receive `candidates={tracks}`.
- Large hero image decode happens alongside initial list render.

Safe fixes:

- Limit hero candidates.
- Ensure hero source/candidates are memoized and small.

## Risky Fixes To Avoid

- Do not replace `HTImage` globally in one large pass.
- Do not remove artwork from premium UI.
- Do not disable all caching.
- Do not disable all prefetch globally without measuring; it may hurt perceived quality on repeat screens.
- Do not change playback, queue, lockscreen, CarPlay, Android Auto, or native audio while addressing image pressure.
- Do not convert every screen to a new list abstraction at once.
- Do not change card dimensions or layout while optimizing image loading.

## Recommended Order

1. Search rails: convert one or two horizontal rails to tuned `FlatList` and verify image mount count.
2. Worlds rails: convert high-card-count rails to tuned horizontal `FlatList`.
3. Add optional `HTImage` prefetch control for off-screen/deferred rail contexts.
4. Limit hero `candidates={tracks}` to stable small candidate arrays on Genre/Album/Artist.
5. Add dev-only mounted image diagnostics to prove active image count drops.

## Validation

This was an audit-only phase. No app code was changed.
