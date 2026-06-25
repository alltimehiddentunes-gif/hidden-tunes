# Performance Stress Audit

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`  
Scope: Podcast + Radio discovery (no feature removal)

## Method

Static code audit + instrumentation review (`[HTDiscoveryPerf]`, `performanceMode`, request manager). Device stress protocol documented for manual QA (20-minute aggressive session).

---

## Top 10 Bottlenecks (Ranked)

| # | Bottleneck | Impact | Status |
|---|------------|--------|--------|
| 1 | Home hub loaded all rails in one session (featured→trending→popular→recent→recommended) | JS thread + network burst on open | **Fixed** — progressive rails (priority 2, idle + scroll) |
| 2 | No global discovery concurrency cap | Duplicate parallel fetches across lanes | **Fixed** — `discoveryRequestManager` max 2 active |
| 3 | Mature podcast fetches not aborted on cancel/unmount | Wasted bandwidth + stale merges | **Fixed** — AbortController + signal on `fetchPodcastShows` |
| 4 | Full-screen loading gate blocked categories/search | Perceived freeze | **Fixed** — categories render immediately; footer spinner for deferred rails |
| 5 | List artwork decoded at full resolution | Memory + decode stalls | **Fixed** — thumbnail decode sizes on rail cards + `HTImage` maxDecode |
| 6 | Mature category quality scoring on large merged batches | CPU spikes during pagination | **Mitigated** — existing `DISCOVERY_QUALITY_RANK_CAP` (80 items) |
| 7 | AsyncStorage cache writes on every discovery page | I/O bursts | **Existing** — 1.2s debounce + 32-entry memory cap |
| 8 | RSS/iTunes fallback parsing on episode load | Show-page latency | **Existing** — cache-first episodes + inflight dedup |
| 9 | Rapid navigation double-tap stacking | Navigation jank | **Mitigated** — `safeRouterPush` 280ms keyed guard |
| 10 | Radio Browser multi-mirror failover per query | Network amplification | **Existing** — mature radio timeout/abort; standard radio cache-first |

---

## Fixes Applied

### Request management (`utils/discoveryRequestManager.ts`)

- Screen-scoped controller with generation bump on unmount
- Latest request wins per label
- Max **2** concurrent discovery requests (`MAX_PARALLEL_DISCOVERY_REQUESTS`)
- AbortController per in-flight label
- Integrated with `[HTDiscoveryPerf]` timing

### Progressive discovery loading

- `usePodcastHomeDiscovery` / `useRadioHomeDiscovery`:
  - Priority rails: featured + trending (first paint path)
  - Deferred: popular + recent via idle timer + scroll (`loadMoreRails`)
  - Recommended computed locally (no extra network)
  - Categories/emotional/mature tiles: synchronous (zero network)

### Render performance

- Podcast home: FlatList virtualization settings retained; fast-scroll marking on drag
- Rail cards: memoized components (existing)
- Stations home: scroll-triggered rail expansion; inline loader only when featured empty

### Image optimization

- `HTImage`: optional `maxDecodeWidth` / `maxDecodeHeight`
- Podcast/radio rail cards: `width: 148, height: 96` decode hints
- List rows: 2× display size decode cap on show art

### Mature podcast abort parity

- `maturePodcastDiscovery.ts`: AbortController map aligned with mature radio
- `fetchPodcastShows` / iTunes search: optional `signal` support

### Navigation

- `safeRouterPush`: 280ms duplicate-route guard (down from 360ms)
- Navigation never awaits network (unchanged — fetch after route)

### Playback (verified, not modified)

- Radio: `routeRadioPlayback` → immediate `playSong` with stream URL
- Podcast: `routePodcastPlayback` → immediate `playQueue` when HTTPS audio present
- No HiddenAudio / PlayerContext changes

---

## Before / After Estimates

| Metric | Before | After |
|--------|--------|-------|
| Home open parallel discovery requests | Up to 4–5 sequential bursts | Max 2 concurrent; 2 priority then idle |
| First interactive paint (podcast home) | Blocked on featured fetch | Header + search + categories immediate |
| Rail fetch on open | featured + trending + popular + recent | featured + trending; rest on idle/scroll |
| Mature podcast cancel | Generation only | Abort + generation |
| List image decode | Full URL resolution | Downscaled thumbnails |

---

## Memory Findings

| Area | Finding | Mitigation |
|------|---------|------------|
| `showStoreRef` / `stationStoreRef` | Grows with browsed shows | Bounded by user session; cleared on settings change |
| `imageSourceCache` (HTImage) | 240 URI cap | LRU eviction (existing) |
| Podcast/radio memory cache | 32 entries TTL 12h | Existing trim |
| AbortController maps | Per-request | Cleared on complete/cancel |
| Hook timers | Idle rail timers | Cleared on unmount |

---

## Device Stress Test Protocol (Manual)

Run 20 minutes on physical device:

1. Alternate Podcasts ↔ Radio every 30s
2. Search `love`, `ghana`, `jazz` repeatedly
3. Open 10 mature categories with consent on
4. Background/foreground 5×
5. Rapid-tap 20 show/station cards

**Watch:** `[HTDiscoveryPerf]` request counts, active requests ≤ 2, no crash, no sustained frame drops.

---

## Remaining Risks

1. **HT podcast API 404** — iTunes/RSS fallback adds latency on cold cache
2. **RSS XML parse** — synchronous on JS thread for episode pages (mitigated by cache)
3. **Mature quality scoring** — still CPU-heavy on 80-item batches (acceptable with cap)
4. **Radio Browser failover** — up to 3 mirrors per query when primary fails
5. **No native FPS sampler in dev** — rely on manual feel + diagnostics logs

---

## Files Changed

- `constants/discoveryPerformanceBudget.ts`
- `utils/discoveryRequestManager.ts` (new)
- `hooks/usePodcastHomeDiscovery.ts`
- `hooks/useRadioHomeDiscovery.ts`
- `app/podcasts/index.tsx`
- `app/stations/index.tsx`
- `services/mature/maturePodcastDiscovery.ts`
- `services/podcastCatalogApi.ts`
- `services/podcast/podcastItunesRssSource.ts`
- `utils/safeNavigation.ts`
- `components/HTImage.tsx`
- `components/podcast/PodcastDiscoveryCards.tsx`
- `components/radio/RadioBrowserCards.tsx`

---

## Validation

```bash
npm run typecheck
git diff --check
```
