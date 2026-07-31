# Podcast Ultra-Performance + Auto-Next Report

**Date:** 2026-07-31  
**Workspace:** `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142`  
**Branch:** `fix/library-content-type-safe`  
**HEAD:** `e7fbfb01330e856df77a2079f15265a609dfb34e`  
**Metro:** port `8081` (`expo start --dev-client --host lan --port 8081 --max-workers 1`) from this SSD root  

---

## Workspace proof

| Field | Value |
| ----- | ----- |
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `e7fbfb01330e856df77a2079f15265a609dfb34e` |
| Metro project root | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` (PID 15444) |
| Podcast API | `https://admin.hiddentunes.com` |

### Dirty state before (pre-existing; preserved)

Staged from prior Podcast performance/mature work + unrelated Sports WIP:

- Podcast: `app/podcasts/*`, `hooks/useMaturePodcastCatalog.ts`, `services/podcastCatalogApi.ts`, `podcastCache`, mature settings, show queue, playback binding, prior audit + tests
- Sports (untouched by this task): `app/sports/*`, sports components/lib/services

### Dirty state after (this task)

**Task-created**

- `utils/PodcastPlaybackController.ts`
- `scripts/test-podcast-continuation.mjs`
- `scripts/test-podcast-ultra-performance.mjs`
- `audit/podcast-ultra-performance/PODCAST-ULTRA-PERFORMANCE-REPORT.md`

**Task-modified**

- `app/podcasts/show/[id].tsx`
- `context/PlayerContext.tsx` (podcast finished hook + background continuation allow)
- `utils/podcastPlayback.ts`
- `utils/podcastPlaybackAdapter.ts`
- `utils/podcastShowQueue.ts`
- `services/podcastCatalogApi.ts` (abort mapping for show episodes)

**Pre-existing Podcast work retained (not discarded)**

- Mature catalog pagination, category artwork caps, `includeMature` episode/play gates, mature cache isolation

**Safety:** no reset / stash / rebase / switch / commit / push / deploy / native build.

---

## Ownership table (Phase 1)

| Area | Primary files |
| ---- | ------------- |
| Podcast landing | `app/podcasts/index.tsx`, `hooks/usePodcastHome.ts` |
| Categories | `app/podcasts/category/[id].tsx`, `podcastCatalogApi.ts` |
| Search | `hooks/usePodcastLocalSearch.ts` (seed-local; backend mature search via mature screen) |
| Details + episodes | `app/podcasts/show/[id].tsx` |
| Mature catalog + gate | `app/podcasts/mature.tsx`, `useMaturePodcastCatalog.ts`, `maturePodcastSettings.ts`, `MaturePodcastConsentModal` |
| API / normalize / cache | `services/podcastCatalogApi.ts`, `services/podcast/podcastCache.ts` |
| RSS (seed path) | `services/podcastService.ts`, `services/podcast/rssParser.ts` |
| Cards / artwork | `components/podcast/PodcastCards.tsx`, `HTImage` |
| Playback handoff | `utils/podcastPlayback.ts`, `usePlaybackRouter.ts`, `usePodcastPlaybackBinding.ts` |
| Same-show queue | `utils/podcastShowQueue.ts` |
| Auto-next continuation | `utils/PodcastPlaybackController.ts` + `PlayerContext.handleTrackFinished` |
| List perf | `utils/performanceMode.ts` |

---

## Root causes

### 1. Mature episode list requested without `includeMature=true`

- **File/function:** `fetchPodcastEpisodesByShow` / `app/podcasts/show/[id].tsx` `loadBackendShow`
- **Proof:** Live API — same `show_id` returns `episodes: []` without flag; with `includeMature=true` returns episodes (HTTP 200 both ways)
- **Impact:** Metadata visible, “Episodes unavailable right now”, Play Latest / Shuffle disabled

### 2. Empty success treated as hard unavailable + list blanked while loading

- **File:** `app/podcasts/show/[id].tsx`
- **Proof:** `data={!episodesLoading && hasEpisodes ? … : []}` cleared rows on every reload
- **Impact:** Double flicker; misleading empty state

### 3. Mature catalog previously seed-capped

- **File:** prior `mature.tsx` seed path
- **Proof:** Backend mature total now **1659**; client previously effectively **1** seed
- **Impact:** Mature content inaccessible

### 4. Category browse heat (artwork + list churn)

- **File:** `category/[id].tsx`
- **Proof:** uncapped `HTImage` decode + missing abort/dedupe (fixed in retained prior work)
- **Impact:** heat / lag while scrolling

### 5. Podcast auto-next stopped at queue end (no category fallback / no mature isolation policy)

- **File:** `PlayerContext.handleTrackFinished` → `nextSong` bounded stop
- **Proof:** comment deferred related-show continuation; `categoryEpisodes` unused
- **Impact:** playback stops after last queued episode; no safe mature-scoped fallback

---

## Episode pipeline (three reported shows)

| Field | Sex Money Mentality | Sex, Drugs, and Chronic Depression | Happily Bored |
| ----- | ------------------- | ---------------------------------- | ------------- |
| Podcast ID | `39a6a95d-efce-4cc0-9035-7f96e2f5f0d0` | `9a4f9d0d-8ee0-4845-89ba-4472d380b4b5` | `0a460d2b-7b42-42a8-b22c-c4e045ef0faa` |
| Details request | `GET /api/podcasts/shows/{id}` | same | same |
| Episode request (broken) | `…/episodes?show_id=…&page=1&limit=40` | same | same |
| Episode request (fixed) | `…&includeMature=true` | same | same |
| HTTP | 200 / 200 | 200 / 200 | 200 / 200 |
| Raw without mature | **0** | **0** | **0** |
| Raw with mature (page) | **40** | **1** | **40** |
| Backend total (gated) | **41** | **1** | **41** |
| Claimed `episode_count` | 101 | 1 | 81 |
| Failure reason (before) | soft-empty mature gate | soft-empty mature gate | soft-empty mature gate |
| Repaired result | Episodes render; Play Latest/Shuffle enable when gate on | same | same |

**Note:** `episode_count` can exceed imported rows (backend ingest). Client no longer hides the imported set.

---

## Auto-next / smart continuation

| Concern | Owner / behavior |
| ------- | ---------------- |
| Completion event | HiddenAudio emits end → `PlayerContext.scheduleTrackAdvance` → `handleTrackFinished` |
| In-queue same-show next | Existing `nextSong({ source: "auto" })` + `usePodcastPlaybackBinding` resolve-on-demand |
| Queue exhausted | **New** `handlePodcastSessionFinished` |
| Same-show ordering | Walk show episode pages; skip completed/failed; max 3 candidates |
| Same-category fallback | `fetchPodcastEpisodesByCategory` bounded to 16; prefer other shows |
| Mature isolation | `continuationScope: mature_only \| general_only`; mature uses `adult-lifestyle` only; eligibility re-checked |
| Mutex | `continuationMutex` prevents duplicate completion races |
| Background / lock screen | Podcast domain allowed to advance when queue index exhausted (lazy continuation) |
| Manual stop | Not hooked — `handleTrackFinished` only on natural end |
| Music smart extend | Still blocked for podcast domain |

Network per continuation (target): 0–1 show page fetch and/or 1 category page + ≤3 `/play` resolves. No full-feed preload.

---

## Before / after performance

| Metric | Before | After |
| ------ | -----: | ----: |
| Initial Podcast home catalog poll | 0 | 0 |
| Duplicate idle catalog requests (60s) | 0 | 0 |
| Detail episode requests (mature, broken) | 1 empty success | 1 gated success with rows |
| Episode request duplication (show open) | possible remount overlap | AbortController + page guard |
| Requests after leaving Podcast browse | browse timers aborted | abort on unmount; audio may continue |
| Initial mounted episode rows (show) | 10 | **6** (`initialNumToRender`) |
| Double blank list flicker | yes | eliminated (keep rows; loader only if empty) |
| Mature reachable shows | 1 seed | **1659** paginated |
| Mature page size | n/a | 40 |
| Artwork decode (category) | full-res | max 112 |
| Auto-next after queue end | stop | same-show pages → category fallback |

---

## Files changed (this ultra-performance + auto-next pass)

| File | Previous | New | Reason | Risk |
| ---- | -------- | --- | ------ | ---- |
| `app/podcasts/show/[id].tsx` | no abort; blank-on-load; vague empty; page1 only | abort; keep rows; typed errors; retry; pagination; mature markers | episode UX + flicker | Low |
| `utils/PodcastPlaybackController.ts` | — | same-show + category continuation | auto-next | Med (playback path) |
| `context/PlayerContext.tsx` | podcasts fell through to bounded stop | educational-style podcast finished hook; background allow | enable continuation | Med (narrow) |
| `utils/podcastPlaybackAdapter.ts` | no scope | `continuationScope` on queue context | mature isolation | Low |
| `utils/podcastPlayback.ts` | — | stamp scope on play | isolation | Low |
| `utils/podcastShowQueue.ts` | inflight by showId only | inflight key includes mature/safe | cache correctness | Low |
| `services/podcastCatalogApi.ts` | show-episode abort → generic error | `Aborted` sentinel | no false empty | Low |
| Tests + this report | — | contract + live API proofs | acceptance | None |

**Untouched:** HiddenAudio ownership, MiniPlayer, Queue ownership model, Radio/TV/Sports/Music/Audiobooks/Lectures/Motivationals surfaces (except the narrow PlayerContext podcast finished branch), age-gate consent requirements, native modules, dependencies.

---

## Tests

```text
node scripts/test-podcast-episode-pipeline.mjs
→ PASS (empty without includeMature; rows with includeMature)

node scripts/test-mature-podcast-catalog.mjs
→ PASS { backendMatureTotal: 1659, firstPage: 40, lastPage: 42, … }

node scripts/test-podcast-same-show-autoplay.mjs
→ PASS

node scripts/test-podcast-continuation.mjs
→ PASS

node scripts/test-podcast-ultra-performance.mjs
→ PASS

node scripts/test-podcast-show-queue-bound.mjs
→ PASS

node scripts/test-podcast-mature-play-gate.mjs
→ PASS (general 403 / mature gated 200)

npx eslint app/podcasts/show/[id].tsx utils/PodcastPlaybackController.ts --max-warnings 0
→ PASS (exit 0)
```

No native build run.

---

## Device verification

Metro `8081` was running against this SSD root with established device connections.

**API / code-path verified on device-bound stack:**

- Three reported shows: empty without mature flag; episodes with flag
- Mature catalog totals + pagination
- Mature play gate

**Requires Metro reload + manual on-phone confirmation:**

1. Open Podcasts → no double loader / idle network calm  
2. Open the three shows with mature gate on → episodes + Play Latest / Shuffle  
3. Mature catalog multi-page + search  
4. Natural episode finish → same-show next; exhausted show → category fallback  
5. Mature session never continues into general catalog  
6. Manual Stop does not restart  
7. Switch to Radio/Music/TV cancels podcast reclaim  
8. Browse while playing does not heat from list progress subscriptions  

Physical heat/battery instrumentation was not captured in this session; code paths remove the proven browse polluters (full-res art, empty retry loops, blanking reloads, unbounded mature seed ceiling).

---

## Remaining limitations

1. Backend `episode_count` can exceed imported episode rows — client shows imported set only.  
2. In-app Podcast home search remains seed-local; mature search is server-side on the Mature screen.  
3. Auto-next category fallback needs a resolvable category slug (or mature defaults to `adult-lifestyle`).  
4. Full lock-screen multi-hour soak not executed here — logic is wired; confirm on device after Metro reload.  
5. Unrelated Sports dirty files remain in the working tree and were not modified for this task beyond pre-existing state.

---

## Reload / build requirements

| Requirement | Needed? |
| ----------- | ------- |
| Metro reload | **Yes** |
| New JS-only behavior after reload | Yes |
| New dev / native build | **No** (JS-only; native completion event already exists) |
| Native release build | **No** |

---

## Acceptance checklist

| Area | Status |
| ---- | ------ |
| Episode loading root cause repaired | Yes (`includeMature`) |
| Double flicker | Eliminated on show page |
| Idle polling | None on Podcast home |
| Mature pagination | 1659 reachable |
| Age gate | Preserved |
| Same-show auto-next | In-queue + page continuation |
| Same-category fallback | Implemented (bounded) |
| Mature isolation | `continuationScope` + mature category |
| Playback architecture ownership | Unchanged (thin finished hook only) |
| No commit / push / reset / stash / deploy / native build | Confirmed |
