# Final Heat / Lag / Crash Audit

**Branch:** `carplay-scene-safe-test`  
**Audit date:** 2026-06-22  
**Scope:** Stabilization only — no feature expansion, no playback/CarPlay/Android Auto/Desktop changes.

## Code fixes applied

| Area | Issue | Fix |
|------|-------|-----|
| Podcast home | `filterAvailablePodcastCategoryIds` probed every emotional/browse/mature tile on mount (20+ network calls with mature ON) | Show categories optimistically; probe removed from home load |
| Radio home | Same category probe storm on mount | Show categories optimistically; probe removed |
| Mature podcast hub | Probed all 11 subcategories on every open | Instant static category list from constants |
| Deferred search media | `setState` after unmount / stale generation | `useMountedRef` + generation guards on all async paths |
| Search screen | Backend/external/TV async callbacks lacked mount guards; backend/TV cleanup did not invalidate in-flight work | `mountedRef` checks + request-id bump on effect cleanup |
| Podcast show lists | `onRefresh` / `loadMore` `.finally()` ignored generation | Generation + mount checks before clearing loading flags |
| Bottom nav | Rapid tab taps could stack duplicate route pushes | `createKeyedTapGuard` (360ms) + skip when tab already active |

## Stress test matrix

| Scenario | Code audit | Device QA required |
|----------|------------|-------------------|
| Cold start | **PASS** — no bulk category probes on podcast/radio home; lane loads remain 40/page | Manual |
| 10 min aggressive search | **PASS** — music first; podcast/radio deferred 700ms + 180ms; stale request cancel; max 40/section | Manual |
| 10 min rapid page switching | **PASS** — nav tap guard; album/artist/show generation guards from prior work | Manual |
| 10 min radio browsing | **PASS** — lazy lists 40/page; no home category probes | Manual |
| 10 min podcast browsing | **PASS** — lazy lists 40/page; mature hub no probe storm | Manual |
| Rapid song tapping | **PASS** — MiniPlayer tap guard (prior); latest tap wins in playback layer untouched | Manual |
| Rapid favorite/unfavorite | **PASS** — unified favorites null-safe parsing (prior) | Manual |
| Mature content ON/OFF | **PASS** — mature categories omitted from API paths when OFF; no hidden mature home probe when OFF | Manual |
| App background/reopen | **PASS** — no background discovery/search loops added | Manual |
| Intentional app close | **PASS** — playback architecture untouched | Manual |

## Performance verdicts (static audit)

### Crash root causes addressed
- Stale async `setState` in deferred search media sections
- Stale backend/external/TV search updates after query change or unmount
- Podcast show list refresh/load-more clearing flags after navigation away
- Category probe callbacks racing with screen unmount (removed at source)

### Heat root causes addressed
- **Primary:** Podcast/radio home + mature hub firing parallel per-category network availability probes on every visit
- Secondary: redundant in-flight search work not invalidated on backend/TV effect cleanup (fixed)

### Lag root causes addressed
- Home screens blocked on category probe `Promise.all` before rendering category grids
- Mature hub showed spinner while probing 11 categories

### Search performance
- **PASS (code):** Debounced backend; external/TV chained after music; podcast/radio in `useDeferredSearchMediaSections` with 700ms pause-before-secondary; generation cancel; 40-item cap.

### Navigation performance
- **PASS (code):** Tab navigation immediate with pressed styles; duplicate push guard; destination screens fetch after route (existing pattern).

### Podcast/radio discovery
- **PASS (code):** No startup bulk fetch beyond 3 home lanes (40 each); category pages lazy 40/page; mature expansion loads only on category open.

## Diagnostics
- `visibleFeatureDiagnostics`, `searchDiagnostics`, `radioDiscoveryDiagnostics`, `heatPerformanceDiagnostics` remain dev/debug-flag gated.
- No new production logging added.

## Validation commands

```bash
npm run typecheck
git diff --check
```

## Manual QA checklist (required before TestFlight/production)

- [ ] No crash while fast surfing
- [ ] No black pages
- [ ] No freeze / UI lockup
- [ ] No heavy device heat during search + discovery browsing
- [ ] Taps respond instantly
- [ ] Search stays responsive under fast typing
- [ ] Podcast page visible
- [ ] Radio page visible
- [ ] Favorites work
- [ ] Song starts promptly
- [ ] Mature gating works (OFF hides mature; ON shows consent flow)

## Build readiness

**NO** — automated validation must pass and manual device QA above must be completed before release build.
