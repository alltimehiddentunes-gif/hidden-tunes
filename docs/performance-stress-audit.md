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

---

## Physical Device Verification (2026-06-22)

### Session status

| Field | Value |
|-------|-------|
| **Executed by** | Agent (static/code review only) |
| **Physical iPhone session** | **NOT RUN** — no device attached to this environment |
| **Build under test** | `carplay-scene-safe-test` @ `a25054e` + `0329fc6` (perf optimize + audit doc) |
| **Prior iOS IPA** | `1.0.122` (EAS build from earlier session — not re-tested here) |
| **Duration** | 0 min (required: 20 min continuous) |
| **Device model** | N/A |
| **iOS version** | N/A |

### Required scenario (not executed)

The following 20-minute continuous session was **not performed** on a physical iPhone in this environment:

1. Open Home
2. Browse Podcasts rapidly
3. Open multiple podcast categories + shows
4. Play several podcast episodes
5. Browse Live Radio
6. Search: `ghana`, `love`, `gospel`, `business`
7. Rapid tab switching: Home / Search / Library / Podcasts / Radio
8. Toggle Mature OFF/ON (with consent)
9. Background and reopen

### Recorded metrics

| Metric | Result |
|--------|--------|
| CPU spikes | **N/A** — requires Xcode Instruments or dev build with `ENABLE_DISCOVERY_PERF_DIAGNOSTICS` |
| Memory usage | **N/A** — requires Instruments / Xcode Memory Debugger |
| Active request count | **N/A** — `[HTDiscoveryPerf]` disabled in production (`ENABLE_DISCOVERY_PERF_DIAGNOSTICS = false`) |
| JS thread stalls | **N/A** — requires `ENABLE_HEAVY_PERF_DIAGNOSTICS` on dev device |
| Crashes | **Unknown** — no session run |
| Freezes / black screens | **Unknown** — no session run |
| Navigation lockups | **Unknown** — no session run |
| Phone temperature | **Unknown** — no session run |

### Pass criteria checklist

| Criterion | Status |
|-----------|--------|
| No crashes | **UNVERIFIED** |
| No black screens | **UNVERIFIED** |
| No navigation lockups | **UNVERIFIED** |
| No heavy heat after prolonged browsing | **UNVERIFIED** |
| Radio browsing responsive | **UNVERIFIED** |
| Podcast browsing responsive | **UNVERIFIED** |
| Audio starts promptly | **UNVERIFIED** |
| Latest tap wins | **UNVERIFIED** |
| Expansion still works (all categories/mature/rails) | **UNVERIFIED** on device; **PASS** static code review |

### What was verified without a device

| Check | Result |
|-------|--------|
| `npm run typecheck` | **PASS** (at commit `a25054e`) |
| Progressive rail loading wired | **PASS** — `usePodcastHomeDiscovery`, `useRadioHomeDiscovery` |
| Request manager (max 2 concurrent, abort, latest-wins) | **PASS** — `discoveryRequestManager.ts` |
| Mature podcast AbortController | **PASS** — `maturePodcastDiscovery.ts` |
| Instant podcast shell (categories while rails load) | **PASS** — `app/podcasts/index.tsx` |
| Thumbnail decode hints on list art | **PASS** — `HTImage`, rail cards |
| Playback path unchanged (immediate play) | **PASS** — `playbackRouter.ts` |
| No feature/category/mature removal in perf diff | **PASS** |

### Remaining hotspots (likely, pending device proof)

1. **Cold-cache iTunes/RSS** — first podcast show open may still spike JS during XML parse
2. **Mature category pagination** — quality scoring on 80-item cap still on main thread
3. **Radio Browser failover** — 3 mirrors × keyword queries under poor network
4. **Production diagnostics off** — heat/freeze root cause harder to capture without dev build + toggles enabled

### How to run the device session locally

1. Install latest `carplay-scene-safe-test` dev or TestFlight build on iPhone
2. Optional: set `ENABLE_DISCOVERY_PERF_DIAGNOSTICS = true` and `ENABLE_HEAVY_PERF_DIAGNOSTICS = true` in `utils/devDiagnostics.ts` for a **dev build only**
3. Connect Xcode → Devices → Open Instruments (Time Profiler + Allocations) if measuring CPU/memory
4. Run the 20-minute scenario above; watch Metro logs for `[HTDiscoveryPerf]` (`activeRequests` should stay ≤ 2)
5. Note phone warmth at minutes 5, 10, 15, 20
6. Fill in this section with real results and update the final verdict

### Final recommendation

**NOT READY FOR TESTFLIGHT**

Physical-device verification is **mandatory** and was **not completed**. Static analysis and typecheck support the performance fixes, but pass criteria (no crashes, no freezes, no heat regression, responsive podcast/radio, prompt audio) **cannot be signed off without a 20-minute iPhone session**.

After a successful physical session with zero failures, update the table above and change the verdict to **READY FOR TESTFLIGHT**.
