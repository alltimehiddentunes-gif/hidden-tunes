# Phase 1 Finalization Audit

**Scope:** Premium feel and stability before any new features. No Discovery, Radio, Podcasts, or Recommendations work. Playback, queue, Desktop, CarPlay, and Android Auto unchanged.

**Goal:** Search never feels broken, results read as Hidden Tunes only, empty states always recover, scrolling stays smooth, background work stays cool, and startup stays fast.

**Audit date:** 2026-06-14

---

## Executive summary

| Priority | Status | Outcome |
|----------|--------|---------|
| 1. Search reliability | **Fixed (this queue + prior)** | Waterfall continues on provider failure; timeouts bounded; local catalog fallback on API timeout/error |
| 2. Search result merging | **Fixed** | Unified branding layer; grouped UI shows Songs / Artists / Albums / Playlists — not provider names |
| 3. Empty state elimination | **Fixed (this queue)** | Premium empty state replaces dead-end “No results” with related searches, trending, genres, artists, suggested songs |
| 4. Smoothness | **Fixed (prior queues)** | Memo rows, HTImage slot sizing, list perf props; Home nested lists still deferred |
| 5. Heat reduction | **Fixed (prior queues)** | Debounced persists, catalog dedup, capped caches, throttled remote media sync |
| 6. Startup speed | **Fixed (prior queues)** | Onboarding preload, single hydrate, idle API refresh when cache warm |

**Validation (2026-06-14):**

```bash
npm run lint          # 0 errors (36 pre-existing warnings)
npm run typecheck     # pass
npx expo config --type introspect --json  # pass
```

---

## 1. Search reliability

### Sources audited

| Source | Path | Timeout | Failure behavior | User-visible label |
|--------|------|---------|------------------|-------------------|
| Hidden Tunes catalog (API) | `hiddenTunesApi.ts` → `searchHiddenTunesSongsPage` | 12s race | Falls back to local ranked snapshot | Hidden Tunes |
| Hidden Tunes catalog (local) | `getHiddenTunesCatalogSnapshot` + `rankCatalogSongs` | Instant | Always available when cache hydrated | Hidden Tunes |
| Audius | `fetchAudiusSearchTracks` | 7s | Returns `[]`; waterfall continues | Hidden Tunes (internal `audius`) |
| Internet Archive | `archiveSearch.ts` | 8s search / 5s metadata | Returns `[]`; waterfall continues | Hidden Tunes (internal `archive`) |
| Backend providers (YouTube) | `searchYouTubeBackend` | — | **Disabled** — not in waterfall | N/A |

### Issues found

1. **Unbounded Archive metadata fan-out** — Each search row could trigger parallel metadata fetches with no concurrency cap → slow searches and heat.
2. **No fetch timeouts** — Audius and Archive could hang until OS socket timeout → search spinner felt broken.
3. **Hidden Tunes API slow/fail → empty flat list** — Network errors cleared results instead of local catalog fallback.
4. **Sequential fallback latency** — Audius then Archive added wall-clock time when HT results were sparse.
5. **Duplicate rows** — Same title/artist from HT + Audius + Archive could appear twice without dedupe priority.

### Fixes applied

| File | Change |
|------|--------|
| `utils/fetchWithTimeout.ts` | **New** — Abortable fetch with `FetchTimeoutError` |
| `services/searchWaterfall.ts` | HT 12s timeout + local rank fallback; Audius 7s; parallel `Promise.allSettled` fallback; `dedupeWaterfallTracks` prefers HT > Audius > Archive |
| `services/archiveSearch.ts` | Timeouts; concurrency limit (3); reduced to 8 rows |
| `services/unifiedSearchResults.ts` | **New** — `buildLocalCatalogSearchFallback`, `mergeUnifiedSongResults`, shared `HIDDEN_TUNES_SEARCH_LABEL` |
| `app/(tabs)/search.tsx` | After waterfall, merge local catalog if network empty; catch block uses catalog fallback instead of `setResults([])` |

### Remaining search risks (non-blockers)

- Render cold start on free tier (~2–5s) still delays first HT API page; local instant search masks this once cache is warm.
- Archive quality varies; supplement only when HT `< 2` playable tracks (`WATERFALL_MIN_SONGS`).
- Grouped **playlists** depend on local/user data — not network waterfall.

---

## 2. Search result merging (unified layer)

### Issues found

1. Provider strings (`Audius`, `Internet Archive`, `Free music`) previously leaked in row subtitles and filters.
2. Filter chips exposed provider names instead of product surfaces.
3. Branding logic lived inline in waterfall — no single place for unified presentation rules.

### Fixes applied (cumulative)

| Layer | Behavior |
|-------|----------|
| `services/unifiedSearchResults.ts` | All tracks get `sourceName: "Hidden Tunes"`; internal `source` retained for dedupe/play only |
| `services/searchWaterfall.ts` | Every provider path calls `brandUnifiedSearchTrack` |
| `app/(tabs)/search.tsx` | Filter chips: **Catalog / All / TV** only; grouped results via `UniversalSearchGroupedResults` → **Songs, Artists, Albums**, genre moods |
| `docs/search-provider-branding-audit.md` | Prior audit — provider labels removed from UI |

### User sees

- **Songs** — flat + grouped main list
- **Artists** — grouped section + popular artists in empty state
- **Albums** — grouped section
- **Playlists** — user/smart playlists in grouped path

### Not shown

- Audius / Archive / YouTube / “legal source” labels
- Provider filter chips

---

## 3. Empty state elimination

### Issues found

1. **“No results for …”** dead-end after failed or sparse waterfall.
2. Trending chips alone — no genres, artists, or playable suggestions.
3. Catch path could leave flat list empty while cloud discovery data was already loaded.

### Fixes applied (this queue)

**`app/(tabs)/search.tsx` — `renderPremiumSearchEmpty`:**

| Section | Source |
|---------|--------|
| Related searches | Recent search history (up to 4) |
| Trending moods | `TRENDING_SEARCHES` chips |
| Browse genres | Query-matched genres or `HIDDEN_TUNES_GENRES` |
| Popular artists | `cloudArtists` (up to 6) |
| Suggested songs | `cloudSongs` (up to 6) — tappable rows |

Copy changes:

- Title: **“Explore more Hidden Tunes”** (not “No results”)
- Subtitle: `TESTER_COPY.searchNoMatch` or progressive loading copy
- Short-query state: **“Keep typing to search”**

Network empty + catalog fallback ensures grouped/flat paths still have rows when local cache matches.

### Remaining gaps

- Empty **genre hub** pages (content ops — see Phase 7) still thin; search empty state routes users to genres but hub may have few tracks.
- **TV chip** routes to `/tv` — separate surface; not part of music empty recovery.

---

## 4. Smoothness (FlatLists, images, re-renders)

Audited via `docs/artwork-scroll-audit.md`, `docs/ui-responsiveness-tap-audit.md`.

### Issues found

| Issue | Impact |
|-------|--------|
| Full-res Audius artwork in list slots | Jank + memory on scroll |
| Unstable `{ uri }` for `HTImage` | Flicker / reload |
| `key={trackKey}` on player artwork | Forced remount each track |
| Inline Library renderItem | Extra re-renders |
| Nested horizontal FlatLists on Home | Scroll contention |

### Fixes applied

- `musicNormalizer.ts` — prefer smaller artwork tiers
- `HTImage.tsx` — slot-aware sizing + fast-scroll deferral
- `search.tsx` — memo `SearchCatalogSongPressableRow`, stable sources
- `favorites.tsx`, `playlists.tsx` — memo rows + list perf props
- `MiniPlayer.tsx` / `player.tsx` — removed artwork remount keys
- Tap feedback — `Pressable` ripples / opacity on search catalog rows

### Deferred (higher scope, not launch blockers)

- Home nested horizontal lists → ScrollView + memo cards
- Explore full vertical virtualization restructure
- Narrow `useTrackPlaybackStatus` subscriptions

**Target:** Near Spotify-level on Search, Library favorites, playlists; Home hero scroll still good but not fully virtualized.

---

## 5. Heat reduction

Audited via `docs/heat-diagnostics-audit.md`, `docs/memory-battery-safety-audit.md`, `docs/catalog-fetch-cache-audit.md`.

### Issues found

| Source | Risk |
|--------|------|
| PlayerContext ungated `console.log` | Console I/O on hot paths |
| Position persist every ~12s | AsyncStorage writes during playback |
| Queue persist on every index change | Burst writes on skip |
| Remote media sync on every position tick | Native bridge churn |
| Search history + results cache immediate disk write | Disk on every keystroke/search |
| Redundant catalog hydrates (Home/Explore/Search/Library) | Network + JSON parse |
| Unbounded image preload Set | Memory growth |

### Fixes applied

- Debounced playback position (900ms) + queue persist (600ms); widened save interval
- Throttled lock-screen position sync (5s); immediate on song/play change
- Dev-gated PlayerContext logs
- Catalog in-flight dedup, secondary section coalescing, skip storage hydrate when memory warm
- Debounced search history + search results AsyncStorage (1.5s)
- Capped screen catalog arrays (240), image preload (512), unified view cache (28)
- Search mounted guards + cancelled fuzzy `InteractionManager` on blur

### Intentionally unchanged (playback-critical)

- HiddenAudio finish poll
- RNTP progress interval
- Lock-screen command handlers

---

## 6. Startup speed

Audited via `docs/startup-first-paint-audit.md`, `docs/launch-stability-audit.md`.

### Issues found

- Onboarding AsyncStorage read blocked first route
- Duplicate catalog hydrate (tab shell + root)
- Home catalog load deferred via `InteractionManager` even when memory snapshot existed
- API refresh at fixed 720ms even on cache hit

### Fixes applied

- `preloadOnboardingStatus()` + instant redirect when cache says complete
- Single `afterPaint` catalog hydrate in `_layout.tsx`
- Home immediate load when memory snapshot exists
- API refresh on `idle` when cache hit, `background` when miss
- RNTP prewarm moved to `deferred` phase

### Not measured in CI (manual baseline)

| Metric | Expected after fixes |
|--------|----------------------|
| Cold launch (first install) | Onboarding gate + one hydrate; Home paints after coordinator `afterPaint` |
| Warm launch | Memory snapshot → Home content without waiting for InteractionManager |
| Search first open | Cloud discovery + catalog snapshot already warm from tab shell |

---

## Fixes applied — file index (Phase 1 cumulative)

### This queue (2026-06-14)

| File | Role |
|------|------|
| `utils/fetchWithTimeout.ts` | Shared timeout fetch |
| `services/unifiedSearchResults.ts` | Unified branding + local fallback merge |
| `services/searchWaterfall.ts` | Timeouts, parallel fallback, HT local fallback |
| `services/archiveSearch.ts` | Timeouts, concurrency, row cap |
| `app/(tabs)/search.tsx` | Catalog fallback on empty/error; premium empty sections; style fixes |

### Prior fixing queues (referenced)

| Doc | Focus |
|-----|-------|
| `search-flow-audit.md` | Waterfall order, archive re-enable, filter routing |
| `search-provider-branding-audit.md` | Hidden Tunes-only labels |
| `catalog-fetch-cache-audit.md` | Dedup, stale-while-revalidate |
| `memory-battery-safety-audit.md` | Caps, mounted guards, debounced caches |
| `heat-diagnostics-audit.md` | PlayerContext + remote media throttles |
| `startup-first-paint-audit.md` | Onboarding + hydrate coordination |
| `artwork-scroll-audit.md` | HTImage + list perf |
| `ui-responsiveness-tap-audit.md` | Tap feedback |
| `launch-stability-audit.md` | Crash/stability paths |

---

## Remaining launch blockers

These are **content / product** gaps, not regressions from Phase 1 stability work. See `docs/phase-7-launch-content-strategy-audit.md` for detail.

| Blocker | Severity | Notes |
|---------|----------|-------|
| **Podcasts: 0 shows** | **High (if four-pillar promise)** | No surface built; hide tab or ship “coming soon” |
| **TV catalog: ~40 videos** | Medium | TV lane feels thin; search TV chip OK but browse limited |
| **Genre depth uneven** | Medium | ~7 launch genres near-empty playable depth; empty hubs after search recovery |
| **Client discovery cap (≤240 songs on Home/Explore)** | Low–Medium | Full ~1,245 via search/API; rails don’t show full catalog |
| **Render cold start** | Low | HT API on free tier; mitigated by local cache after first session |
| **Profile / placeholder content** | Low | Some artist/album metadata sparse |
| **Home nested list virtualization** | Low (perf) | Acceptable for launch; not Spotify-perfect on Home hero |

### Not blockers (explicitly out of Phase 1 scope)

- Discovery engine expansion
- Radio / Listening Room content seeding
- Podcast ecosystem
- Smart recommendations / YouTube related engine
- Backend artist-only rows in grouped search UI

---

## Manual test plan

1. **Search — airplane mode after warm cache:** Query returns local ranked songs; empty state shows genres + suggested songs.
2. **Search — slow network:** Spinner shows progressive copy; Audius/Archive timeout without blank screen.
3. **Search — obscure query:** Premium empty state; no “No results” title; chips and suggested songs tappable.
4. **Search — grouped view:** Only Hidden Tunes branding; sections Songs / Artists / Albums.
5. **Scroll Search / Library / Favorites:** No artwork flicker; smooth fast scroll.
6. **Cold vs warm launch:** Second open shows Home content faster; no duplicate network storm in logs.
7. **Background playback:** Tap-to-play, lock screen, auto-next unchanged.

---

## Strategic note

Phase 1 delivers **stability and premium feel for music search and browse**. Launch readiness for **music-first** is strong (~82/100 catalog volume per Phase 7). Store submission still requires a **Podcast product decision** and content seeding for thin genres/TV if marketing promises those pillars on day one.
