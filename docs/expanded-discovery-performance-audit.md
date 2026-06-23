# Expanded Discovery Performance Audit

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Expansion preserved

All expanded discovery remains in place:

- 20 mature podcast categories + 5 mature hub rails  
- Mature live radio slice (primary groups + merged talk when probed on category open)  
- iTunes/RSS podcast fallback, Radio Browser mature radio  
- Mature search aliases (capped)  
- 40/page pagination on podcast and radio lists  

Nothing was removed or redesigned. Playback, queue, CarPlay, Android Auto, and Desktop were not touched.

---

## Performance budget constants

`constants/discoveryPerformanceBudget.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `RADIO_PAGE_SIZE` | 40 | First radio page |
| `PODCAST_PAGE_SIZE` | 40 | First podcast page |
| `MAX_FALLBACK_QUERIES` | 2 | Search alias cap |
| `MAX_PARALLEL_DISCOVERY_REQUESTS` | 1 | Sequential lane/category fetches |
| `MATURE_CATEGORY_PREFETCH` | **false** | No hub-mount probe storms |
| `DISCOVERY_PRIORITY_RAIL_LIMIT` | 2 | First-paint hub/home rails |
| `DISCOVERY_IDLE_RAIL_LIMIT` | 2 | Rails loaded on scroll/end |
| `MATURE_PRIMARY_QUERIES_PER_PAGE` | 1 | One keyword per mature category page |
| `MATURE_MAX_FALLBACK_QUERIES_PER_PAGE` | 1 | One fallback if primary sparse (<20) |
| `DISCOVERY_QUALITY_RANK_CAP` | 80 | Max rows scored per fetch batch |

---

## Heavy work capped

| Before | After |
|--------|-------|
| 20 mature podcast probes on home/hub mount | Static category tiles from catalog metadata |
| 10 mature radio probes for hub live rail | Single `adult-talk` fetch (cached) |
| 4 parallel mature keyword queries per page | 1 primary + optional 1 fallback (sequential) |
| 4 parallel mature radio queries per page | 1 primary + optional 1 fallback (sequential) |
| Adjacent-category supplement on every mature page 1 | Only on load-more (`offset > 0`) |
| 5 search fallback aliases | 2 |
| 3 podcast search fallbacks | 2 |
| Parallel trending+popular on home | Sequential with idle defer |
| Quality scoring unbounded arrays | Capped to 80 rows in service layer |

---

## Progressive loading

### Mature hub (`/podcasts/mature`)

1. **First paint:** header + 20 podcast category tiles + 6 radio category tiles  
2. **Priority rails:** Featured + Trending (2 sequential fetches)  
3. **On scroll/end:** +2 rails per trigger (New Episodes, Most Popular, Hidden Gems)  
4. **Deferred (800ms):** Live Mature Radio rail — single category fetch  
5. **On category tap:** mature category page loads 40 shows (1 query + optional fallback)

### Podcast home

1. Category tiles immediately (including mature metadata when ON)  
2. Featured rail → stagger → Trending → idle defer → Popular → recent/recommended  

### Radio home

1. Category tiles immediately (static mature radio groups when ON)  
2. Featured → Trending → deferred Popular  

---

## Mature OFF = zero mature fetches

All mature loaders gate on `shouldIncludeMatureInApi()`. Hooks reset state and cancel in-flight mature work when mature is disabled.

---

## Dev diagnostics

`utils/discoveryPerformanceDiagnostics.ts` (off by default):

- `ENABLE_DISCOVERY_PERF_DIAGNOSTICS` in `utils/devDiagnostics.ts`  
- Logs: screen mount/unmount, request start/end, cancelled stale requests, slow sections (>1.2s), render burst warnings  
- Prefix: `[HTDiscoveryPerf]`

---

## Heat-risk reductions

| Risk | Mitigation |
|------|------------|
| 11-category mature probe storm | Removed — `MATURE_CATEGORY_PREFETCH = false` |
| Multi-query mature category burst | 1+1 sequential max per page |
| Hub 5-rail + radio visibility probe | 2 rails first; radio deferred; 1 radio fetch |
| Home parallel lane fanout | Sequential + stagger |
| Search alias explosion | Max 2 fallbacks |
| Quality scoring during scroll | Service-layer cap only |

---

## Remaining risks

- Opening a sparse mature category may still feel light until user loads next 40 (expansion runs on load-more)  
- Live mature radio inventory depends on Radio Browser `adult-talk` results in region  
- First mature hub visit still loads 2 podcast rails — acceptable within budget  
- Enable `ENABLE_DISCOVERY_PERF_DIAGNOSTICS` locally to verify request counts during QA  

---

## Validation

- [x] `npm run typecheck`
- [x] `git diff --check`
- [ ] Manual: mature OFF → no mature network activity  
- [ ] Manual: mature hub opens without heat spike  
- [ ] Manual: load next 40 on category pages  
- [ ] Manual: aggressive search without heat spike  
