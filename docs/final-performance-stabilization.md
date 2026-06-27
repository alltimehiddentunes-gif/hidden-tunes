# Final Performance Stabilization

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22  
**Scope:** Stabilization only — no features, no mature expansion, no playback/queue/CarPlay/Android Auto/Desktop changes.

---

## Root causes

| Symptom | Root cause |
|---------|------------|
| Phone heating during search | Podcast/radio media fetches started too early; external provider search ran even when internal catalog already had hits; multi-query podcast search ladder uncapped |
| Lag page-to-page | Home screens mounted all rails at once inside `ScrollView`; 3 parallel home lane API calls on every podcast/radio open |
| Slow taps / duplicate stacks | Discovery cards used raw `router.push` without dedup guards |
| Freezes on fast surf | Stale async `setState` after unmount in lazy list hooks; media search loading spinners before debounce completed |
| Heavy podcast probes | `probeCategory` pulled full 40-show pages (plus fallback) per browse tile |

---

## Fixes applied

### Search
- Centralized timing in `utils/searchPerformance.ts`
- Main search podcast/radio deferred **900ms** after submit (`useDeferredSearchMediaSections`) — no loading state until defer fires
- Radio search in main search staggered **220ms** after podcast
- Podcast home + radio search debounce **480ms**
- Backend music debounce **300ms** (music-first)
- External free-music providers **skipped** when internal catalog already has results; TV chain unblocked
- Podcast search fallback queries capped at **3** per request
- Existing `AbortController` + request generation on backend/TV search retained

### Navigation
- `safeRouterPush` wired on podcast/radio discovery screens and category screens
- `AppShell` tab guard (active tab skip + 360ms keyed guard) — already present

### Podcast / radio discovery
- Category availability probe uses **`limit: 1`** (no full-page warm, no fallback on probe)
- Mature OFF: probe short-circuits mature categories
- Home lanes: **featured first**, trending/popular after **120ms** stagger (not 3-way parallel burst)
- Category probe storms removed from home hooks (optimistic categories)
- Lazy list hooks: mounted guards on `applyPage` and post-async state

### Lists
- Podcast home browse mode: vertical **`FlatList` of sections** (virtualized, `initialNumToRender: 2`)
- Horizontal rails use `getHorizontalListPerformanceSettings`
- Category/search screens already on tuned `FlatList`

### Images
- Podcast + radio discovery artwork uses **`HTImage`** (`prefetch={false}`, disk cache, fast-scroll aware)

### Background work
- Production diagnostics remain gated (`utils/devDiagnostics.ts` — all flags `false`)
- Visible feature logs dev-only

### Safety
- Favorite button: **320ms keyed tap guard** prevents rapid toggle storms
- Generation + mounted guards on deferred media search and lazy lists

---

## Files changed

| File | Change |
|------|--------|
| `utils/searchPerformance.ts` | New shared debounce/stagger constants |
| `hooks/useDeferredSearchMediaSections.ts` | Longer defer, pause-before-loading |
| `app/search.tsx` | External skip, shared debounce constants |
| `app/podcasts/index.tsx` | FlatList sections, safeRouterPush, rail tuning |
| `app/podcasts/[categoryId].tsx` | safeRouterPush |
| `app/stations/index.tsx` | safeRouterPush, rail tuning |
| `app/stations/search.tsx` | 480ms debounce |
| `hooks/usePodcastHomeDiscovery.ts` | Staggered lane fetch |
| `hooks/useRadioHomeDiscovery.ts` | Staggered lane fetch |
| `hooks/useLazyPodcastShowList.ts` | Mounted guards |
| `hooks/useLazyRadioStationList.ts` | Mounted guards |
| `services/podcast/podcastCategoryAvailability.ts` | Lightweight probe |
| `services/podcastDiscoveryApi.ts` | Cap search fallback queries |
| `components/FavoriteButton.tsx` | Tap guard |
| `components/podcast/PodcastDiscoveryCards.tsx` | HTImage artwork |
| `components/radio/RadioBrowserCards.tsx` | HTImage artwork |

---

## Manual QA checklist

- [ ] 10 min aggressive main search — music responsive, no heat spike
- [ ] 10 min fast tab/page switching — no duplicate stacks, no freeze
- [ ] 10 min podcast browse + search — rails load progressively, episodes open
- [ ] 10 min radio browse + search — stations play
- [ ] Rapid song taps + favorite/unfavorite — no lag pile-up
- [ ] Mature ON/OFF toggle — no mature fetch when OFF
- [ ] Background/reopen — no black pages

---

## Validation

```bash
npm run typecheck
git diff --check
```

---

## Build readiness

**NO** until device QA above passes on a physical phone (heat + tap responsiveness cannot be verified from typecheck alone).
