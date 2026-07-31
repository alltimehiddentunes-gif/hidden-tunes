# Sports Ultra-Performance Optimisation Report

**Date:** 2026-07-31  
**Workspace:** `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142`  
**Branch:** `fix/library-content-type-safe`  
**HEAD:** `e7fbfb01330e856df77a2079f15265a609dfb34e`  
**Metro:** port `8081` (`expo start --dev-client --port 8081`) from this SSD root  

---

## Workspace proof

| Field | Value |
| ----- | ----- |
| Absolute path | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-CLEAN-1.0.142` |
| Branch | `fix/library-content-type-safe` |
| HEAD | `e7fbfb01330e856df77a2079f15265a609dfb34e` |
| Metro project root | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` (Expo CLI PID listening on 8081) |
| Abort rule | Root + branch match — proceeded |

### Dirty state before (pre-existing; preserved)

Staged / unstaged from prior Podcast + Sports premium-grid work, including:

- Podcast: `app/podcasts/*`, mature catalog, playback continuation WIP
- Sports premium grid / Live TV WIP: `app/sports/*`, `SportsTv*`, `useSportsTvCatalog`, fixture grid helpers, prior audit folders

No files were discarded, reset, stashed, or overwritten beyond this task’s intentional edits.

### Dirty state after (this task)

**Task-created**

- `services/sports/sportsBrowseCache.ts`
- `scripts/verify-sports-ultra-performance.ts`
- `audit/sports-ultra-performance/SPORTS-ULTRA-PERFORMANCE-REPORT.md`

**Task-modified**

- `app/sports/index.tsx`
- `app/sports/search.tsx`
- `app/sports/sport/[sportSlug].tsx`
- `app/sports/country/[code].tsx`
- `hooks/useSportsTvCatalog.ts`
- `lib/sports/sportsTvConstants.ts`
- `lib/sports/ui/homeSections.ts`
- `components/sports/SportsTvShelf.tsx`
- `components/sports/SportsTvChannelCard.tsx`
- `services/sportsCatalogApi.ts`

**Safety:** no reset / stash / rebase / switch / commit / push / deploy / native build.

---

## Ownership map

| Responsibility | File | Request owner | Render owner | Cache owner |
| -------------- | ---- | ------------- | ------------ | ----------- |
| Sports home | `app/sports/index.tsx` | `load()` → `fetchSportsHome` | `SportsHomeInner` FlatList | `sportsBrowseCache` + screen state |
| Fixture / result cards | `components/sports/SportsMatchCard.tsx` | none (browse) | memo card | expo-image logos |
| Live Now | home section `live_now` | home payload | `SportsEmptyState` / shelf | home cache |
| Live Sports TV shelf | `components/sports/SportsTvShelf.tsx` | tap → `openTvDiscoveryStation` | memo shelf | none (props) |
| Sports TV card | `components/sports/SportsTvChannelCard.tsx` | none | memo card | expo-image memory-disk |
| Sports TV hook | `hooks/useSportsTvCatalog.ts` | `fetchTvCatalog` page/limit | hook state | TV catalog memory + hook pages |
| Sports search | `app/sports/search.tsx` | debounced `searchSportsCatalog` + TV q | FlatList groups | browse search cache + TV cache |
| Sport filters | home chips | client-only filter | home | none |
| Country hub | `app/sports/country/[code].tsx` | `fetchSportsCountryHub` | FlatList | hub cache |
| Competition / sport hub | `app/sports/sport/[sportSlug].tsx` | `fetchSportsSportHub` | FlatList | hub cache |
| TV catalog query | `services/tvCatalogApi.ts` | `fetchTvCatalog` | N/A | TV memory cache + inflight |
| TV artwork | `utils/tvArtwork.ts` + TV card | none at list | Image | failed-URL mark + disk |
| TV player handoff | `services/tvDiscoveryOpen.ts` | on tap only | existing TV player | TV session |
| Feature flags | `constants/sportsFlags.ts` | gates | screens | env overrides |
| Pagination | TV hook + Load more | page cursor | shelf footer | retained pages (≤3) |
| Refresh behaviour | home focus / AppState / PTR | stale-aware | keep content | forceNetwork |

---

## Root causes

### 1. No persistent Sports browse cache → remount refetch + flicker

- **File/hook:** `app/sports/index.tsx`, `services/sportsCatalogApi.ts`
- **Proof:** Pre-change home used only component `useState`; leave/re-enter always skeletoned and re-hit `/api/sports/home`.
- **Impact:** Repeated catalog bytes, blank flicker, perceived lag.

### 2. Focus/AppState always refreshed; prefs reloaded every background tick

- **File:** `app/sports/index.tsx` (pre-change `useFocusEffect`)
- **Proof:** Every AppState `active` + optional 60s interval called full `load()` with reminders/favorites/follows.
- **Impact:** Idle/network heat even with zero live fixtures; AsyncStorage churn.

### 3. Hub fan-out (sport list + countries + competitions)

- **File:** `fetchSportsSportHub` / `fetchSportsCountryHub`
- **Proof:** Sport hub previously `Promise.all([fetchSportsList, fixtures, competitions])`; country hub fetched countries + fixtures + competitions.
- **Impact:** 2–3× unnecessary taxonomy traffic per hub open.

### 4. Sports TV page size 24 + replace-error wipe

- **File:** `useSportsTvCatalog.ts`, `sportsTvConstants.ts`
- **Proof:** First page was 24 (~15.4KB measured); replace errors called `setVideos([])`.
- **Impact:** Larger first paint; shelf flicker on transient errors.

### 5. Country hub ScrollView + nested `.map()`

- **File:** `app/sports/country/[code].tsx`
- **Proof:** Full section tree mounted at once.
- **Impact:** Higher mount cost / scroll jank vs section FlatList.

### 6. Search 1-char queries + always-on 30s clock

- **File:** `app/sports/search.tsx`
- **Proof:** Debounced search ran for any non-empty string; `useSportsNowClock()` always ticking.
- **Impact:** Extra search/TV requests; avoidable parent rerenders.

### 7. Dense section item caps

- **File:** `lib/sports/ui/homeSections.ts`
- **Proof:** Schedule capped at 40; shelves at 16.
- **Impact:** More cards mounted inside each FlatList section row.

---

## Before / after metrics

| Metric | Before | After |
| ------ | -----: | ----: |
| Initial Sports home requests (target) | 1 home (+prefs) + 1 TV | 1 home (+prefs once) + 1 TV page |
| Duplicate page-one Sports TV | possible remount | dedupe + TV memory cache |
| Idle catalog requests (no live, live scores off) | AppState refresh possible | **0** interval; AppState only if stale ≥60s |
| Sports TV requests after 60s idle | possible via home refresh coupling | **0** (TV not polled) |
| Requests after leaving Sports | abort on blur | abort + focus false; browsing stops |
| Sports TV first page | 24 (~15.4KB) | **16 (~10.5KB)** measured |
| Full 576-channel download | No (already) | **No** (page/limit + max 3 pages retained) |
| Artwork decode hint | 160×160 | **96×96** |
| Mounted fixture cards / section | up to 16–40 | up to **12–24** |
| Mounted TV cards (first paint) | 24 | **16** |
| Home FlatList window | initial 4 / window 7 | **initial 6 / window 5 / batch 6** |
| Double-loading flicker | skeleton on remount | cache hydrate + soft TV refresh |
| TV progress → Sports list | not subscribed | still not subscribed; shelf props narrowed |
| Fixture streams | disabled | **disabled** |
| Duplicate Sports player | none | **none** |

Network page probe (2026-07-31, production API):

```text
GET /api/tv/videos?category=Sports&page=1&limit=16&platform=android
→ ~10492 bytes, 16 videos, total=576, hasMore=true

GET …&limit=24 → ~15423 bytes, 24 videos
```

---

## Files changed

| File | Previous | New | Reason | Risk |
| ---- | -------- | --- | ------ | ---- |
| `services/sports/sportsBrowseCache.ts` | — | Bounded TTL cache | Remount speed; stale policy | Low |
| `services/sportsCatalogApi.ts` | No browse TTL; hub fan-out | Cache + forceNetwork; hub request cut | Data / heat | Medium (hub naming fallback) |
| `hooks/useSportsTvCatalog.ts` | Wipe on error; page 24 | Soft refresh; retain; cap 3 pages; page 16 | TV shelf stability | Low |
| `lib/sports/sportsTvConstants.ts` | limit 24 | limit 16 + max pages | First-byte budget | Low |
| `lib/sports/ui/homeSections.ts` | higher caps | tighter render bounds | Mount cost | Low (less on-screen density) |
| `app/sports/index.tsx` | always refresh / prefs | stale-aware; live-only poll; cache hydrate; FlatList tune | Idle heat | Medium |
| `app/sports/search.tsx` | min len inconsistent; clock always | min 2; debounce 300; clock gated | Search storms | Low |
| `app/sports/country/[code].tsx` | ScrollView | FlatList + keep content | Virtual owner | Low |
| `app/sports/sport/[sportSlug].tsx` | always skeleton/clock | keep content; gated clock | Hub jank | Low |
| `components/sports/SportsTvShelf.tsx` | tap only | + opening mutex; stable handoff | Tap latency / dup open | Low |
| `components/sports/SportsTvChannelCard.tsx` | 160 decode | 96 decode; StyleSheet.absoluteFill | Artwork heat | Low |
| `scripts/verify-sports-ultra-performance.ts` | — | Contract tests | Regression guard | None |

---

## Tests

```powershell
Set-Location "D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142"
npx tsx scripts/verify-sports-ultra-performance.ts
npx tsx scripts/verify-sports-premium-grid-and-live-tv.ts
npx tsx scripts/verify-sports-ui-datapath.ts
```

Results:

- `verify-sports-ultra-performance.ts` → **ok: true** (page 16, max pages 3, 2-col phones, streams off, no second player, cache isolation, FlatList country hub, no sports-list fan-out)
- `verify-sports-premium-grid-and-live-tv.ts` → **ok: true**
- `verify-sports-ui-datapath.ts` → ok (liveCount 0, upcoming/results present; fixture streams not exposed as Watch Live)

Targeted `tsc` on Sports files: fixed `StyleSheet.absoluteFill` on TV card + composed sections typing. Remaining script `node:*` typing noise is pre-existing / env `@types/node` gap, not product runtime.

---

## Device verification

Metro `8081` was already running from the SSD root. Full phone instrumentation (Instruments / Flipper request counts, thermal) was **not** claimed as completed in this pass.

Contract + API measurements cover budgets for initial TV page, pagination bounds, idle polling policy, and request ownership. Recommended phone checklist after Metro reload:

1. Cold open Sports → two-column fixtures + TV shelf without double blank
2. Idle 60s with no live → no Sports TV / home spam
3. Load more TV once near end only
4. Search typing → no per-keystroke storm (min 2 + 300ms)
5. Tap channel → single `/tv-player` handoff; continue scroll while playing
6. Leave Sports → browsing timers/requests stop; TV playback may continue via TV owner

---

## Reload / build requirement

| Action | Required? |
| ------ | --------- |
| Metro restart / reload | **Yes** — JS changes + env already set for Sports TV |
| Dev client rebuild | **No** |
| Native / EAS build | **No** |

---

## Confirmations

- No duplicate Sports / TV player created — handoff remains `openTvDiscoveryStation` → existing `TvPlayerHost` / session.
- Fixture streams remain disabled (`sports_streams_enabled: false`; `.env.local` false).
- Quarantined / non-playable TV entries stay gated by catalog flags; cards do not claim playability beyond server metadata; resolve happens on tap.
- Unrelated systems (music, radio, podcasts, audiobooks, global TV catalog owner, HiddenAudio, Queue, MiniPlayer, CarPlay, Android Auto) untouched by this task’s intentional edits.
- No reset, stash, commit, push, deploy, or native build occurred.
