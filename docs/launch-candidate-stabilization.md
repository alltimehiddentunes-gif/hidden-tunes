# Launch Candidate Stabilization

Branch: `carplay-scene-safe-test`
Scope: stabilization, optimization, validation, and launch readiness only.

## Heat Findings

| Component | Cause | Frequency evidence | Impact | Action |
| --- | --- | --- | --- | --- |
| `components/search/DebouncedSearchInput.tsx` | `latestValueRef.current = value` was assigned during render. | One render-time ref write in the shared debounced search input. | React compiler/lint flags this pattern and it adds render-phase mutation in the search box used by search surfaces. | Moved latest-value sync to input events and an effect. |
| `app/radio.tsx` | Legacy radio loader issued sequential Hidden Tunes searches and could still set state after a route change or a newer refresh. | One route-load effect called `loadRadio`; up to 8 deduped search terms run sequentially, then up to 3 YouTube fallback searches. | Stale network completions can keep JS work alive after navigation and can overwrite newer radio state. | Added a request generation guard and cleanup invalidation. |
| `app/search.tsx` | Search has debounce, request ids, aborts, bounded caches, and TV search waits until audio/backend queries settle. | Backend debounce `280ms`; external debounce `320ms`; local cache limit `24`; backend cache limit `32`; external cache limit `16`; TV limit `8`. | Search is intentionally staged so music remains priority and video remains lower priority. | No code change needed. |
| `app/music-feed.tsx` | Hero carousel uses one `setInterval`. | Grep found one interval in the home feed hero area. | Controlled animation work only while mounted; no evidence of a loop burst from static audit. | No code change. |
| `hooks/useLazyRadioStationList.ts` | Radio browser lists load pages lazily. | Generation guard, request cancellation, cache hydration, and `onEndReached` gating already exist. | Low risk of repeated fetch loops in station category/search screens. | No code change. |
| `services/radio/radioCache.ts` | Radio cache persistence is debounced. | Storage writes are debounced by `1200ms`; memory cache capped at `24` entries. | Avoids write bursts during pagination. | No code change. |
| `services/podcastDiscoveryApi.ts` | Podcast category/search/show calls are inflight-deduped and cache-first. | Inflight maps exist for shows, search, and episodes; prefetch functions are intentionally disabled. | No startup podcast fetch loop found. | No code change. |

## Startup Findings

Startup is intentionally staged:

- `app/_layout.tsx` mounts the root stack, hides splash, and starts runtime instrumentation only in `__DEV__`.
- `app/index.tsx` schedules onboarding routing after paint instead of doing it synchronously before first render.
- `services/startupCoordinator.ts` schedules catalog memory hydration after paint, persisted catalog view hydration after interactions, and one genre prewarm at idle (`5000ms`).
- `utils/startupScheduler.ts` dedupes task names globally, so repeated mounts do not schedule duplicate startup tasks.
- `services/hiddenTunesApi.ts` keeps memory cache, storage hydration promise, first-page coordination, background-refresh cooldown, and fetch timeout.

Perceived startup should be acceptable because the splash/brand screen can paint before catalog hydration. The remaining risk is that `PlayerProvider` and `RemoteMediaControlsBridge` still mount for normal routes, but this phase explicitly avoided playback architecture.

## Search Findings

Verified from source:

- Music search remains priority: local/backend catalog results feed `internalSearchResults` before external audio and TV results.
- Backend search uses `AbortController`, request ids, debounce, and bounded cache.
- External audio waits for at least 2 characters and is lower priority than internal/backend results.
- TV/video search waits until backend and external search are no longer pending.
- Search cards use user-facing display metadata helpers for song/radio/video subtitles.
- No direct raw video URLs/provider debug text found in the search render path audited here.

Safe fix applied:

- Removed render-phase mutation from the shared debounced input path.

## Radio Findings

Verified from source:

- Station categories are static and include country, gospel, afrobeats, jazz, classical, news, global, mood, location, relationship, faith, and focus.
- Category station lists use `useLazyRadioStationList`, which hydrates cache first, cancels stale category/search requests, and guards by request generation.
- Pagination is lazy through `onEndReached`; no app-start station fetch found.
- Empty station categories show an in-app fallback to a listening room, so category pages should not be dead ends.

Safe fix applied:

- `app/radio.tsx` now ignores stale async completions after route changes or manual refreshes.

Remaining risk:

- The older `app/radio.tsx` route still performs multiple sequential music searches before fallback video discovery. This is acceptable for launch if used as a listening-room route, but it is heavier than the newer live-station browser.

## Podcast Findings

Verified from source:

- Podcast home renders static launch categories without startup network fetch.
- Search is debounced by `300ms`, checks memory/storage cache before network, and uses request ids.
- Category screens read cached shows first, hydrate persisted cache, then fetch only when needed.
- Podcast API helpers dedupe shows/episodes and keep inflight promises per category/search/show.
- Prefetch functions are intentionally disabled, preventing background podcast fetch loops.

Remaining risk:

- Mature podcast category is currently visible as a normal category. See Mature Content Findings.

## Emotional Worlds Findings

Verified from source:

- `app/worlds/index.tsx` fetches or reuses the Hidden Tunes catalog once on mount, then builds rooms through memoized derived groups.
- `state/useWorldCatalogTracks.ts` uses `loadHydratedCatalogOnce()` with a cancellation guard.
- `state/catalogFetchLayer.ts` dedupes concurrent catalog hydration and avoids redundant hydration when catalog signatures match.
- Recommendation containers are derived from catalog snapshots; no repeated world polling loop found.

Remaining risk:

- Worlds still derive many rails from the full catalog on first load. Memoization is present, but large catalogs can still make first Worlds visit heavier than Home/Search.

## Mature Content Findings

Launch requirement:

- Default OFF.
- When OFF, no mature radio, mature podcasts, or mature search results.
- When ON, consent required, mature content accessible, and 18+ badges visible.

Evidence found:

- `utils/launchPodcastCategories.ts` defines `adult-conversations`.
- Grep for `mature`, `18+`, `adult`, `explicit`, and `consent` found no consent state, default-off setting, or mature-content filter in app/search/radio/podcast discovery.

Verdict:

- Mature content is not launch-ready. The app has a mature-adjacent podcast category, but no proven default-off gate, consent step, 18+ badge path, or search/radio/podcast filtering control. This was not fixed because adding a consent/filtering system would be feature work beyond this stabilization phase.

## Performance Findings

Scroll/performance safeguards already present:

- Large lists use `getListPerformanceSettings` with lower initial render counts, smaller batch sizes, and `removeClippedSubviews`.
- Radio station and podcast category lists use stable key extractors and memoized row renderers.
- Search uses staged/debounced network work and bounded caches.
- Runtime instrumentation exists but is disabled unless diagnostics are enabled.

Potential performance risks:

- Home contains many horizontal rails and one hero interval; no repeated fetch loop was found in static audit.
- Worlds creates several derived rails from catalog data; memoization reduces repeated work after catalog load.
- Legacy `app/radio.tsx` does several sequential searches; stale-result guard now prevents offscreen state churn.

## Build Readiness

Android:

- `eas.json` has `production` profile using `app-bundle`.
- Android package is `com.hiddentunes.app`.
- Version code is configured in `app.json`.
- Icon/adaptive icon paths exist.
- Permissions are playback/notifications oriented, with `RECORD_AUDIO` blocked.

iOS:

- Bundle identifier is `com.hiddentunes.app`.
- Build number is configured.
- Background audio mode is present.
- TestFlight-compatible EAS profiles exist for preview/production path, though production iOS profile is not explicitly customized.

Shared:

- Splash plugin is injected by `app.config.js`.
- Standalone builds remove `expo-dev-client` and add the standalone guard plugin.
- App icon, logo, and splash assets exist.

## Remaining Blockers

1. Mature content gating is not launch-ready: no default-off gate, consent state, 18+ badge path, or filtering path was found.
2. Full lint is known to fail on pre-existing React compiler/hook lint issues outside this change set.
3. Manual runtime QA still needs a device/simulator pass for app opens, music, radio, podcasts, videos, Worlds, Search, and mature-content behavior.

## Launch Readiness Verdict

Fast: mostly yes for startup and search, with lazy/deferred work already in place.

Premium: yes, based on existing premium UI preservation and no visual changes in this phase.

Stable: improved for search input and legacy radio route; still blocked by mature-content gating.

Polished: close, but not launch-candidate ready until mature content is either fully gated or removed from normal discovery for launch.

## Validation Addendum

- `npm run typecheck`: passed.
- `git diff --check`: passed.
- `npx expo-doctor`: failed 2 of 21 checks.
  - Direct dependency `@react-navigation/native` is installed alongside `expo-router`; Expo Doctor reports this is incompatible with SDK 56.
  - Ten Expo SDK 56 packages are below expected patch versions: `expo`, `expo-clipboard`, `expo-constants`, `expo-dev-client`, `expo-file-system`, `expo-font`, `expo-image`, `expo-linking`, `expo-router`, and `expo-symbols`.

Updated launch verdict: not launch-candidate ready until mature-content gating is proven and Expo Doctor is clean.
