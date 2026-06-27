# Root Cause Performance Report

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`  
Type: **Investigation only** (not an optimization pass)  
Builds reviewed: `a25054e` (perf optimize), `cc7a123` (podcast routing)

---

## Executive Summary

User-reported symptoms (phone heating, freezes during aggressive navigation, occasional crashes, podcast/radio less responsive than music) are **consistent with traced runtime behavior in code**. The recent performance commit (`a25054e`) improved structure but **several guards are partial or bypassed**. The largest confirmed root causes are:

1. **Hidden multi-fetch chains** inside a single “rail” load (`loadPodcastHomeLaneWithFallback` — up to 9 sequential category fetches).
2. **Mandatory HT API 404 + iTunes fallback** on every `fetchPodcastShows` call (2 network round-trips minimum).
3. **Full RSS download + synchronous regex parse on the JS thread** for every podcast show page (`fetchItunesPodcastEpisodes`).
4. **Request manager scope too narrow** — cap/cancel only on podcast/radio *home* hooks; category, search, mature hub, and episodes bypass it.
5. **AbortSignal created but never passed to fetch** in home rail loader — cancellation drops results but does not stop network/CPU work.

**Measurement status:** All runtime probes are **disabled by default** (`ENABLE_DISCOVERY_PERF_DIAGNOSTICS`, `ENABLE_HEAVY_PERF_DIAGNOSTICS`, `ENABLE_RUNTIME_INSTRUMENTATION` = `false`). No live device metrics were captured in this investigation. Findings below are from **code-path proof**, not guesses.

**Verdict: NOT READY FOR TESTFLIGHT** until device-instrumented session confirms fixes for the identified root causes.

---

## Phase 1 — Measurement Infrastructure

### What exists (but is OFF)

| Collector | File | Metrics | Enabled? |
|-----------|------|---------|----------|
| `[HTDiscoveryPerf]` | `utils/discoveryPerformanceDiagnostics.ts` | active requests, cancel count, slow sections, render bursts | `ENABLE_DISCOVERY_PERF_DIAGNOSTICS = false` |
| `[HiddenTunes:runtime]` | `utils/runtimeInstrumentation.ts` | JS stalls >100ms, screen renders, prefetch, listeners | `ENABLE_RUNTIME_INSTRUMENTATION = false` |
| Render probes | `utils/renderDiagnostics.ts` | slow render, list mount timing | `ENABLE_HEAVY_PERF_DIAGNOSTICS = false` |
| `[HTPodcastRuntime]` | `utils/podcastRuntimeDiagnostics.ts` | podcast batch URLs/counts | `ENABLE_PODCAST_RUNTIME_DIAGNOSTICS = true` (dev only) |
| Radio ring buffer | `utils/radioDiscoveryDiagnostics.ts` | fetch labels | heavy perf flag only |
| `getActiveDiscoveryRequestCount()` | `utils/discoveryRequestManager.ts` | global concurrent discovery slots | always available, **not logged** |

### What is NOT instrumented (gaps)

- Per-screen active HTTP request count (only global slot counter)
- Aborted vs completed fetch ratio at HTTP layer
- RSS XML byte size and parse duration
- Image decode timing (only artwork failure counter in `performanceLogs.ts`)
- Memory growth per screen (no heap sampler wired)
- Crash → last screen / last request correlation

### How to collect real measurements (device, dev build)

```ts
// utils/devDiagnostics.ts — dev build only
ENABLE_DISCOVERY_PERF_DIAGNOSTICS = true;
ENABLE_HEAVY_PERF_DIAGNOSTICS = true;
ENABLE_RUNTIME_INSTRUMENTATION = true;
```

Run 20-minute scenario from `docs/performance-stress-audit.md` with Metro attached. Watch:

- `[HTDiscoveryPerf] request_start` / `request_end` / `request_cancelled`
- `[HiddenTunes:runtime] js_stall` (>100ms)
- `[HTPodcastRuntime] home_batch` / `show_episodes`

---

## Phase 2 — Top 10 Runtime Costs (Code-Proven)

| Rank | Cost | File / Function | Why expensive | How often | Impact |
|------|------|-----------------|---------------|-----------|--------|
| **1** | HT 404 + iTunes fallback | `services/podcastCatalogApi.ts` → `fetchPodcastShows` | Every show list call awaits dead HT API, then iTunes search JSON | **Every** podcast category/search/rail/mature fetch | 2× network latency + radio CPU; sustained browsing = heat |
| **2** | Home lane fallback chain | `services/podcast/podcastHomeLanes.ts` → `loadPodcastHomeLaneWithFallback` | Sequential loop over up to **9** category IDs until shows found | Each featured/trending/popular rail on cold cache | Up to **9 × rank #1** inside one `controller.run()` |
| **3** | Full RSS parse on JS thread | `services/podcast/podcastItunesRssSource.ts` → `fetchItunesPodcastEpisodes` | `response.text()` entire feed + `parseRssItems` regex over full XML | Every show page open (iTunes shows) | **Freeze** risk on large feeds; memory spike |
| **4** | Quality scoring pipeline | `services/podcastDiscoveryApi.ts` → `curateShowsForCategory` + `matureQualityFilters.ts` | `enrichShowWithQuality`, regex spam checks, sort per show | Every category/mature page batch (up to 80 items) | JS thread blocks 50–200ms+ per batch |
| **5** | Radio Browser failover | `services/radio/radioBrowserApi.ts` → `fetchRadioBrowserJson` | Up to **3 servers** × 12s timeout per path | Every radio category/search fetch on failure | Network + CPU under bad connectivity |
| **6** | Mature hub sequential lanes | `hooks/useMaturePodcastHubDiscovery.ts` | 5 lanes × `fetchPodcastShows` + `setLaneShows` full state replace | Mature hub open | 5 network + **5 full hub re-renders**; **no request manager** |
| **7** | Auto idle rail expansion | `hooks/usePodcastHomeDiscovery.ts` / `useRadioHomeDiscovery.ts` | `setTimeout(400ms)` → `loadMoreRails()` until all rails loaded | **Automatic** after home open without user scroll | Background churn → heat |
| **8** | Recommended recompute + cache write | `rememberRecommendedPodcastLane` + `writeCachedPodcastShows` | Scoring + AsyncStorage debounced write after **each** rail | 4× per home session | Extra JS + I/O per rail |
| **9** | Episode fetch not aborted | `hooks/useLazyPodcastEpisodeList.ts` | `cancelled` flag only; RSS fetch has no `AbortSignal` | Rapid show open/back navigation | Stale work continues → heat + freeze |
| **10** | `toLaneItems` on every render | `hooks/usePodcastHomeDiscovery.ts` return | New array instances for 4 rails each render | Every parent re-render | Extra React reconciliation (vs music cached catalog) |

### Why music feels faster

Music discovery uses local/hydrated catalog (`catalogFetchLayer`, `unifiedCatalog`) with inflight dedup and no per-tap external RSS/XML. Podcast/radio are **network-first** with **multi-hop fallbacks** and **main-thread parsing**.

---

## Phase 3 — Verification of Recent Performance Changes

### 1. Request cancellation

| Path | Expected | Actual | Evidence |
|------|----------|--------|----------|
| Podcast home unmount | Abort in-flight | **Partial** | `controller.bumpGeneration()` on unmount (`usePodcastHomeDiscovery.ts:129-131`) aborts controllers |
| Home rail fetch | Signal stops HTTP | **NO** | `loadRail` ignores `signal` param (`usePodcastHomeDiscovery.ts:139-151`) |
| Category page | Cancel on leave | **NO** | `loadPodcastCategoryPage` has inflight dedup only; no AbortController |
| Episode RSS | Cancel on leave | **NO** | `fetchItunesPodcastEpisodes` — no signal; hook uses generation flag only |
| Mature podcast category | Abort | **YES** | `browseAbortControllers` in `maturePodcastDiscovery.ts` (added `a25054e`) |
| Mature hub lanes | Abort | **NO** | `useMaturePodcastHubDiscovery` does not use `discoveryRequestManager` |

### 2. Request cap (max 2 concurrent)

| Path | Capped? | Evidence |
|------|---------|----------|
| `discoveryRequestManager.acquireDiscoverySlot` | YES | Global `MAX_PARALLEL_DISCOVERY_REQUESTS = 2` |
| Podcast/radio home rails | YES | Wrapped in `controller.run()` |
| Inside `loadPodcastHomeLaneWithFallback` | **NO** | 9 sequential fetches count as **1 slot** |
| Category pages | **NO** | Direct `podcastDiscoveryApi` |
| Search | **NO** | Up to 2 fallback queries sequential, uncapped globally |
| Mature hub (5 lanes) | **NO** | Sequential, uncapped |
| Radio `fetchRadioBrowserJson` | **NO** | Separate from discovery manager |

### 3. Latest-request-wins

| Path | Works? | Gap |
|------|--------|-----|
| Home rail effect cleanup | Partial | `cancelled = true` but does not call `controller.bumpGeneration()` on rail effect cleanup — in-flight `run()` may still complete and call `setState` if unmount races |
| Mature hub | YES | `generationRef` checked before `setLaneShows` |
| Search debounce | YES | `PODCAST_SEARCH_DEBOUNCE_MS = 480` |

### 4. Progressive rail loading

| Expected | Actual |
|----------|--------|
| Featured first, rest on scroll/idle | Priority 2 rails on mount **YES** |
| User must scroll for more | **NO** — idle timer auto-calls `loadMoreRails()` every 400ms until all 4 rails loaded (`usePodcastHomeDiscovery.ts:208-217`) |

### 5. Thumbnail loading

| Surface | Downscaled? |
|---------|-------------|
| Podcast/radio rail cards | **YES** — `width: 148, height: 96` on `expo-image` |
| `HTImage` list show art | **YES** — `maxDecodeWidth/Height` |
| Episode row images | **NO** — full `Image` without decode hints |
| Show page header | N/A (text only) |

### 6. No category probe storms

| Surface | Probes on mount? |
|---------|------------------|
| Mature podcast hub | **NO** — `useMaturePodcastCategoryAvailability` static (`hooks/useMaturePodcastCategoryAvailability.ts:22-23`) |
| Mature radio hub | **NO** — static (`useMatureRadioCategoryAvailability.ts:7-8`) |
| `probePodcastCategoryHasShows` | **Dead path** — not called from app screens (only defined in service) |

**Conclusion:** Recent changes help home shell paint and rail art, but **do not cap total HTTP volume** or **stop JS RSS work**. Heat/freeze reports are explained by ranks #1–#3 and #7.

---

## Phase 4 — Crash Investigation (Static)

No crash logs were available in-repo. Likely causes from architecture:

| Hypothesis | Type | Screen | Trigger | Mechanism |
|------------|------|--------|---------|-----------|
| **A. RSS OOM** | JS Hermes OOM / watchdog | `/podcasts/show/[showId]` | Open popular show with large feed | Full XML string + parsed array retained; rapid open 5+ shows |
| **B. Concurrent RSS + lanes** | Memory pressure | Home → Show → Back × rapid | Aggressive navigation | Episode fetch continues after unmount; home rails still loading |
| **C. JSON parse failure** | JS exception (uncaught path) | Radio browse | Radio Browser returns non-JSON | Mitigated by try/catch in mature radio; standard path throws after 3 servers |
| **D. State update after unmount** | React warning / rare crash | Any discovery screen | Fast back during rail load | Home rail effect lacks `controller.bumpGeneration()` on cleanup |
| **E. Native audio** | Native | Playback | Less likely for *browse* heat | PlayerContext untouched; browse heat points to network/JS |

**Last request before likely crash (A):** `fetch(feedUrl)` in `fetchItunesPodcastEpisodes` → `response.text()` → `parseRssItems`.

**Last navigation before likely crash (A/B):** Rapid push `/podcasts/show/[showId]` without waiting for prior episode fetch.

---

## Phase 5 — Request Statistics (Estimated Cold Session)

*Estimates from code paths; not measured on device.*

### Open Podcasts home (cold cache, ~first 3 seconds)

| Step | HTTP calls (min–max) | Notes |
|------|----------------------|-------|
| Featured rail | 2–18 | 1–9 lane fallbacks × (HT + iTunes) |
| Trending rail | 2–18 | Same fallback chain |
| Idle → popular + recent | 2–20+ | Auto `loadMoreRails` after 400ms |
| **Session subtotal** | **6–56+** | Cap shows max **2 concurrent**, not max **total** |

### Open one podcast show (cold)

| Step | HTTP | JS work |
|------|------|---------|
| HT episodes 404 | 1 | small |
| RSS full feed | 1 | **large** — full XML parse |
| **Total** | 2+ | **High freeze risk** |

### Search `ghana` (page 1)

| Step | HTTP |
|------|------|
| Up to 2 expanded queries × (HT + iTunes) | 2–4 |

### Open Mature hub (5 lanes, consent on)

| Step | HTTP |
|------|------|
| 5 lanes × (HT + iTunes) sequential | 10+ |

### Radio home (cold, 2 priority rails)

| Step | HTTP |
|------|------|
| 2 lanes × up to 3 server mirrors | 2–6 |

---

## Phase 6 — Render Statistics (Static)

| Pattern | Location | Issue |
|---------|----------|-------|
| `setLaneShows({ ...nextLanes })` each lane | `useMaturePodcastHubDiscovery.ts:89` | Full hub tree re-render per lane (5×) |
| `recomputeRecommended` after each rail | `usePodcastHomeDiscovery.ts:190` | Extra `setRecommendedPool` + cache write |
| `toLaneItems()` in hook return | `usePodcastHomeDiscovery.ts:225-228` | New array refs every render → child memo bypass |
| `homeSections` useMemo | `app/podcasts/index.tsx:420` | Rebuilds when any rail updates — expected but frequent during load burst |
| Mature hub `homeSections` + FlatList | `app/podcasts/mature/index.tsx` | Radio + podcast sections in one list |

`renderDiagnostics` and `runtimeInstrumentation` would quantify this; both **disabled**.

---

## Phase 7 — Memory Observations (Static)

| Retained structure | Growth | Cleared? |
|--------------------|--------|----------|
| `feedUrlByShowId` Map | Per iTunes show browsed | **Never** — `podcastItunesRssSource.ts:13` |
| `showStoreRef` / `stationStoreRef` | Per show/station seen | On settings change only |
| `showsMemoryCache` / radio cache | Up to 32 keys × 40 items | TTL 12h + LRU |
| `imageSourceCache` (HTImage) | 240 URIs max | LRU eviction |
| RSS XML string (ephemeral) | Full feed size during parse | GC after parse — spike per show |

---

## P0 Fixes Implemented (2026-06-22)

The following root-cause mitigations are now in code on `carplay-scene-safe-test`:

| P0 item | Status | Implementation |
|---------|--------|----------------|
| Skip HT podcast API when known 404 | **DONE** | `constants/podcastBackendAvailability.ts` — `HT_PODCAST_API_KNOWN_UNAVAILABLE`; `fetchPodcastShows` / `fetchPodcastEpisodes` go direct to iTunes/RSS |
| Cap home lane fallback chain | **DONE** | `podcastHomeLanes.ts` — max **1 primary + 1 fallback** lane (removed 9-lane probe loop) |
| RSS abort + limited parse | **DONE** | `podcastItunesRssSource.ts` — `AbortSignal` on fetch; `parseRssItemsUpTo` stops after page-needed count; cache + clear on show unmount |
| Pass AbortSignal through discovery | **DONE** | Signal threaded: home rails → category/search/episodes API → iTunes/RSS |
| Global request manager | **DONE** | `useLazyPodcastShowList`, `useLazyPodcastEpisodeList`, `useDeferredSearchMediaSections`, mature hub (prior commit) |
| Remove auto idle rail expansion | **DONE** | Removed `DISCOVERY_DEFER_RAIL_IDLE_MS` timer from `usePodcastHomeDiscovery` and `useRadioHomeDiscovery` — extra rails load on scroll only |

**Backend blocker (documented):** `PODCAST_BACKEND_BLOCKER` in `constants/podcastBackendAvailability.ts` — HT `/api/podcasts/*` returns 404; mobile uses iTunes + RSS only.

**Re-test required:** Enable diagnostics and run 20-minute device protocol before TestFlight sign-off.

---

## Recommended Fixes (Ordered by Impact)

*Original investigation recommendations — P0 items above are implemented; P1/P2 remain for follow-up.*

### P0 — Stop the heat generators

1. ~~**Skip HT podcast API when known 404**~~ — **Implemented** (`podcastBackendAvailability.ts`).
2. ~~**Cap or remove `loadPodcastHomeLaneWithFallback` chain**~~ — **Implemented** (1+1 fallback max).
3. ~~**RSS: stream/limit parse**~~ — **Implemented** (abortable fetch, capped parse, show-unmount cache clear).
4. ~~**Pass `AbortSignal` through home `loadRail` → `fetchPodcastShows`**~~ — **Implemented**.

### P1 — Make guards global

5. ~~**Route all discovery through `discoveryRequestManager`**~~ — **Partially implemented** (category, search, episodes, mature hub, global search media).
6. ~~**Remove auto idle `loadMoreRails` timer**~~ — **Implemented**.
7. ~~**Bump controller generation on rail effect cleanup**~~ — **Implemented** (podcast/radio home).

### P2 — Reduce JS work

8. **Memoize `toLaneItems` output** in home hooks — stable refs when pool unchanged.
9. **Batch mature hub `setLaneShows`** — update once after all lanes or use incremental map without full object clone each lane.
10. **Enable diagnostics in dev CI** — fail build if home open triggers >N requests in integration test.

---

## Final Recommendation

**CONDITIONALLY READY FOR DEVICE RE-TEST**

P0 code-path fixes are implemented. Physical iPhone verification with diagnostics enabled is still required before TestFlight.

---

## Appendix — Key File Index

| Symptom | Primary files |
|---------|---------------|
| Heat (network) | `podcastCatalogApi.ts`, `podcastHomeLanes.ts`, `podcastDiscoveryApi.ts` |
| Freeze (JS) | `podcastItunesRssSource.ts` (`parseRssItems`), `matureQualityFilters.ts` |
| Freeze (nav) | `useLazyPodcastEpisodeList.ts`, `usePodcastHomeDiscovery.ts` |
| Crash (memory) | `podcastItunesRssSource.ts`, `feedUrlByShowId` |
| Partial guards | `discoveryRequestManager.ts` (only 2 consumers) |
| Diagnostics off | `utils/devDiagnostics.ts` |
