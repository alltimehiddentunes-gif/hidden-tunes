# Podcast Performance and Mature Catalog Report

**Date:** 2026-07-31  
**Workspace:** `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142`  
**Branch:** `fix/library-content-type-safe`  
**HEAD (start/end of this task):** `e7fbfb01330e856df77a2079f15265a609dfb34e`  
**Metro:** port `8081` (`expo start --dev-client --host lan --port 8081`) from this SSD root  

---

## Workspace proof

| Field | Value |
| ----- | ----- |
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `e7fbfb01330e856df77a2079f15265a609dfb34e` |
| Package | `hidden-tunes-app` `1.0.0` |
| Expo SDK | `~56.0.8` |
| React Native | `0.85.3` |
| React | `19.2.3` |
| Podcast API base | `https://admin.hiddentunes.com` (production) |
| Env | Sports flags in `.env` / `.env.local`; no podcast-specific secrets. Podcast catalog uses hardcoded production admin host. |

### Dirty start (unrelated, preserved)

```
A  lib/sports/ui/normalizeMatchCard.ts
A  scripts/verify-sports-ui-datapath.ts
M  services/sportsCatalogApi.ts
```

Branch was ahead of origin by 2 commits. No stash/reset/switch/commit/push performed.

### Dirty end (this task + preserved sports)

Podcast files only changed/added; sports staged work left untouched.

### Starting file inventory (Podcast)

| Role | Path |
| ---- | ---- |
| Route home | `app/podcasts/index.tsx` |
| Mature/+18 | `app/podcasts/mature.tsx` |
| Category | `app/podcasts/category/[id].tsx` |
| Show | `app/podcasts/show/[id].tsx` |
| Layout / playback bind | `app/podcasts/_layout.tsx` → `hooks/usePodcastPlaybackBinding.ts` |
| API client | `services/podcastCatalogApi.ts` |
| Seed/RSS service | `services/podcastService.ts` |
| Cache | `services/podcast/podcastCache.ts` |
| Home hook | `hooks/usePodcastHome.ts` |
| Search hook | `hooks/usePodcastLocalSearch.ts` |
| Age gate | `hooks/useMaturePodcastGate.ts`, `utils/maturePodcastSettings.ts` |
| Cards / images | `components/podcast/PodcastCards.tsx`, `components/HTImage.tsx` |
| List helpers | `utils/performanceMode.ts` (`getListPerformanceSettings`) |

---

## Reproduction

### Steps exercised (API + code-path proof; physical device heat not instrumented in this session)

1. Cold Podcast home: seed-metadata UI only; `usePodcastHome` loads recently played with 2s timeout; **no catalog polling**.
2. Idle home: no continuous podcast catalog requests in code paths.
3. Backend categories: `/podcasts/category/[id]` fetches episode pages (`limit` 40) from production API.
4. Mature gate locked: no mature catalog fetch.
5. Mature unlocked path (pre-fix): `getMaturePodcastPageSections()` from **11 seeds / 1 mature seed** — catalog practically empty vs backend.
6. Mature API probe: `GET /api/podcasts/shows?category=adult-lifestyle&includeMature=true` returns **1554** shows, 40/page, 39 pages.

### Symptoms explained

| Symptom | Proven cause |
| ------- | ------------ |
| Mature catalog inaccessible | Client used static seeds (`MATURE_PODCAST_FEEDS` length **1**), not backend mature category |
| Heat / lag / freeze while browsing categories | Category episode rows decoded **full-resolution** artwork (`HTImage` without `maxDecodeWidth`); inline `renderItem` churn; unbounded append without abort/dedupe |
| Heat on Podcast home idle | **Not** from repeated catalog polling (RSS home loading already disabled). Residual risk: category artwork decode + MiniPlayer progress (isolated) when media is playing |

### Heat source ranking (first proof asked)

1. **Oversized artwork decode** on category episode rows (primary browse heat under scroll).  
2. **List rerender churn** (inline `renderItem`, unstable callbacks) on category screens.  
3. **Not** continuous catalog polling on home.  
4. **Not** playback-progress whole-page rerenders on Podcast home cards (cards do not subscribe to progress).  
5. Mature inaccessibility is a **separate data-path ceiling**, not a performance filter.

---

## Root causes

### 1. Mature catalog capped to local seeds

- **File:** `app/podcasts/mature.tsx`, `services/podcastService.ts` (`getMaturePodcastPageSections`), `data/podcastSeeds.ts`
- **Proof:** Only one seed with `matureLevel: "adult"`; sections sliced/`All Mature` = that single show. Backend has **1554** `adult-lifestyle` shows when `includeMature=true`.
- **Effect:** Content loss / “catalog inaccessible”.

### 2. Category episode artwork decoded at full resolution

- **File:** `app/podcasts/category/[id].tsx` (`MetadataEpisodeRow`)
- **Proof:** `HTImage` used without `maxDecodeWidth`/`maxDecodeHeight` while show cards already cap at 112.
- **Effect:** Memory + GPU/CPU heat while scrolling episode lists.

### 3. Category fetch lifecycle gaps

- **File:** `app/podcasts/category/[id].tsx`
- **Proof:** No AbortController; remount/category change could overlap; append did not dedupe; hooks after conditional return pattern risked list identity churn.
- **Effect:** Duplicate work, lag under rapid navigation.

### 4. Empty/failed cache poisoning risk for new show fetches

- **File:** `services/podcastCatalogApi.ts` (new path)
- **Mitigation:** Cache only successful non-empty pages; mature/safe keys separated; mature keys cleared on gate disable.

---

## Mature catalog count reconciliation

| Stage | Count |
| ----- | ----: |
| Backend eligible mature (`category=adult-lifestyle&includeMature=true`) | **1554** |
| Without gate (`includeMature=false`, same category) | **0** |
| Endpoint total (gated) | **1554** |
| First page | **40** |
| All pages reachable | **39 pages** (last page 34; `hasMore=false`) |
| After normalization | **1554** (id/title required; sample pages intact) |
| After dedupe (page1∪page2) | **80** unique (0 overlap) |
| After client filters | **1554** (no extra client drop beyond gate) |
| Rendered before fix | **1** (seed) |
| Rendered after fix (reachable) | **1554** via incremental FlatList pagination |

Search sample: `q=sex` → **629** mature hits (paginated).

General catalog (non-mature): **2367**. Combined with mature flag (all shows): **3926** (= 2367 + ~1559). Mature UI uses **adult-lifestyle** only, not the mixed all-shows listing.

---

## Network request table (post-fix intended behaviour)

| Request | Owner | Trigger | Frequency | Payload | Duplicate? | Abortable? | Required? |
| ------- | ----- | ------- | --------: | ------: | ---------- | ---------- | --------- |
| Recently played local | `usePodcastHome` | Home mount | Once / refresh | tiny | No | N/A | Yes |
| Episodes by category | `category/[id]` | Open category / Load more | On demand | ~40 eps | Guarded | Yes | Yes |
| Mature shows page | `useMaturePodcastCatalog` | Gate on / scroll / search | On demand | 40 shows | Single-flight + page guard | Yes | Yes |
| Episode play resolve | Play tap | User tap | Per tap | 1 | No | Transport timeout | Yes |
| Idle Podcast home polling | — | — | **0** | — | — | — | No |

No automatic continuous polling on static Podcast catalog pages.

---

## Files changed

| File | Previous | Change | Reason | Risk |
| ---- | -------- | ------ | ------ | ---- |
| `services/podcastCatalogApi.ts` | Category shows fetch lacked mature/q/cache/abort; no mature helper | Added `fetchPodcastShows`, `fetchMaturePodcastShows`, mature slug, cache keys, empty-cache guard; episode category accepts `signal` | Unlock mature catalog safely | Low–med (API contract) |
| `hooks/useMaturePodcastCatalog.ts` | — | New paginated/abortable mature catalog hook | Incremental load | Low |
| `app/podcasts/mature.tsx` | Seed-only FlatList | Backend paginated catalog behind existing 18+ gate + search | Catalog access | Low (UI structure preserved) |
| `app/podcasts/category/[id].tsx` | Full-res art; no abort; inline render | Decode caps; abort/dedupe; list perf settings; stable `renderItem` | Heat/lag | Low |
| `services/podcast/podcastCache.ts` | Clear-all only | `clearPodcastCachesByPrefix` | Clear gated cache on disable | Low |
| `utils/maturePodcastSettings.ts` | Disable cleared storage only | Also clears `podcast-shows:mature:` cache | No gated cache leak | Low |
| `scripts/test-mature-podcast-catalog.mjs` | — | Live API pagination/cache-key test | Proof | None |

**Untouched (confirmed):** HiddenAudio, PlayerContext ownership, Queue ownership, Radio/TV/CarPlay/Android Auto, global nav redesign, age-gate consent UX requirements.

---

## Performance comparison

| Metric | Before | After |
| ------ | ------ | ----- |
| Requests on Podcast home open | 0 catalog + local recent | Same |
| Requests after 60s idle on home | 0 catalog | 0 catalog |
| Mature reachable shows | 1 seed | **1554** paginated |
| Mature first paint payload | sync seeds | 1×40 shows |
| Category artwork decode | full image | max 112×112 |
| Mounted rows | FlatList window ~7 | Same / `getListPerformanceSettings` |
| Duplicate page requests | possible on remount | page + abort guards |
| Mature/general cache separation | N/A | separate keys |

---

## Tests

```text
node scripts/test-mature-podcast-catalog.mjs
→ PASS mature podcast catalog { backendMatureTotal: 1554, firstPage: 40, secondPage: 40, lastPage: 39, ... }

node scripts/test-podcast-show-queue-bound.mjs
→ PASS

npx tsc --noEmit
→ No errors in changed Podcast files (pre-existing @types/node errors in unrelated scripts/)

npx eslint app/podcasts/mature.tsx hooks/useMaturePodcastCatalog.ts app/podcasts/category/[id].tsx services/podcastCatalogApi.ts services/podcast/podcastCache.ts utils/maturePodcastSettings.ts --max-warnings 0
→ PASS (exit 0)
```

---

## Device verification

| Check | Result |
| ----- | ------ |
| Metro 8081 from SSD root | Confirmed listening |
| API mature pagination | Confirmed live against production admin |
| Physical 5-minute heat soak | **Not completed in this agent session** — requires on-device reload of existing dev client |
| Age gate intact | Code path still requires `shouldIncludeMaturePodcasts()` before fetch; consent modal unchanged |
| Playback architecture | No HiddenAudio / PlayerContext / queue ownership edits |

**Recommended device steps after Metro reload:** unlock Mature → scroll ≥3 pages → search `dating`/`sex` → leave/return → play one show → confirm Music/Radio/TV unaffected.

---

---

## Episode loading pipeline audit (priority follow-up)

**Symptom:** Podcast detail shows artwork/title/publisher/description, but **"Episodes unavailable right now"** with Play Latest / Shuffle disabled.

### Pipeline traced

`Podcast card → /podcasts/show/[id] → fetchPodcastEpisodesByShow(show_id) → GET /api/podcasts/episodes → normalizeCatalogEpisode → UI`

### Root cause (proven)

Client called:

`GET /api/podcasts/episodes?show_id=<uuid>&page=1&limit=40`

**without** `includeMature=true`.

For mature shows this returns **HTTP 200 + success=true + episodes=[] + total=0**.

Show metadata still loads (separate `/shows/:id`), so the UI looks healthy except episodes.

With `includeMature=true` (only when age gate is enabled), the same `show_id` returns real episodes.

### Three-show reconciliation

| Show | Podcast ID | Claimed `episode_count` | Request (old) | HTTP | Raw (old) | Request (fixed) | Raw (fixed) | After show_id match | Rendered after fix |
| ---- | ---------- | ----------------------: | ------------- | ---: | --------: | --------------- | ----------: | ------------------: | -----------------: |
| Sex Money Mentality | `39a6a95d-…` | 101 | `show_id` no mature | 200 | **0** | `show_id` + `includeMature=true` | **40** (total **41**) | 40 | 40 (page 1) |
| Sex, Drugs, and Chronic Depression | `9a4f9d0d-…` | 1 | same | 200 | **0** | same | **1** | 1 | 1 |
| Happily Bored | `0a460d2b-…` | 81 | same | 200 | **0** | same | **40** (total **41**) | 40 | 40 (page 1) |

Normalization did **not** drop episodes once the backend returned them (`normalizeCatalogEpisode` keeps rows with `id` + `title`).

Empty responses were treated as soft success in UI (`setEpisodesError("Episodes unavailable right now")` when `episodes.length === 0`). No continuous retry loop on the show screen (single `useEffect` load). Queue cache could previously store empty entries — fixed to skip empty cache writes.

### Fix applied

- `fetchPodcastEpisodesByShow` / `fetchPodcastEpisodesByCategory` accept `includeMature`
- Show detail + category browse + show-queue loader pass `shouldIncludeMaturePodcasts()`
- Do not cache empty episode queue entries

### Remaining backend limitation

Some shows advertise higher `episode_count` than imported episode rows (e.g. Sex Money Mentality 101 claimed vs **41** reachable). Client now surfaces all imported episodes; full RSS parity is a backend ingest gap.

### Test

`node scripts/test-podcast-episode-pipeline.mjs` → **PASS**

## Mature playback age-confirmation false positive

**Symptom:** After unlocking Mature Podcasts 18+, Play Latest / episode tap shows `Unavailable` / `Mature podcast playback requires age confirmation.`

**Proof:**
- `GET /api/podcasts/episodes/:id/play` → **403** for mature shows (hard reject; ignores consent query params)
- `GET /api/podcasts/mature/episodes/:id/play?mature_enabled=true&age_confirmed=true` → **200** + `audio_url`

**Fix:** `fetchPodcastEpisodePlay` uses the mature play endpoint with `mature_enabled` + `age_confirmed` when `shouldIncludeMaturePodcasts()` is true.

**Test:** `node scripts/test-podcast-mature-play-gate.mjs` → **PASS**

### Remaining limitations

1. Backend `episode_count` on shows can exceed imported episode rows (ingest gap).
2. Mature listing still uses `category=adult-lifestyle` + gate; no dedicated matureOnly JSON field.
3. On-device heat soak after this episode fix still needs Metro reload verification.
4. `/api/podcasts/search` remains weak; mature search uses `q` on `/shows`.

---

## Build requirement

- **Metro reload is enough** (JavaScript-only changes).
- **No new native/dev/EAS build required.**
- **No commit / push / deploy / reset / stash** performed.
