# Pre-Build Performance Stability Audit

**Date:** 2026-06-27  
**Goal:** Stabilize podcast discovery, mature flows, and player controls before EAS build testing. No new features or redesign.

---

## Phase 1 — Hot Path Findings

| Area | Risk | Severity |
|------|------|----------|
| `app/podcasts/index.tsx` search | `Promise.all([searchPodcastShows(), searchMaturePodcastSeeds()])` hit network on every keystroke (300ms debounce) | **High** |
| `app/podcasts/show/[showId].tsx` | Duplicate fetch: `prefetchPodcastEpisodesForShow` + `loadEpisodes`; no unmount guard; no load error UI | **High** |
| `services/podcastDiscoveryApi.ts` | Episode limit 30; no fetch timeout; mature seed IDs still attempted network | **Medium** |
| `services/podcastService.ts` | `getVisibleMatureCategories()` called `getMatureShowsByCategory` per category (N+1 + repeated cache writes) | **Medium** |
| `searchMaturePodcastSeeds` | Unbounded results; haystack rebuilt every search | **Low** |
| Show playback queue | `normalizedQueue.slice(index)` unbounded — could pass 30+ episodes | **Medium** |
| Mature seed shows (`mature-*`) | Episode fetch attempted against admin API (always fails / wastes network) | **Medium** |
| PlayerContext | `shouldOfferSmartQueueExtend()` already blocks podcast/radio smart extension; live seek no-op; radio reconnect on resume | **OK** |
| Related podcasts | `getRelatedPodcastShows` — local cache only, limit 5 | **OK** |
| Podcast home (browse) | Categories from `LAUNCH_PODCAST_CATEGORIES` seeds only; no RSS on mount | **OK** |
| Diagnostics | `mature_podcast_category_counts` gated behind `__DEV__` | **OK** |

No `setState` loops, polling intervals, or mass image preload found on podcast screens.

---

## Phase 2 — Hard Performance Rules Enforced

| Rule | Implementation |
|------|----------------|
| Podcast home: no RSS / network fan-out | Browse grid uses static `LAUNCH_PODCAST_CATEGORIES` only |
| Search: local metadata, debounced, max 25 | `searchLocalPodcastDiscovery()` — cache + mature seeds; removed `searchPodcastShows` from home search |
| Mature search: local, max 25 | `searchMaturePodcastSeeds` capped; haystacks precomputed |
| Show page: one feed, max 10 episodes, 5s timeout | `PODCAST_MAX_EPISODES_PER_SHOW`, `withTimeout()` in `fetchEpisodesFromNetwork` |
| Mature seed shows: no network episode fetch | `isMatureSeedShowId()` early return in `getPodcastEpisodesForShow` |
| Related podcasts: cache only, max 5 | Unchanged (`getRelatedPodcastShows`) |
| Auto-next queue max 10 | `PODCAST_MAX_QUEUE_EPISODES` in show page play/shuffle |
| Diagnostics dev-only | `logMaturePodcastCategoryCounts` unchanged (`__DEV__`) |
| Removed duplicate prefetch on show mount | Dropped `prefetchPodcastEpisodesForShow` effect |

---

## Phase 3 — Crash Safety

All podcast screens now use:

- `useMountedRef()` to avoid setState after unmount
- `try/catch/finally` on async loaders (loading always stops in `finally`)
- Safe fallback UI with **Try again** — no black screens or infinite spinners

| Screen | Fallback message |
|--------|------------------|
| `app/podcasts/index.tsx` | "Podcasts could not be loaded right now." |
| `app/podcasts/mature.tsx` | "Podcasts could not be loaded right now." |
| `app/podcasts/category/[id].tsx` | "Podcasts could not be loaded right now." |
| `app/podcasts/[categoryId].tsx` | "Podcasts could not be loaded right now." |
| `app/podcasts/show/[showId].tsx` | "Episodes unavailable right now." |

---

## Phase 4 — Player Stability

Audited `PlayerContext.tsx` (no changes required):

- `replayCurrentTrack` / `seekRelative` / `seekTo` no-op for `live_stream`
- Radio resume reconnects via `loadAndPlay` (no duplicate instance path found)
- `shouldOfferSmartQueueExtend()` returns false for podcast/radio bounded queues
- Music seek/pause/resume paths untouched

---

## Phase 5 — Memory / Render Optimization

- Precomputed mature seed haystacks (`SEED_HAYSTACKS` map)
- Single-pass category counting in `getVisibleMatureCategories`
- Existing `useMemo` on show page: `cleanedDescription`, `normalizedQueue`, `relatedShows`, list header/footer
- FlatList performance via existing `getListPerformanceSettings` + `keyExtractor`

---

## Files Changed

**New:**
- `utils/podcastPerformanceLimits.ts`
- `utils/podcastLocalSearch.ts`
- `utils/useMountedRef.ts`
- `utils/withTimeout.ts`
- `docs/pre-build-performance-stability-audit.md`

**Modified:**
- `app/podcasts/index.tsx`
- `app/podcasts/mature.tsx`
- `app/podcasts/category/[id].tsx`
- `app/podcasts/[categoryId].tsx`
- `app/podcasts/show/[showId].tsx`
- `services/podcastDiscoveryApi.ts`
- `services/podcastService.ts`

**Not touched (per constraints):** music playback, radio stream logic, mature radio, CarPlay/Android Auto, HiddenAudio, PlayerContext.

---

## Validation Commands

```bash
cd hidden-tunes-app
npm run typecheck
npm run lint
git diff --check
git status --short
```

---

## Remaining Risks

1. **Mature seed shows have metadata only** — no playable episodes until admin/RSS IDs are wired. Show page shows empty state safely instead of hanging.
2. **Local search depends on cache population** — first-time users may see fewer search hits until category pages are visited (shows cached on category load). Acceptable trade-off vs network fan-out.
3. **Category pages still fetch show lists from network** — one category at a time on navigation; not on home/search.
4. **Manual device test required** before EAS: podcasts home <1s, search, mature, category, show, music, radio, player.

---

## Manual Test Checklist

- [ ] App opens
- [ ] Podcasts opens under 1 second
- [ ] Mature page opens
- [ ] Search does not freeze
- [ ] Category opens
- [ ] Show opens; loading stops
- [ ] Music plays
- [ ] Radio plays
- [ ] Player opens
