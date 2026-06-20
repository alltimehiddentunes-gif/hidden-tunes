# Phase 4 Video Discovery Audit

**Scope:** Planning and audit only. No implementation in this queue. No playback, queue, Desktop, CarPlay, or Android Auto changes. No UI redesign. No YouTube clone — users see **Hidden Tunes videos** only.

**Goal:** Prepare **Video Discovery** safely for launch using the existing admin TV catalog + WebView embed architecture, without touching native audio playback.

---

## Executive summary

Video discovery in the mobile app is **~75% wired** through a curated **Hidden Tunes TV catalog** served from `admin.hiddentunes.com`, not through the client-side YouTube Data API (which is **disabled**). Playback uses a **separate WebView owner** (`/youtube-player`) that stops native audio on entry.

Two parallel “YouTube” layers exist and must stay separated:

| Layer | Data source | Discovery UI | Playback | Status |
|-------|-------------|--------------|----------|--------|
| **Hidden Tunes TV (primary)** | `GET /api/tv/videos` → Supabase `tv_videos` | TV tab, Search “TV” chip → `/tv` | WebView embed | **Primary launch path** |
| **YouTube Data API client** | `services/youtubeBackend.ts` | Legacy flat search / radio fallback | WebView if tracks exist | **Disabled** (`YOUTUBE_DATA_API_ENABLED = false`) |

**Rule:** Video discovery and WebView playback stay **separate** from `playSong` / `activeQueue` / `HiddenAudio`. Do not route TV metadata into the native music queue without a dedicated design review.

**Launch gap:** Five planned launch categories are not yet represented as first-class TV lanes. Only **Live Performances** exists today (as one of eight genre/mood lanes). Backend taxonomy alignment and admin curation are the main blockers — not new client infrastructure.

---

## 1. Existing YouTube / TV discovery backend

### Client: `services/youtubeBackend.ts`

| Export | Role | Wired? |
|--------|------|--------|
| `BackendYouTubeTrack` | Legacy track shape (`sourceName: "YouTube"`) | Search normalize, radio fallback, dead paths |
| `searchYouTubeBackend()` | Google YouTube Data API v3 | **Returns `[]`** — gated by `YOUTUBE_DATA_API_ENABLED = false` |
| `checkYouTubeBackendStatus()` | Health probe | Reports “TV uses WebView discovery” when disabled |
| `extractYouTubeId()` | ID parsing | Shared pattern with player + TV |

**Launch stance:** Keep disabled. All launch video metadata should flow through **admin TV catalog**, not client YouTube API keys (quota, branding, App Store scrutiny).

### Client: `services/tvCatalogApi.ts` (primary backend)

| Export | Role |
|--------|------|
| `TV_CATALOG_BASE_URL` | `https://admin.hiddentunes.com` |
| `fetchTvCatalog(query)` | `GET /api/tv/videos` with `page`, `limit`, `q`, `genre`, `mood`, `format`, `category` |
| `fetchTvHomeLanes()` | Parallel fetch of `TV_PREMIUM_LANES` (8 lanes), saves home cache |
| `loadTvHomeCache()` / `saveTvHomeCache()` | AsyncStorage `hidden_tunes_tv_home_cache_v1`, **12h TTL** |
| `buildTvPlayerQueue()` / `buildTvPlayerQueueItem()` | Maps `HiddenTunesTvVideo` → player queue JSON |
| `HiddenTunesTvVideo` | Normalized public video model |
| `TV_PREMIUM_LANES` | Current home lanes (Featured, genre lanes, Documentaries, Live Performances) |

### Server: `hidden-tunes-backend/hidden-tunes-admin/app/api/tv/videos/route.ts`

Public read API over Supabase `tv_videos`:

- Filters: `status = approved`, `is_active = true`, `playback_status = playable`
- Query params: `page`, `limit` (max 50), `q`, `category`, `genre`, `mood`, `format` (all `ilike`, exact value)
- Search: `title` OR `channel_name` ilike
- Order: `created_at DESC` (no dedicated “trending” sort yet)

Admin ingestion uses oEmbed + optional YouTube Data API on **server only** (`lib/tvCatalog.ts`: `fetchYouTubeOEmbedMetadata`, keyword inference for category/genre/mood/format).

### Taxonomy mismatch risk (backend data)

Admin inference uses singular values (e.g. `"Live Performance"`, `"Music Video"`, `"Documentary"`), while client lanes use plural labels (e.g. `format: "Live Performances"`, `format: "Documentaries"`). Supabase `ilike` without wildcards is **case-insensitive exact match** — mismatched strings yield **empty lanes**.

**Requirement before launch:** Normalize canonical `category` / `format` values in admin and match client lane queries exactly.

---

## 2. Existing video metadata files / functions

### Reusable (keep and extend)

| File | Key symbols | Use for Phase 4 |
|------|-------------|-----------------|
| `services/tvCatalogApi.ts` | `fetchTvCatalog`, `fetchTvHomeLanes`, cache helpers, `buildTvPlayerQueue` | All discovery + player handoff |
| `services/universalSearchService.ts` | `searchTv`, `runUniversalCatalogSearch`, **`flattenTvHomeCache`** (unused) | In-app TV search ranking; flatten cache for offline subset |
| `services/instantCatalogSearch.ts` | `searchTvFast`, instant grouped TV hits | Type-ahead when TV corpus is injected |
| `utils/youtubeDiscovery.ts` | `getYouTubeVideoId`, `isYouTubeDiscoveryTrack`, `openYouTubeDiscoveryTrack` | Legacy open helpers — **rebrand fallbacks** before wider use |
| `utils/openYouTubeVideo.ts` | Deep link helper | Audit for branding if surfaced |
| `components/tv/TvVideoCard.tsx` | Card UI | Lane + search grids |
| `components/EmotionalDiscoveryChips.tsx` | `SubtleTvEntryLink` | Home / Explore / Search entry → `/tv` |
| `components/UniversalSearchGroupedResults.tsx` | TV section renderer | Ready when TV hits are not stripped |
| `constants/youtube.ts` | Config stub | Keep client API off |

### Legacy / dead-adjacent (do not expand for launch)

| File | Issue |
|------|-------|
| `services/youtubeBackend.ts` | Client YouTube API — disabled; `sourceName: "YouTube"` leaks branding |
| `services/radioEngine.ts` | YouTube-only radio queue — no UI; separate from TV catalog |
| `app/radio.tsx` | Catalog first; **YouTube API fallback** when zero songs — returns empty today but still calls disabled API |
| `search.tsx` `normalizeYouTubeResult` / `isYouTubeTrack` | Legacy flat list path; not fed when API disabled |

### Player handoff model

```text
HiddenTunesTvVideo
  → buildTvPlayerQueue(videos)
  → router.push("/youtube-player", { queue: JSON, videoId, title, artist, thumbnail })
  → stopPlayback() before navigate (search + TV tab)
```

Thumbnail fallback uses `i.ytimg.com` / `img.youtube.com` CDN URLs — acceptable for assets, not UI branding.

---

## 3. Existing TV / video discovery screens

### `app/(tabs)/tv.tsx` — Hidden Tunes TV tab

| Behavior | Detail |
|----------|--------|
| Home | `loadTvHomeCache()` → paint lanes → `fetchTvHomeLanes()` refresh |
| Lanes | Horizontal `FlatList` per lane from `TV_PREMIUM_LANES` |
| Search | Debounced `fetchTvCatalog({ q, page, limit: 20 })`, pagination |
| Deep link | `?q=` / `?query=` from Search TV chip redirect |
| Open video | `buildTvPlayerQueue` → `/youtube-player` |
| Copy | “Hidden Tunes TV”, channel fallback `"Hidden Tunes TV"` |

**Not launch-aligned:** Home lanes emphasize genre/mood (Blues, Jazz, Gospel…) and Documentaries — not the five launch video categories.

### `app/youtube-player.tsx` — WebView video owner

| Behavior | Detail |
|----------|--------|
| Engine | `react-native-webview` + iframe embed (`modestbranding=1`, `rel=0`) |
| Origin | `PRIMARY_EMBED_ORIGIN = https://hiddentunes.com` |
| Audio isolation | `stopPlayback()` on mount — **does not** use `HiddenAudio` / `playSong` |
| Queue | JSON param; auto-next within WebView queue only |
| Mini state | AsyncStorage `hidden_tunes_current_youtube` |
| Navigation guard | Blocks `youtube://`, `intent://`, external schemes |
| Residual branding | Fallback artist `"YouTube"`; iframe title “Hidden Tunes TV” (good) |

### Entry points (discovery only)

| Surface | Path |
|---------|------|
| TV tab | `(tabs)/tv` |
| `SubtleTvEntryLink` | Home, Explore, Search footer |
| Search filter chip `{ key: "youtube", label: "TV" }` | Submit → `/tv?q=` |
| Universal grouped TV section | Component exists; **hits stripped in main search** (see §4) |

---

## 4. Existing search integration

### What works

| Path | Behavior |
|------|----------|
| Search chip **“TV”** | On submit: `saveTvDiscoveryQuery` → `router.push("/tv", { q })` |
| TV tab search | Full catalog search with pagination |
| `fetchTvCatalog` while typing | When `activeSource === "youtube"`, debounced 500ms, limit 40 → `tvSearchVideos` |
| `openGroupedTv` | Opens player with `stopPlayback()`; wired to `UniversalSearchGroupedResults.onTvPress` |
| TV discovery history | AsyncStorage `hidden_tunes_tv_discovery_queries_v1` |

### Gaps / bugs (planning fixes, not implemented here)

1. **`groupedForUniversalSearch` strips TV** — When `showGroupedSearch` is true (normal typed search), `tv: []` and topResults filter removes `tv:` ids. TV hits are computed in `instantGroupedResults` but **never shown** in grouped UI.
2. **TV chip + grouped search mismatch** — User can select TV filter and type, but inline grouped TV section is empty; only submit redirect works.
3. **`searchWaterfall.ts`** — Songs only; no TV. Correct for launch (keep separate).
4. **Legacy YouTube flat list** — `activeSource === "youtube"` filters `listResults` to `isYouTubeTrack` items that never populate (API off).
5. **Branding leaks** — `openGroupedTv` uses `"YouTube"` channel fallback; `BackendYouTubeTrack.sourceName: "YouTube"`; MiniPlayer “YouTube Video” / badge “YouTube”.

### Reusable search wiring (target architecture)

```text
Search (All) ──optional TV section──► openGroupedTv ──► youtube-player
Search (TV chip) ──submit──► /tv?q=
Search (TV chip) ──type-ahead──► fetchTvCatalog OR flattenTvHomeCache subset
TV tab ──lanes/search──► youtube-player
```

Do **not** merge TV into `playSong` queue or `searchWaterfall` song pipeline.

---

## 5. Existing WebView / video playback behavior

### Separation from native audio (preserve)

| Concern | Current behavior | Launch requirement |
|---------|------------------|-------------------|
| Native audio | Stopped on video enter | **Keep** |
| Music queue | Unaffected by WebView queue | **Keep** |
| Mini player | Shows song OR YouTube mini from AsyncStorage | Keep dual mode; rebrand YouTube copy |
| Auto-next | WebView queue only | **Keep** separate from `activeQueue` |
| Background | WebView behavior OS-dependent | Document limitation; no fake “audio-only” parity |

### Embed safety (already present)

- Allowed URL allowlist for embed + googlevideo + ytimg
- Blocked external app schemes
- 12s embed timeout → skip to next queue item
- Fallback embed origin if primary fails

### Out of scope (per queue rules)

Do not change playback engine, queue tab, CarPlay, Android Auto, or Desktop in Phase 4.

---

## 6. Backend metadata cache

### Existing client caches

| Key | TTL | Contents | Owner |
|-----|-----|----------|-------|
| `hidden_tunes_tv_home_cache_v1` | 12h | 8 lane snapshots | `tvCatalogApi` |
| `hidden_tunes_tv_discovery_queries_v1` | None | Recent TV search strings | `search.tsx` |
| `hidden_tunes_current_youtube` | Session | Mini player video JSON | `youtube-player` / MiniPlayer |

### Server-side (admin)

- Supabase `tv_videos` with `playback_status`, `is_featured`, tags, category/format/genre/mood
- oEmbed refresh on import; no client polling of YouTube

### Recommended cache strategy (launch)

| Layer | Strategy | Rationale |
|-------|----------|-----------|
| TV home lanes | Keep 12h AsyncStorage; **stagger** lane network fetches (2–3 concurrent max) | Today: 8 parallel requests on every cold refresh → heat + burst |
| Launch category lanes | Single config array (5 lanes); optional server-side “home bundle” endpoint later | Reduces 8+5 parallel calls |
| TV search results | Short TTL memory cache keyed by `q+page` (5–10 min); no unbounded map | Avoid repeat typing cost |
| Search type-ahead corpus | Use `flattenTvHomeCache()` + cap **≤240 videos** (align `MAX_SCREEN_CATALOG_SONGS` pattern) | Instant local TV match without network per keystroke |
| Thumbnails | `expo-image` disk cache; session prefetch cap already exists globally | Avoid duplicate CDN fetches |
| Invalidation | Refresh home on TV tab focus only if TTL expired | Matches Phase 2/3 “no hot polling” |

**Do not** enable client YouTube Data API caching as a substitute for admin catalog.

---

## 7. Recommended architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Hidden Tunes Admin                        │
│  tv_videos (approved, playable) + curated category/format   │
│  oEmbed / server YouTube API (ingest only)                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ GET /api/tv/videos
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              services/tvCatalogApi.ts (client)               │
│  fetchTvCatalog · fetchTvHomeLanes · cache · queue builder   │
└───────────────┬─────────────────────────┬───────────────────┘
                │                         │
        ┌───────▼────────┐       ┌────────▼─────────┐
        │  TV tab lanes   │       │  Search TV paths  │
        │  + search       │       │  chip → /tv       │
        └───────┬────────┘       │  optional inline  │
                │                └────────┬─────────┘
                └────────────┬───────────┘
                             │ buildTvPlayerQueue + stopPlayback()
                             ▼
                ┌────────────────────────────┐
                │   app/youtube-player.tsx    │
                │   WebView embed (isolated)  │
                └────────────────────────────┘

        ┌────────────────────────────┐
        │  Native audio (unchanged)   │
        │  HiddenAudio · playSong     │
        └────────────────────────────┘
              ✕ no shared queue ✕
```

**Principles**

1. **Curated catalog in, embed out** — Users discover Hidden Tunes videos; YouTube is transport only inside WebView.
2. **One config source for lanes** — `TV_PREMIUM_LANES` → evolve to `TV_LAUNCH_LANES` + optional genre lanes; avoid duplicate fetches.
3. **Search: redirect OR inline, not both half-wired** — Either show TV grouped section on “All” search with cached corpus, or keep TV chip as `/tv`-only (simplest for launch).
4. **No client YouTube API** — Server/admin owns metadata quality and playback_status.
5. **Copy audit** — Replace user-visible “YouTube” with “Hidden Tunes TV” / channel name; keep internal route filename `youtube-player` if needed (not user-visible).

---

## 8. Video category tree (launch)

Planned launch categories mapped to admin fields:

```text
Hidden Tunes TV
├── Music Videos          → format: "Music Video"     (+ category: "Music" optional)
├── Live Performances     → format: "Live Performance"  (align singular/plural — see §1)
├── Artist Videos         → format: "Artist Video" OR category: "Artist" (new canonical value)
├── Trending Videos       → is_featured + recent published_at OR new sort=trending API param
└── Concert Videos        → format: "Concert" OR tags include "concert" (define one canonical field)
```

### Current `TV_PREMIUM_LANES` (keep or demote post-launch)

| Lane id | Title | Query | Maps to launch? |
|---------|-------|-------|-----------------|
| featured | Featured Now | page 1 | Overlaps **Trending** (needs featured flag or sort) |
| recent | Recently Added | page 2 | Discovery filler, not a launch category |
| blues / afro-soul / jazz / gospel | Genre lanes | genre filter | Keep as secondary rows below launch five |
| documentary | Documentary Nights | format: Documentaries | Taxonomy mismatch risk |
| live | Live Performances | format: Live Performances | **Launch category** (fix format string) |

### Backend data requirements for five launch lanes

| Launch category | Minimum admin work |
|-----------------|-------------------|
| Music Videos | Curate ≥12 playable rows with canonical `format = "Music Video"` |
| Live Performances | Align DB values with lane filter; ≥12 rows |
| Artist Videos | Define canonical field; tag interviews, BTS, vlogs separately from music videos |
| Trending Videos | **`is_featured = true`** and/or API `sort=trending` (views proxy = recent + featured today) |
| Concert Videos | Distinct from “Live Performance” (full concert vs single song live) — admin guidelines doc |

**API gap:** No `sort` param today — Trending may need `order(is_featured desc, published_at desc)` or dedicated endpoint `GET /api/tv/home`.

---

## 9. App review risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| YouTube ToS / embed-only | High | In-app WebView embed only; no download; no stripping ads UI beyond modest branding; curated catalog not arbitrary user-generated URL paste |
| Misleading “music streaming” | Medium | App Store copy: native audio = licensed/catalog songs; TV = video section; separate tab |
| Third-party branding | Medium | Remove user-visible “YouTube” strings; no YouTube logo in marketing screenshots |
| WebView-only video “background play” | Low | Do not claim parity with native audio background modes |
| Kids / explicit content | Medium | Admin approval gate (`status = approved`) before public API |
| Link-out to YouTube app | Low | Already blocked via scheme filter |
| API key in client | N/A | YouTube Data API disabled on client — good |

**Guideline 4.2 (minimum functionality):** TV tab must ship with **non-empty launch lanes** — empty catalog is a rejection risk for a advertised feature.

---

## 10. Performance and device heat risks

| Risk | Source | Mitigation |
|------|--------|------------|
| 8 parallel catalog requests on TV home refresh | `fetchTvHomeLanes` `Promise.all` | Stagger/concurrency limit; bundle endpoint |
| WebView + native audio overlap | User switches song while video open | Already stops audio on enter; ensure focus/blur does not restart audio under video |
| Large search TV fetch (limit 40) per debounced keystroke | Search `activeSource === youtube` | Rate-limit; reuse search cache; prefer redirect-only for v1 |
| MiniPlayer polling YouTube state | `setInterval` in MiniPlayer | Keep interval modest; already gated when `currentSong` present |
| Memory: unbounded TV arrays | Lane + search lists | Cap visible rows per lane (12–20); paginate search |
| Image CDN burst | ytimg thumbnails on horizontal lanes | `expo-image` recyclingKey on `TvVideoCard` — already set |
| Dead YouTube API calls from radio fallback | `app/radio.tsx` | Returns empty but still schedules work — remove in separate queue (Phase 3) |

---

## 11. Safest implementation order

No code in this queue — recommended sequence for a future build phase:

1. **Backend taxonomy + content** — Canonical `format` / `category` values; populate ≥12 videos per launch category; fix singular/plural mismatches; mark trending via `is_featured`.
2. **Admin QA** — Verify `playback_status = playable` for all launch rows; reject embed-blocked items before client sees them.
3. **Client lane config only** — Add five launch lanes to `TV_PREMIUM_LANES` (or replace featured/recent); **no UI redesign** — same horizontal lane pattern.
4. **Cache hardening** — Stagger lane fetch; optional search result TTL; wire `flattenTvHomeCache` for offline type-ahead corpus (capped).
5. **Search integration decision** — **Option A (safest):** TV chip stays redirect-only; remove dead inline TV fetch on Search. **Option B:** Stop stripping `tv` in `groupedForUniversalSearch` when TV corpus present; keep separate `onTvPress` path.
6. **Branding pass (copy only)** — `openGroupedTv`, MiniPlayer, `openYouTubeDiscoveryTrack`, `BackendYouTubeTrack.sourceName` display strings → “Hidden Tunes TV”.
7. **Playback verification** — Confirm `stopPlayback` on all TV entry paths; regression test native queue unchanged.
8. **Performance pass** — Measure TV tab cold start with staggered fetch; confirm no new work on Home/Explore song paths.
9. **App review package** — Screenshots labeled Hidden Tunes TV; review notes describing curated embed catalog vs native streaming.

**Explicitly defer:** Client YouTube Data API, YouTube-clone browse UI, merging TV into music queue, radio YouTube fallback expansion, Desktop/CarPlay/Android Auto video.

---

## 12. Reusable files checklist (quick reference)

| Area | Files |
|------|-------|
| Catalog API | `services/tvCatalogApi.ts` |
| Search ranking | `services/universalSearchService.ts`, `services/instantCatalogSearch.ts` |
| Search UI | `app/(tabs)/search.tsx`, `components/UniversalSearchGroupedResults.tsx` |
| TV screen | `app/(tabs)/tv.tsx`, `components/tv/TvVideoCard.tsx` |
| Player | `app/youtube-player.tsx` |
| Entry | `components/EmotionalDiscoveryChips.tsx` (`SubtleTvEntryLink`) |
| Legacy helpers | `utils/youtubeDiscovery.ts`, `services/youtubeBackend.ts` (disabled) |
| Server | `hidden-tunes-admin/app/api/tv/videos/route.ts`, `lib/tvCatalog.ts` |
| Native audio (untouched) | `context/PlayerContext.tsx`, `modules/HiddenAudio.ts`, `services/hiddenAudioEngine.ts` |

---

## 13. Validation (this queue)

- [x] Audit only — no feature implementation
- [x] No playback / queue / Desktop / CarPlay / Android Auto changes
- [x] Documents reusable architecture for five launch video categories
- [ ] Future build queues: backend taxonomy → lane config → search decision → branding → QA

**Related audits:** [Phase 2 discovery](./phase-2-discovery-audit.md), [Phase 3 radio browser](./phase-3-radio-browser-audit.md), [Launch stability](./launch-stability-audit.md), [Memory + battery safety](./memory-battery-safety-audit.md).
