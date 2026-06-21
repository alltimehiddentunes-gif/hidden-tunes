# Radio Premium Discovery Audit

**Branch:** `carplay-scene-safe-test`  
**Scope:** Live Radio Browser discovery (not song listening rooms at `/radio`)  
**Goal:** Premium, populated, launch-ready radio with no empty category dead ends

---

## Summary

Radio home was rebuilt from a static category grid into a **premium discovery hub** with featured rails, emotional worlds, and availability-gated browse lanes. Empty categories are hidden before users can tap them, and category screens redirect home instead of showing “Nothing here yet.”

---

## Phase 1 — Empty categories eliminated

### Root cause (evidence)

| Category | Old driver | Why empty |
|----------|------------|-----------|
| Gospel & Worship | `tag: "gospel"` | Sparse Radio Browser tag vs `christian` |
| African Radio | `tag: "africa"` | Poor tag coverage vs `afrobeat` |
| News & Talk | `tag: "news"` | Many stations tagged `talk` only |
| World Radio | `useTopVotes` (duplicate of Featured) | Same API path as Featured — misleading label |
| Sports | `tag: "sports"` | Often empty after HTTPS + mature filter |

### Fix

- **Improved tag mappings** in `constants/radioCategories.ts`
- **`probeRadioCategoryHasStations()`** in `services/radio/radioCategoryAvailability.ts` — cache-first, limit=1 probe, 30min session TTL, concurrency=2
- **Home grid** shows only categories that pass availability probe
- **Category screen** (`app/stations/[categoryId].tsx`) redirects to `/stations` when load completes with 0 stations — no empty-state dead end

### Categories typically removed (when API returns 0 after filters)

- Sports (intermittent)
- Gospel & Worship (if `christian` probe fails)
- African Radio (if `afrobeat` probe fails)
- News & Talk (if `talk` probe fails)

### Categories typically populated

- Featured (internal/topvote — powers home rails)
- Browse by Country (US)
- Browse by Language (`english`)
- Browse by Genre (`pop`)
- Emotional worlds (tag-matched from featured pool + probe fallback)
- World Radio (`world` tag)

---

## Phase 2 — Real radio home

**File:** `app/stations/index.tsx` + `hooks/useRadioHomeDiscovery.ts`

Sections (in order, before browse grid):

1. **Featured Stations** — topvote pool slice 0–10
2. **Trending Stations** — slice 10–18
3. **Popular Stations** — slice 18–26
4. **Recently Played Stations** — local AsyncStorage (`radio-*` ids) via `recentlyPlayedRadio.ts`
5. **Recommended Stations** — slice 26–34

**Network cost:** **1 featured fetch** (40 stations) powers five rails — no per-section API calls.

---

## Phase 3 — Emotional World Radio

**File:** `constants/radioEmotionalWorlds.ts`

| World | Tag probe | Match tags |
|-------|-----------|------------|
| Night Drive Radio | `jazz` | jazz, chill, lounge, night, smooth |
| Heartbreak Recovery Radio | `soft` | soft, ballads, love, soul |
| Sunday Worship Radio | `christian` | christian, gospel, worship, praise |
| Deep Focus Radio | `ambient` | ambient, classical, instrumental, study |
| Afro Heat Radio | `afrobeat` | afrobeat, afro, african, amapiano |
| Hidden Treasures Radio | `indie` | indie, alternative, underground |
| World Mix Radio | `world` | world, international, global |

- Shown as **horizontal emotional world cards** before secondary browse grid
- Worlds hidden unless **≥3 stations** match in featured pool OR tag probe succeeds
- Full browse opens existing category route with 40/page pagination preserved

---

## Phase 4 — Premium station cards

**File:** `components/radio/RadioBrowserCards.tsx`

- **`RadioStationRailCard`** — home horizontal cards with logo, title, country/genre, quality label
- **`RadioStationCard variant="premium"`** — larger art (64px), meta chips for country / language / genre / bitrate
- **`stationQualityLabel()`** in `radioNormalizer.ts` — e.g. `128k MP3`
- **`RadioStationListItem`** extended with `language`, `bitrate`, `codec`, `qualityLabel`

---

## Phase 5 — Heat investigation

**Diagnostics:** `utils/radioDiscoveryDiagnostics.ts`  
Instrumented in:

- `services/radio/radioBrowserApi.ts` — logs each network page fetch
- `hooks/useRadioHomeDiscovery.ts` — logs home mount
- `app/stations/[categoryId].tsx` — logs category mount

### Fetch findings (evidence-based)

| Pattern | Risk | Mitigation applied |
|---------|------|-------------------|
| Home opens with 10 category taps possible | High (10× full page loads) | Single featured fetch + availability probes (limit=1) |
| Browse availability probes on first visit | Medium (~7 small requests) | Cache-first probe, concurrency=2, 30min TTL |
| `topvote` pagination growth | Medium on deep scroll | Unchanged — 40/page preserved; documented |
| Triple server failover (de/nl/at) | Medium on failure | Unchanged — existing 12s timeout |
| `useMatureContentSettings` per row art | Low re-render cost | Unchanged — memo cards |
| Universal search deferred radio | Low (480ms defer) | Unchanged — separate from radio home |

### Rerender findings

- Home uses horizontal `FlatList` rails with `initialNumToRender={4}`, `removeClippedSubviews`
- Category lists use existing `getListPerformanceSettings`
- Diagnostics capture render bursts >3 within 500ms per surface

### Recommended follow-up (not blocking)

- Backend index to replace client-side Radio Browser probes at scale
- Move `@react-navigation/native` off direct deps (expo-doctor advisory)

---

## Phase 6 — Search

**File:** `app/stations/search.tsx`

- Unchanged cache-first `useLazyRadioStationList` + 350ms debounce
- Premium station cards in results
- Search returns live stations via Radio Browser name search (max 200)
- Does not block main music search (separate route)

---

## Remaining blockers

| Blocker | Status |
|---------|--------|
| Radio Browser tag inconsistency | Mitigated via probes + improved tags |
| No dedicated “recent radio” UI outside home rail | Recently played rail on home |
| Client-side catalog at 100k scale | Documented in `media-scale-architecture.md` — backend index future |

---

## Files changed

- `constants/radioCategories.ts` — tiers, tag fixes, emotional merge
- `constants/radioEmotionalWorlds.ts` — new
- `services/radio/radioCategoryAvailability.ts` — new
- `services/radio/recentlyPlayedRadio.ts` — new
- `services/radio/radioBrowserApi.ts` — fetch diagnostics
- `services/radio/radioNormalizer.ts` — quality labels
- `hooks/useRadioHomeDiscovery.ts` — new
- `utils/radioDiscoveryDiagnostics.ts` — new
- `components/radio/RadioBrowserCards.tsx` — premium + world cards
- `app/stations/index.tsx` — premium home
- `app/stations/[categoryId].tsx` — empty redirect, premium cards
- `app/stations/search.tsx` — premium cards
- `types/radio.ts` — list item metadata

---

## Validation

- [x] `npm run typecheck` — pass
- [ ] Manual: every visible category has stations
- [ ] Manual: no “Nothing here yet” on radio category pages
- [ ] Manual: home rails populated from real featured fetch
- [ ] Manual: emotional worlds visible when tags match
- [ ] Manual: scrolling smooth, no heat spike on home open
