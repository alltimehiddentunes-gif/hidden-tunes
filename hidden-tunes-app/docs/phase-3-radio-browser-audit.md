# Phase 3 Radio Browser Audit

**Scope:** Planning and audit only. No implementation in this queue. No playback, queue, Desktop, CarPlay, or Android Auto changes. No UI redesign. No provider branding — users see **Hidden Tunes stations** only.

**Goal:** Prepare a **Radio Browser** (live station discovery) safely for launch without risking existing song playback, search, or device heat.

---

## Executive summary

Today, “radio” in the mobile app means **curated song queues** discovered via catalog search (and YouTube/TV fallback), **not** live internet radio stations. There is **no** Radio Browser API client, station model, or continuous stream playback path.

Two parallel “radio” systems exist and are **not integrated**:

| System | Purpose | Playback | Status |
|--------|---------|----------|--------|
| **`app/radio.tsx`** | Song “Listening Room” from `searchHiddenTunesSongs` | `playSong` → `activeQueue` | **Primary wired path** |
| **`services/radioEngine.ts` + PlayerContext** | YouTube-shaped `radioQueue` / `radioMode` | **Does not play audio** | State-only; UI labels only |

Phase 3 must **split** these concerns explicitly:

```
Song Listening Rooms (keep, improve wiring)     →  /radio  →  catalog search  →  playSong
Live Radio Browser (net-new)                    →  /stations  →  station list cache  →  stream player (future, separate owner)
```

**Rule:** Station discovery stays **separate** from native on-demand song playback. Do not route live streams through `playSong` / `activeQueue` auto-next without a dedicated design review.

---

## 1. Existing radio engine files

### `services/radioEngine.ts`

| Export | Role | Wired? |
|--------|------|--------|
| `RadioTrack` | YouTube-only shape (`source: "youtube"`, no `streamUrl`) | Used by PlayerContext |
| `buildRelatedRadioQueue(seed)` | 3× `searchYouTubeBackend` queries | PlayerContext `startRadio` — **no UI caller** |
| `buildPersonalRadioQueue()` | Generic YouTube queries (“trending afrobeats…”) | PlayerContext `startPersonalRadio` — **no UI caller** |
| `extendRadioQueue()` | Appends related YouTube tracks | `playNextRadioTrack` — **never called** |
| `saveRadioQueue` / `loadRadioQueue` | AsyncStorage `hidden_tunes_radio_queue_v1` | Restored on boot |
| `createRadioSession`, `expandRadioSession`, `getNextRadioTrack`, `recoverRadioSession` | Session lifecycle | **Dead** — not imported elsewhere |
| `saveRadioSession` / `loadRadioSession` | AsyncStorage `hidden_tunes_radio_session_v2` | **Dead** |
| `guessGenre` / `guessMood` | Keyword heuristics | Duplicates `musicNormalizer`; session API only |

**Data source:** exclusively `searchYouTubeBackend()` — no Hidden Tunes catalog, **no live station URLs**.

### `app/radio.tsx` — Song Listening Room screen

| Behavior | Detail |
|----------|--------|
| Params | `title`, `artist`, `genre`, `mood`, `query` |
| Load | Sequential loop: up to **8 deduped terms** × `searchHiddenTunesSongs()` each |
| Fallback | If zero catalog hits → 3× parallel `searchYouTubeBackend` → routes to `/youtube-player` |
| Play (catalog) | `playSong(normalized, queue, index)` → `/player` |
| Play (YouTube) | JSON queue param to `/youtube-player` — **separate playback owner** |
| Does **not** use | `radioEngine`, `startRadio`, `getPersonalRadioSongs`, recently-played seed |

**UX copy:** “Curating your station…”, “tracks ready”, fallback “TV videos ready” — song/TV discovery language, not live broadcast.

### `context/PlayerContext.tsx` — parallel radio state

| API / state | Behavior | Risk |
|-------------|----------|------|
| `startRadio` / `startPersonalRadio` | Sets `radioMode`, `radioQueue`, persists | **Never called from UI** |
| `playNextRadioTrack` | Extends queue, updates index | **Never called**; auto-next uses `activeQueue` only |
| `playRadioAtIndex` | Index + persist only | **Does not load/play audio** |
| `radioMode`, `radioQueue`, `radioIndex` | Restored on boot | MiniPlayer can show “Radio queue” while audio is standard queue |
| `playSong` / `playQueue` | Clears `radioMode` | Accidental mutual exclusion with engine radio |

`ActiveQueueMode` includes `"radio"`, but **`syncActiveQueue(..., "radio")` is never set at runtime** — queue tab radio labels are mostly inert.

---

## 2. Existing smart radio helpers

| Module | Function | Radio relevance | Status |
|--------|----------|-----------------|--------|
| `services/smartRelatedEngine.ts` | `getPersonalRadioSongs()` | Recent-play seed → YouTube search | **Dead** — no callers |
| `services/smartRelatedEngine.ts` | `getSmartRelatedSongs()` | YouTube similar search | **Dead** |
| `services/smartQueue.ts` | `getRelatedTracks()` | Smart autoplay (genre/mood/artist) | **Not radio** — uses in-memory library |
| `services/smartDiscovery.ts` | “Listening rooms” copy | Discovery sections only | Routes to `/genre`, not stations |
| `services/radioEngine.ts` | Queue builders | YouTube-only engine radio | Orphaned from UI |

**Personal radio today (3 divergent paths):**

1. Profile → `/radio` with **no params** (generic empty query)
2. `PlayerContext.startPersonalRadio()` — uncalled
3. `getPersonalRadioSongs()` — uncalled

**Phase 3 note:** Personalization for **song** listening rooms can reuse `buildRecommendationSeedFromRecent()` without touching live station browser.

---

## 3. Recently played logic

### `services/recentlyPlayedEngine.ts`

| Function | Role |
|----------|------|
| `addToRecentlyPlayed(song)` | Called from `PlayerContext` on every play (max 60 entries) |
| `buildRecommendationSeedFromRecent(tracks)` | Top artists/titles → “{seed} similar songs” |
| `getTopRecentlyPlayed()` | Ranking helper |

**Radio session interaction:** **None.** `HiddenTunesRadioSession` is never persisted from playback.

When user plays from `/radio` via `playSong`, tracks **do** enter recently played through normal side effects — useful for seeding **song** radio, not station favorites.

**Gap for Radio Browser:** Need separate **`favoriteStations`** / **`recentStations`** storage — do not mix with song recently played (avoid queue pollution and wrong recommendations).

---

## 4. Genre / mood metadata (category chrome)

| Source | Location | Usable for station categories? |
|--------|----------|----------------------------------|
| `CORE_GENRE_DEFINITIONS` | `utils/genreAliases.ts` | **Yes** — Country, Gospel, Afrobeats, Jazz, Classical |
| `guessGenreFromText` / `guessMoodFromText` | `services/musicNormalizer.ts` | `/radio` pill fallback |
| `PREMIUM_MOOD_ROOMS` | `utils/moodRooms.ts` | **Mood Radio** category mapping |
| `MOOD_TAGS` (layer 3) | `utils/genreAliases.ts` | Optional tag filters (not UI-exposed today) |
| Route params `genre`, `mood` | `/radio?...` | Song search term expansion |

**No existing taxonomy for:** News, Global (by definition), Location (country/region). These need **station tag maps**, not catalog genre fields.

---

## 5. Backend / API options

| Option | Current state | Phase 3 fit |
|--------|---------------|-------------|
| **`searchHiddenTunesSongs(q)`** | `GET /api/songs?q=` — wired in `/radio` | **Song Listening Rooms only** — not live stations |
| **Hidden Tunes admin API — stations** | **Not found** in `hiddenTunesApi.ts` | Ideal long-term: curated station list branded Hidden Tunes |
| **Radio Browser API** (`api.radio-browser.info`) | **Absent** from codebase | Standard OSS station directory; **must proxy** via backend (CORS, rate limits, branding) |
| **`tvCatalogApi.ts`** | TV videos by genre/mood | **TV tab only** — do not conflate with radio |
| **`searchYouTubeBackend`** | Fallback in `/radio`; sole `radioEngine` source | Keep for song/TV fallback; **not** live radio |
| **Archive / Audius / Jamendo** | Search waterfall only | No radio/station integration |

**`streamUrl` today:** Finite Hidden Tunes **track** URLs via `playSong`. Live stations need **indefinite stream URLs** (HLS/MP3/Icecast) — new type, new playback owner (out of scope for playback changes in this audit; plan separation only).

**Recommended backend path:**

1. **Launch:** Proxy Radio Browser (or self-hosted mirror) through `admin.hiddentunes.com/api/radio/...` — normalize to `HiddenTunesStation` with `sourceName: "Hidden Tunes"`.
2. **Later:** Admin-curated station allowlist per category (quality control, regional compliance).
3. **Keep separate:** Catalog song search for `/radio` listening rooms — no merge with station list API.

---

## 6. Screens where radio should appear

### Already wired (song listening rooms)

| Entry | Path | Behavior |
|-------|------|----------|
| **Radio screen** | `app/radio.tsx` | Main song queue UI |
| **Genre hub** | `app/genre.tsx` | “{title} Listening Room” → `/radio?title=&query=` |
| **Search** | `app/(tabs)/search.tsx` | “Start a mood radio” card → `/radio` |
| **Artist** | `app/artist.tsx` | “{artist} Radio” → `/radio` |
| **Profile** | `app/(tabs)/profile.tsx` | “Personal Radio” → `/radio` (no seed) |

### Partial / misleading

| Surface | Issue |
|---------|-------|
| **MiniPlayer / Player** | “Radio queue” / “RADIO MODE” from orphaned `radioMode` |
| **Queue tab** | `activeQueueMode === "radio"` labels — never set at runtime |
| **Search “Listening Rooms”** | **Cloud playlists**, not radio browser |
| **Explore “Enter a listening room”** | Smart autoplay hero — not `/radio` |
| **MediaCard `type="radio"`** | Icon for YouTube/TV rows — not stations |

### Planned Radio Browser surfaces (Phase 3 — not built)

| Surface | Recommendation |
|---------|----------------|
| **New tab or Profile section** | “Hidden Tunes Radio” → station category browser |
| **Home / Explore footer** | Category chips → station list (not `/radio` song screen) |
| **Search empty state** | “Browse live stations” → category root |
| **Keep `/radio`** | Rename in copy to **Listening Room** where needed to avoid confusion with live stations |

**Do not** replace TV tab with radio — TV remains video discovery.

---

## 7. Risks (playback, queue, search, heat)

### Playback & queue

| Risk | Severity | Mitigation |
|------|----------|------------|
| Live stream routed through `playSong` + auto-next | **Critical** | Separate stream player; exclude from `scheduleTrackAdvance` |
| `radioQueue` vs `activeQueue` dual persistence | **High** | Do not extend engine radio for stations; consolidate or deprecate dead APIs |
| YouTube `/radio` fallback vs `PlayerContext.youtubeQueue` | **Medium** | Keep TV path isolated; station browser must not use YouTube player |
| `playSong` from `/radio` clears `radioMode` | **Low** | Document; fix only if wiring song radio + engine radio together |

### Search & catalog

| Risk | Severity | Mitigation |
|------|----------|------------|
| Station search mixed into `searchHiddenTunesSongs` | **High** | Dedicated station search endpoint + index |
| Radio Browser queries on every keystroke | **Medium** | Debounce + cache (mirror `searchQueryCache`) |

### Heat & performance

| Risk | Source | Mitigation |
|------|--------|------------|
| **Sequential multi-query load** | `/radio` `loadRadio()` — up to 8× `searchHiddenTunesSongs` per open | Cap terms; parallelize with limit; cache results by query key |
| **Reload on param change** | `useEffect([query, artist, genre, mood])` | Debounce; stale-while-revalidate |
| **No list pagination** | Full result set in memory | Paginate station lists; virtualize FlatList |
| **Live polling** | None today for radio | **Forbidden** for Phase 3 — TTL cache + pull-to-refresh only |
| **Background sync** | N/A | No interval polling for station metadata |
| **PlayerContext HiddenAudio poll** | Unchanged by radio browser | Station stream must not add second poll loop |

### Branding

| Risk | Mitigation |
|------|------------|
| “TV videos ready” in `/radio` fallback | Hidden Tunes copy only in station browser; song room can stay as-is until copy pass |
| Radio Browser station names exposing upstream | Normalize display names; `sourceName: "Hidden Tunes"` always |

---

## Reusable existing files & functions

### Song listening rooms (keep)

| Symbol | File |
|--------|------|
| `RadioScreen` / `loadRadio`, `openCloudTrack` | `app/radio.tsx` |
| `searchHiddenTunesSongs` | `services/hiddenTunesApi.ts` |
| `guessGenreFromText`, `guessMoodFromText` | `services/musicNormalizer.ts` |
| `playSong` | `context/PlayerContext.tsx` |
| `TESTER_COPY.radioLoadFailed` | `constants/testerExperience.ts` |

### Navigation patterns

| Symbol | File |
|--------|------|
| Genre hub → radio card | `app/genre.tsx` |
| Search mood radio CTA | `app/(tabs)/search.tsx` |
| Profile personal radio | `app/(tabs)/profile.tsx` |

### Personalization (wire later for song radio)

| Symbol | File |
|--------|------|
| `buildRecommendationSeedFromRecent` | `services/recentlyPlayedEngine.ts` |
| `getPersonalRadioSongs` | `services/smartRelatedEngine.ts` |

### Caching patterns to copy (station lists)

| Symbol | File |
|--------|------|
| `getCachedSearchResults` / `setCachedSearchResults` | `utils/searchQueryCache.ts` |
| `viewCache` + TTL | `services/unifiedCatalog.ts` |
| In-flight dedup | `services/hiddenTunesApi.ts` |

### UI reuse (premium, no redesign)

| Component | File |
|-----------|------|
| `MediaCard` (`type="radio"` icon) | `components/MediaCard.tsx` |
| Genre/mood pills, gradients | `app/radio.tsx`, `MoodRoomCard.tsx` |
| `shouldShowCatalogEmpty` timing | `utils/catalogEmptyStateTiming.ts` |

### Deprecate or quarantine (before station launch)

| Item | Reason |
|------|--------|
| `startRadio` / `startPersonalRadio` / `playNextRadioTrack` | Orphaned; confuses queue UI |
| `HiddenTunesRadioSession` session APIs | Dead code |
| `activeQueueMode: "radio"` without runtime set | Misleading queue copy |

---

## Recommended architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Hidden Tunes Radio (UI)                        │
│  All stations presented as Hidden Tunes — no provider branding   │
└───────────────────────────┬─────────────────────────────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
┌──────────────────────┐          ┌──────────────────────┐
│  Radio Browser (NEW)  │          │ Song Listening Room   │
│  /stations            │          │ /radio (EXISTING)     │
│  Category → list      │          │ Search → song queue   │
│  Cache TTL, no poll   │          │ playSong → player     │
└──────────┬───────────┘          └──────────────────────┘
           │
           ▼
┌──────────────────────┐
│ Station API layer     │
│ (proxy via admin HT)  │
│ Radio Browser or HT   │
│ curated allowlist     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Station stream player │
│ (FUTURE — separate)   │
│ NOT playSong/auto-next│
└──────────────────────┘
```

**Principles:**

- Station list fetch ≠ playback session
- Cache station lists in memory + AsyncStorage with TTL (24h metadata, 1h search results)
- No live polling; refresh on user pull or cache miss only
- Favorites/recents stored separately from song recently played
- Song `/radio` unchanged in Phase 3 implementation until explicitly scheduled

---

## Station category tree (launch plan)

Top-level categories map to **Hidden Tunes Radio** groupings (user-facing names only):

```
Hidden Tunes Radio
├── Country Radio          → tag: country, genre: Country
├── Gospel Radio           → tag: gospel, christian, worship
├── Afrobeats Radio        → tag: afrobeats, afrobeat, highlife
├── Jazz Radio             → tag: jazz, smooth jazz
├── Classical Radio        → tag: classical, orchestral
├── News Radio             → tag: news, talk, public radio  [NEW taxonomy]
├── Global Radio           → top stations / multilingual mix
├── Mood Radio             → mood aliases from PREMIUM_MOOD_ROOMS
└── Location Radio         → country/region filter (ISO country codes)
```

### Category → existing metadata mapping

| Launch category | Song `/radio` search terms | Station tag strategy | Catalog genre alias |
|-----------------|----------------------------|----------------------|---------------------|
| **Country Radio** | `country music` | `country`, `americana` | Country |
| **Gospel Radio** | `gospel worship` | `gospel`, `christian`, `worship` | Gospel |
| **Afrobeats Radio** | `afrobeats` | `afrobeats`, `afrobeat`, `african` | Afrobeats |
| **Jazz Radio** | `jazz` | `jazz`, `smooth jazz` | Jazz |
| **Classical Radio** | `classical` | `classical`, `orchestra` | Classical |
| **News Radio** | `news talk radio` | `news`, `talk`, `npr`, `bbc` | — |
| **Global Radio** | `world music radio` | high vote count / “top stations” | — |
| **Mood Radio** | mood param | map from mood room aliases | mood field |
| **Location Radio** | `{country} radio` | Radio Browser `countrycode` | — |

**Mood Radio sub-chips (optional v1.1):** Focus, Late Night, Calm, Heartbreak — reuse `PREMIUM_MOOD_ROOMS` titles without new playback logic.

---

## Backend / data requirements

### Station model (proposed)

```typescript
type HiddenTunesStation = {
  id: string;              // stable hash or upstream uuid
  name: string;            // display name (Hidden Tunes facing)
  streamUrl: string;       // HLS/MP3/Icecast — validated HTTPS
  favicon?: string;
  country?: string;        // ISO code
  language?: string;
  tags: string[];          // normalized lowercase
  bitrate?: number;
  codec?: string;
  homepage?: string;       // optional, not shown as provider brand
  sourceName: "Hidden Tunes";
  cachedAt: number;
};
```

### API endpoints (proposed — backend work)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/radio/categories` | Launch category tree (static JSON ok) |
| `GET /api/radio/stations?category=&country=&q=` | Paginated station list |
| `GET /api/radio/stations/:id` | Single station resolve + stream URL verify |

**Proxy requirements:** Server-side Radio Browser calls; strip/replace upstream branding; HTTPS stream URLs only; block broken/dead streams via periodic **server** health check (not client poll loop).

### Data quality gates

- Minimum **5 playable stations** per category for launch, or hide category
- Stream URL validation on server before list inclusion
- No fake stations — real streams only
- Admin allowlist override per category (recommended for Gospel/News)

### What not to require for v1

- Now-playing metadata per station
- User accounts / sync favorites to cloud
- Location GPS auto-detect (manual country picker ok for Location Radio)

---

## Caching strategy

| Layer | Key | TTL | Invalidation |
|-------|-----|-----|--------------|
| Memory | `category:{id}` | Session | App restart |
| AsyncStorage | `hidden_tunes_stations_v1:{category}:{page}` | **24 hours** | Pull-to-refresh |
| Memory | `search:{normalizedQuery}` | 30 min | Same as `searchQueryCache` |
| In-flight | Map dedup per URL | Request lifetime | — |

**Rules:**

- **No** `setInterval` polling for station health on client
- **No** background fetch on tab blur/focus (use stale-while-revalidate on open)
- Cap memory entries (e.g. 32 category pages — mirror `MAX_VIEW_CACHE_ENTRIES`)
- Coalesce concurrent category fetches (pattern from `hiddenTunesApi` coordinated fetch)

Song `/radio` cache (optional improvement, separate task):

- Cache `searchHiddenTunesSongs` results by query key to cut repeated 8× sequential loads

---

## Empty / error state strategy

| State | Copy direction | Pattern |
|-------|----------------|---------|
| Loading | “Finding Hidden Tunes stations…” | ActivityIndicator + status line (like `/radio`) |
| Empty category | “No stations in this room yet. Try another category.” | `shouldShowCatalogEmpty` delay |
| Network error | Reuse `TESTER_COPY.radioLoadFailed` tone | Pull to refresh |
| Stream fail (future) | “This station paused. Pick another Hidden Tunes station.” | Inline retry, no provider name |
| Offline | Show cached list + “Showing saved stations” badge | Read AsyncStorage first |

**Never show:** Radio Browser, Icecast, Shoutcast, upstream aggregator names.

---

## Performance risks summary

| Area | Current issue | Phase 3 guardrail |
|------|---------------|-------------------|
| `/radio` load | Up to 8 sequential API calls | Do not amplify; fix in song-radio hardening separately |
| New station browser | N/A | Paginate 20–30/page; virtualize list |
| Cache | None for radio | Mandatory before launch |
| Polling | None | Explicitly banned on client |
| Queue | Dual radio state | Station play must not touch `radioQueue` |
| Heat | Multi-search `/radio` | Station browser is read-mostly + cache-heavy |
| Search | — | Station search debounced, separate index |

---

## Safest implementation order

1. **Audit cleanup doc + API spec** — Backend contract for `HiddenTunesStation` + proxy (no app code).
2. **`services/radioStationApi.ts` + cache** — Fetch, normalize, TTL storage; **no UI, no playback**.
3. **Category registry** — Static `LAUNCH_RADIO_CATEGORIES` mirroring nine launch groups.
4. **Station list screen** — Read-only browse, tap shows detail sheet “Play” disabled or stub — validates cache/perf.
5. **Entry points** — Profile “Hidden Tunes Radio” → categories; **do not** replace `/radio` routes yet.
6. **Empty/error states + pull-to-refresh** — Hidden Tunes copy only.
7. **Stream playback integration** — **Separate phase** with explicit playback owner; **not** `playSong` until designed; out of “no playback touch” constraint for that future phase.
8. **Song radio hardening (optional parallel)** — Wire `buildRecommendationSeedFromRecent` into `/radio`; reduce sequential search fan-out; **does not** block station browser.
9. **Deprecate dead `radioEngine` UI state** — Remove misleading MiniPlayer “Radio queue” or wire properly; reduces queue confusion before live radio ships.

Steps **1–6** deliver a safe **Radio Browser** for launch review without changing playback or queue behavior.

---

## Relationship to other phase audits

| Doc | Interaction |
|-----|-------------|
| `phase-2-discovery-audit.md` | Emotional worlds use `/radio` listening rooms — keep distinct from station browser |
| `launch-stability-audit.md` | No PlayerContext poll changes; validate cache on real device |
| `memory-battery-safety-audit.md` | Station list caps + no polling align with memory/heat fixes |
| `search-provider-branding-audit.md` | Same Hidden Tunes–only surfacing rules |

---

## Validation (this queue)

- **No code implementation**
- When implementation begins:

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: category browse feels instant from cache; pull-to-refresh works; no provider labels; song tap-to-play from `/radio` unchanged; queue/auto-next/background/lockscreen unchanged; device stays cool during browse (no polling).
