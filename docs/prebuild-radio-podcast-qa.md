# Pre-Build Radio + Podcast QA

**Date:** 2026-06-21
**Branch:** `carplay-scene-safe-test`
**Base checkpoint:** `d43525c` — *Fix radio discovery experience and remove empty states*
**Stabilization commit:** *(see HEAD after this report)*

---

## 1. Repository state

| Check | Result |
|-------|--------|
| Branch | `carplay-scene-safe-test` |
| Working tree | Clean at audit start; small stabilization patch applied |
| Recent commits | `d43525c` radio premium · `ea07f16` scale discovery · `ec6e820` mature gating |

---

## 2. Validation results

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | **PASS** | `tsc --noEmit` clean |
| `git diff --check` | **PASS** | No whitespace errors |
| `npx expo-doctor` | **2 known failures** | Pre-existing baseline |

### expo-doctor (known, non-blocking)

1. `@react-navigation/native` alongside expo-router (SDK 56 advisory)
2. 10 Expo patch version mismatches (`expo@56.0.8` vs `~56.0.12`, etc.)

These existed before `d43525c` and do not block EAS production builds.

---

## 3. Behavioral QA (code-path + architecture review)

Manual device tap-through was not run in this session. The following was verified by **static inspection** of routes, hooks, and guards:

| Check | Status | Evidence |
|-------|--------|----------|
| Live Stations opens | **Expected OK** | `app/stations/index.tsx` → `useRadioHomeDiscovery` |
| Radio home rails populate | **Expected OK** | Single featured fetch slices into 5 rails |
| No empty visible categories | **Expected OK** | `filterAvailableRadioCategoryIds` + probe cache (30min TTL) |
| Category tap loads stations | **Expected OK** | `useLazyRadioStationList` + 40/page |
| Station playback unchanged | **Expected OK** | `usePlaybackRouter().playRadioStation` untouched |
| Radio search works | **Expected OK** | `app/stations/search.tsx` debounced 350ms, cache-first |
| Podcast home opens | **Expected OK** | `app/podcasts/index.tsx` unchanged route |
| Podcast categories open | **Expected OK** | `useLazyPodcastShowList` + 40/page |
| Main search music first | **Expected OK** | Songs/artists/albums render before deferred sections |
| Radio/podcast lower in search | **Expected OK** | `useDeferredSearchMediaSections` after VIDEOS |
| Mature OFF by default | **Expected OK** | `DEFAULT_SETTINGS.enabled: false` |
| Mature consent works | **Expected OK** | `useMatureContentGate` + profile toggle |

**Device smoke test still recommended** before store submission (playback tap, mature consent modal, scroll heat on radio home).

---

## 4. Heat / fetch audit

Diagnostics source: `utils/radioDiscoveryDiagnostics.ts` (gated behind `__DEV__ && ENABLE_HEAVY_PERF_DIAGNOSTICS`).

### Fetch patterns (no infinite loops found)

| Surface | Expected network | Loop risk |
|---------|------------------|-----------|
| Radio home mount | 1× featured page (40) + background category probes (limit=1, concurrency=2) | **Low** — probes cached 30min; inflight deduped |
| Category browse | 1× page per navigation; pagination on scroll | **Low** — stale guard + abort on unmount |
| Radio search | Debounced 350ms; disabled when query empty | **None** when idle |
| Main search media | Deferred 480ms after submitted query ≥2 chars | **None** when idle |
| Podcast discovery | `enabled` flag; only on podcast screens | **None** when radio open |

### Issues found and fixed

| Issue | Severity | Fix |
|-------|----------|-----|
| `logRadioDiscoveryRender("radio-home")` ran **every render** (missing deps) | Medium — false render bursts, unnecessary work | Changed to `useEffect(..., [])` mount-only |
| Diagnostics always recorded events (production included) | Low — memory/noise in prod | Gated via `isRadioDiscoveryDiagnosticsEnabled()` |

### Not changed (acceptable trade-offs)

- Background category probes after home featured load — intentional to hide empty browse tiles; bounded by probe cache
- `includeMatureInApi` change re-runs home discovery — expected when mature setting toggles
- Triple Radio Browser server failover — existing 12s timeout per server

### Podcast / search idle behavior

- `useLazyPodcastShowList`: `enabled: Boolean(cacheKey)` — no fetch when disabled
- `useDeferredSearchMediaSections`: clears state when query `< 2` chars; aborts via generation counter
- No podcast hooks run on radio-only navigation paths

---

## 5. Stabilization changes (this QA pass)

| File | Change |
|------|--------|
| `utils/devDiagnostics.ts` | Added `isRadioDiscoveryDiagnosticsEnabled()` |
| `utils/radioDiscoveryDiagnostics.ts` | Dev-only gating; no-op in production |
| `hooks/useRadioHomeDiscovery.ts` | Mount-only render diagnostic (fixed false burst) |

**Not touched:** HiddenAudio, playback, queue, CarPlay, Android Auto, UI design.

---

## 6. Remaining risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Radio Browser tag sparsity | Some emotional worlds may not appear | Tag matching + probe fallback |
| Background probes on first home visit | ~5–8 small network calls after featured load | 30min cache; concurrency=2 |
| expo-doctor patch mismatches | Low — builds succeed on EAS | Schedule `npx expo install --check` post-release |
| Device-only playback regressions | Unknown without manual tap | TestFlight/internal track smoke test |

---

## 7. Build readiness verdict

**YES** — ready to build from stabilization commit.

Pre-build checklist:

- [x] Typecheck pass
- [x] No whitespace diff errors
- [x] Heat/fetch audit complete; no infinite loops
- [x] Production diagnostics silenced
- [x] Playback architecture untouched
- [ ] Manual device smoke (recommended before submit)

---

## 8. Re-enable diagnostics (dev only)

Set in `utils/devDiagnostics.ts`:

```typescript
export const ENABLE_HEAVY_PERF_DIAGNOSTICS = true;
```

Then open Live Stations and inspect:

```typescript
import { getRadioDiscoveryDiagnosticsReport } from "../utils/radioDiscoveryDiagnostics";
// getRadioDiscoveryDiagnosticsReport()
```
