# Hidden Tunes — Phase A Performance Verification

Dev-only instrumentation (`__DEV__` builds only). Preview/production APKs are unaffected.

## How to run

1. Start the app in development mode (`npm start` or dev client).
2. Look for the **Perf Verify** overlay (top-right).
3. Exercise the flows below for ~2–3 minutes while audio plays.
4. Tap the overlay → full report logs to Metro as `[HiddenTunes:perf:verify] report`.

Or call from Metro console after a session:

```javascript
// Not exposed globally by default — use overlay tap or import in a dev screen.
```

## Metrics captured

| Metric | Source |
|--------|--------|
| Home / Explore / Search / Genre open time | `recordScreenOpen` on first `logScreenReady` |
| Search first-result time | Instant catalog path (`runInstantCatalogSearch`) |
| Tap-to-audio-start | Existing `playbackStressDiagnostics` |
| Rerender counts | `useRenderCountProbe` on Home, Explore, Search, Genre, Player |
| Long JS tasks (>80ms) | RAF gap monitor in overlay |
| Scroll jank (frame delta ≥48ms) | Home + Explore scroll handlers |

## Before vs After Phase A (audit baselines vs targets)

Estimates from the performance audit. **After** values should be validated on device using the overlay.

| Metric | Before (est.) | After Phase A (target) | Phase A fix |
|--------|---------------|------------------------|-------------|
| Player rerenders/min during playback | ~28 | ~4 | A4: `PlayerProgressSection` isolation |
| Queue/Favorites rerenders/min | ~28 | ~0 (no progress sub) | A2: slice hooks vs `usePlayer()` |
| Search rows rerender on play toggle | ~18 rows | ~1–2 rows | A3: `nowPlayingStore` + `useSyncExternalStore` |
| Search pipelines per keystroke | 3 (instant + fuzzy + index) | 1 instant + deferred fuzzy | A6 |
| HTImage timers per screen | 20–40 × 200ms | 0 (shared listener) | A1 |
| Genre tap queue build | O(n) every tap | O(1) useMemo queue | A7 |
| Cold-start catalog JSON.parse | 2–3 parallel | 1 inflight | A8 |
| Explore header rebuild | Every parent render | Memoized `listHeaderElement` | A5 |
| Search first-result (local) | ~120ms | ~45ms | A6 instant-first |

## Expected improvements (qualitative)

- **Typing in Search** — instant local results; fuzzy/TV deferred; less jank.
- **Playing on Player tab** — slider/time rerender isolated; artwork/controls stable.
- **Playing on Queue/Favorites** — no ~30/min progress-driven list rerenders.
- **Explore scroll** — stable header reference; fewer nested list remounts.
- **Genre tap** — no synchronous dedupe on large rooms.
- **Cold launch** — single AsyncStorage catalog hydrate.

## Remaining top bottlenecks (post–Phase A)

1. **Home ScrollView + nested FlatLists** — biggest structural ceiling; no true virtualization for full catalog block.
2. **Home discovery memo chain** — ranking/sections recompute on catalog + preference changes.
3. **Duplicate Home/Explore discovery CPU** — same smartDiscovery work on both tabs.
4. **`usePlayerNowPlaying` still uses full `PlayerStateContext`** — Home/Explore rerender on unrelated state.
5. **Search network path** — still runs on debounce (separate from instant path).

## Strategic decisions

### FlashList — **still defer**

Phase A did not migrate lists. Pilot FlashList only if manual verification shows scroll jank on Search results or Genre track lists **after** overlay shows elevated `scrollJankWarnings` on those screens.

### SQLite — **still defer**

Catalog fits memory index + API genre filter at current sizes. Revisit at **2k+ offline songs** or if cold-start + search latency regress.

### Biggest remaining issue — **Home ScrollView nesting**

Yes. Phase A reduced rerenders and tap/search/catalog costs, but Home’s outer `ScrollView` + non-virtualized nested lists remains the largest scroll/memory bottleneck.

## Manual verification checklist

- [ ] Home open → overlay shows Home ms
- [ ] Explore open → Explore ms
- [ ] Search `Caasi Wills` → first result ms < 100ms (warm cache)
- [ ] Search `afro` / `rap` / `rnb` → instant results while typing
- [ ] Genre room → tap track → plays immediately
- [ ] Play song → stay on Player 60s → Player rerenders/min low on overlay
- [ ] Play song → switch to Home → Home rerenders/min lower than before audit
- [ ] Scroll Home + Explore → note jank warnings
- [ ] Lock-screen controls still work (unchanged by instrumentation)

## Files

- `utils/performanceVerification.ts` — metrics + report
- `utils/renderDiagnostics.ts` — rerender counting (dev only)
- `components/PerformanceOverlay.tsx` — live dev HUD
