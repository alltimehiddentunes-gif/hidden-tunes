# Phase 2 Discovery Audit — Emotional Worlds, Genre Hubs, Mood Collections

**Scope:** Planning and audit only. No implementation in this queue. No playback, queue, Desktop, CarPlay, or Android Auto changes. No UI redesign. No fake playable songs. No provider names in UI — everything surfaces as **Hidden Tunes**.

**Goal:** Prepare Emotional Worlds, Genre Hubs, and Mood Collections safely for launch by reusing existing catalog/search/discovery systems and preserving premium UI patterns.

---

## Executive summary

Mobile discovery is **already ~70% wired** through a shared pipeline:

```
Catalog snapshot (≤220 songs on screen)
  → getSharedDiscoverySnapshot()
  → mood rooms + genre spotlights + curated sections + listener ranking
  → Home / Explore staged rails
  → tap → openMoodCatalog / openGenreCatalog → /genre hub → unifiedCatalog → playSong
```

Phase 2 should **extend definitions and routing**, not invent a parallel discovery engine. The seven launch worlds map cleanly onto existing mood/genre/curated primitives with **one net-new concept** (`Sunday Morning`) needing alias work.

**Biggest gaps today:**

| Gap | Impact on Phase 2 |
|-----|-------------------|
| `EmotionalDiscoveryChips` built but **never mounted** | Quick win surface for worlds |
| Onboarding `preferredGenres` / `preferredMoods` **stored, not ranked** | Personalization incomplete |
| `MOOD_TAGS` (layer 3) **reserved, unused in UI** | Rich metadata exists but hidden |
| `tags` only on `raw`, not normalized song | Weaker matching for worlds |
| No first-class **Emotional World** registry | Worlds scattered across 3 files |
| Explore header **not vertically virtualized** | Performance ceiling if sections multiply |

---

## 1. Existing discovery screens

### Home — `app/(tabs)/index.tsx`

| Section | Data source | Stage gate | World relevance |
|---------|-------------|------------|-----------------|
| Hero carousel | `featuredSongs` + player/recent | Always | Can highlight a world pick |
| Recently Added | `sharedDiscovery.recentlyDiscovered` | ≥1 | Fresh catalog per world |
| Because You Listened | `becauseYouListenedRaw` | ≥2 | Listener-aware |
| More Like This Mood | `buildMoreLikeThisMood()` | ≥2 | Mood-world seed |
| Creators / Albums rails | `rankedArtists` / `rankedAlbums` | ≥2 | Secondary |
| Curated sections | `PRIORITY_DISCOVERY_SECTIONS` matches | ≥3 | **Afro Heat**, **Country Roads**, focus/jazz overlap |
| Mood Rooms rail | `sharedDiscovery.moodRooms` | ≥3 | **Night Drive**, **Deep Focus**, **Heartbreak Recovery** overlap |
| Genre spotlight (single) | `genreSpotlights[0]` | ≥3 | **Afro Heat**, **Country Roads** |
| Full catalog rows | `rankedSongs` paginated | Always | Fallback browse |
| Emotional Discovery chips | **Not rendered** | — | **Primary Phase 2 mount target** |
| TV entry | `SubtleTvEntryLink` | Footer | Keep separate |

Feed assembly: `utils/homeFeedRows.ts` (`buildHomeFeedRows`, `feedMountStage` 0–3).

### Explore — `app/(tabs)/explore.tsx` + `components/explore/ExploreListHeader.tsx`

| Stage | Section | World relevance |
|-------|---------|-----------------|
| 1 | Smart hero + Smart Autoplay toggle | Entry, not world-specific |
| 1 | Mood Rooms rail (max 6) | Same as Home mood rooms |
| 2 | Continue listening | Player state |
| 2 | Because You Listened (`smartPicks`) | Ranked recommendations |
| 2 | Return To The Feeling | Custom recent+cloud seed (not `buildContinueListening`) |
| 2 | Recently Added | Upload freshness |
| 3 | Curated sections | Genre/mood collections |
| 3 | **Genre Spotlights grid** (`genreWorlds`) | Closest existing “worlds” UI |
| 4 | Playlists, albums, creators, TV | Secondary catalog API |

Play paths (unchanged in Phase 2 planning): mood tap → `openMoodCatalog(title)`; genre world → `openGenreCatalog({ id, title, query })`; smart badge → `smartPicks` queue.

### Genre / mood hub — `app/genre.tsx`

Single route `/genre` with params `{ id, title, query, type }` where `type` is `CatalogResolverType`:

`"genre" | "mood" | "artist" | "album" | "title" | "category"`

- Loads via `getInstantCatalogView()` + `loadCatalogView()` (`services/unifiedCatalog.ts`)
- Shows track list, album previews, **“{title} Listening Room”** card → `/radio`
- **All launch worlds can land here first** without a new screen

### Radio — `app/radio.tsx`

- Hidden Tunes catalog search first, YouTube fallback
- Linked from genre hub, search CTA, `PlayerContext.startPersonalRadio()`
- **Not** the same as `radioEngine.buildPersonalRadioQueue()` (YouTube-generic)
- Worlds should prefer **catalog hub + playSong queue**, not generic YouTube radio

### Search — `app/(tabs)/search.tsx`

- Instant + fuzzy grouped results (`runInstantCatalogSearch`, `runUniversalCatalogSearch`)
- Genre browse via `HIDDEN_TUNES_GENRES` → `openGenreCatalog`
- `genreMoods` bucket in grouped results
- Emotional chips **not shown** (only `SubtleTvEntryLink`)

### Library — `app/(tabs)/favorites.tsx`

- Favorites-driven; feeds `buildListenerPreferenceMaps` indirectly via PlayerContext

---

## 2. Existing genre data

| File | Role |
|------|------|
| `utils/genreAliases.ts` | **Source of truth** — 29 core genres, subgenre aliases, `MOOD_TAGS` (layer 3, reserved) |
| `utils/catalogResolver.ts` | `CANONICAL_GENRES`, emoji map, `filterSongsByCatalogLabel`, resolver matching |
| `utils/genreNormalization.ts` | `normalizeGenreName`, `getSongNormalizedGenres`, `songHasNormalizedGenre` |
| `utils/genres.ts` | `HIDDEN_TUNES_GENRES` — UI/search export of canonical genres |
| `utils/exploreGenreGroups.ts` | `buildGenreSpotlightGroups()` — genre worlds grid data |

**Core genres relevant to launch worlds:**

| Core genre | Aliases include |
|------------|-----------------|
| Afrobeats | afrobeat, afropop, highlife, fuji, … |
| Gospel | worship, praise, christian gospel, choir gospel, … |
| Country | country, americana, … |
| Jazz | smooth jazz, late night jazz, … |
| Lo-Fi | (curated section) |
| Instrumental / Ambient | (calm/focus overlap) |
| Soul / R&B | emotional depth overlap |

---

## 3. Existing mood / vibe metadata

### Song-level fields (normalized)

From `normalizeHiddenTunesSong()` in `services/hiddenTunesApi.ts`:

```typescript
genre?: string   // fallback "Hidden Tunes" if missing
mood?: string    // optional
// moodGenre, tags → raw payload / resolver helpers only
```

Persisted cache (v5) stores **genre + mood only**.

### Premium mood rooms — `utils/moodRooms.ts`

Eight definitions in `PREMIUM_MOOD_ROOMS`:

| Room | Launch world overlap |
|------|----------------------|
| Late Night | **Night Drive** (partial — add night-drive aliases) |
| Healing | Recovery / calm overlap |
| Party Energy | (not a launch world) |
| Focus | **Deep Focus** |
| Romantic | (not a launch world) |
| Heartbreak | **Heartbreak Recovery** |
| Calm | Sunday Morning overlap |
| Nostalgic | (not a launch world) |

Builder: `buildMoodRoomGroups(songs, limit)` — matches `song.mood` + `song.moodGenre` against aliases.

### Layer 3 mood tags — `utils/genreAliases.ts` (`MOOD_TAGS`)

Examples: Midnight Soul, Sunset Drive, Focus Flow, Sacred Voices, Spiritual Calm, Heartbreak Soul, Late Night Jazz, Lonely Roads.

**Reserved — not exposed in main UI yet.** Phase 2 can map launch worlds to these tags for matching without showing tag names as provider labels.

### Emotional shortcuts — `utils/emotionalDiscoveryShortcuts.ts`

Ten chip definitions → `openMoodCatalog(title, query)`. Component exists (`components/EmotionalDiscoveryChips.tsx`) but **is not mounted** on Home, Explore, or Search.

### Onboarding preferences — `services/onboardingPreferences.ts`

Stores `preferredGenres`, `preferredMoods`, `discoveryStyle`. Used by `onboardingPrewarm.ts` for catalog prefetch only — **not** passed into `getSharedDiscoverySnapshot`.

---

## 4. Catalog fields usable for discovery

| Field | Where | Usable for worlds? |
|-------|-------|-------------------|
| `genre` | Normalized song | **Yes** — primary genre hub matching |
| `mood` | Normalized song | **Yes** — mood room matching |
| `moodGenre` | Raw / resolver | **Yes** via `collectSongMoodTokens` |
| `genres[]`, `primaryGenre` | Raw | **Yes** via `getSongNormalizedGenres` |
| `tags` | `raw` only | **Partial** — search/resolver keys, not snapshot ranking |
| `album.genre`, `artist.genre` | Normalized fallback | **Yes** for genre inheritance |
| `createdAt` / `updatedAt` | Normalized | Recency rails |
| `lyrics` / `syncedLyrics` | Normalized | Search only |
| `sourceName` | Always `"Hidden Tunes"` | **Keep** — never show upstream provider |

**Rule for Phase 2:** Worlds must resolve to **real catalog songs** via `filterSongsByCatalogLabel` / mood room matchers / genre normalization. Empty world → branded empty state (`shouldShowCatalogEmpty`), never placeholder tracks.

---

## 5. Existing recommendation / radio helpers

| Module | Key API | Wired? | Phase 2 use |
|--------|---------|--------|-------------|
| `services/discoveryCache.ts` | `getSharedDiscoverySnapshot()` | Home + Explore | **Extend**, don’t replace |
| `services/smartDiscovery.ts` | `buildCuratedDiscoverySections`, `buildMoodRooms`, `buildGenreSpotlights`, `buildBecauseYouListened`, `buildMoreLikeThisMood` | Wired | Add world definitions to curated/mood layers |
| `services/smartDiscovery.ts` | `buildContinueListening()` | **Unused** | Wire Explore “Return To The Feeling” later |
| `services/listenerRanking.ts` | `buildListenerPreferenceMaps`, `rankSongsForListener` | Wired | Feed onboarding prefs here |
| `services/smartQueue.ts` | `getRelatedTracks` (genre OR mood OR artist) | Smart Autoplay | Unchanged |
| `services/radioEngine.ts` | YouTube-centric queues | Personal radio | **Avoid** for HT world launch |
| `app/radio.tsx` | HT catalog search radio | Genre hub CTA | Optional per-world listening room |
| `services/unifiedCatalog.ts` | `loadCatalogView`, view cache (28 entries) | Genre/mood hubs | Prewarm world cache keys |
| `utils/catalogNavigation.ts` | `openGenreCatalog`, `openMoodCatalog`, prewarm | All hubs | **Primary navigation** |
| `utils/catalogSongRanking.ts` | `rankCatalogSongs` | Search | Reuse for world-internal sort |
| `services/instantCatalogSearch.ts` | `runInstantCatalogSearch` | Search | `genreMoods` bucket |
| `services/universalSearchService.ts` | `runUniversalCatalogSearch` | Search deferred | Same |

**Snapshot limits (performance contract):**

```typescript
MAX_DISCOVERY_INPUT_SONGS = 220   // discoveryCache.ts
MAX_MOOD_ROOMS = 8
MAX_GENRE_SPOTLIGHTS = 6
MAX_SCREEN_CATALOG_SONGS = 240      // Home/Explore state cap
```

---

## 6. Missing data for launch worlds

### Launch world mapping

| Launch world | Best existing primitive | Match strategy | Gap |
|--------------|------------------------|----------------|-----|
| **Night Drive** | Mood: Late Night + aliases | Extend aliases: `night drive`, `driving`, `sunset drive`; MOOD_TAGS: Midnight Soul, Sunset Drive | Needs dedicated world id + gradient/copy |
| **Worship Sanctuary** | Genre: Gospel + mood: Spiritual Calm / Sacred Voices | `openGenreCatalog` Gospel **or** mood hub with worship aliases | Verify catalog gospel/worship tag density |
| **Afro Heat** | Curated: Afrobeats Energy + genre spotlight Afrobeats | Mostly **done** — rename/promote as world, no new matcher | Branding only |
| **Deep Focus** | Mood: Focus + curated Lo-Fi Focus | Mostly **done** | Merge duplicate surfaces under one world id |
| **Heartbreak Recovery** | Mood: Heartbreak + MOOD_TAG Heartbreak Soul | Mostly **done** | Copy: “Recovery” tone in subtitle |
| **Sunday Morning** | Gospel + Calm + Soul crossover | **No single primitive** — needs composite matcher (genre OR mood OR tag) | **Highest data gap** |
| **Country Roads** | Curated: Country Stories + Country genre | Mostly **done** | Alias `lonely roads` exists in heartbreak mood — avoid cross-leak |

### Cross-cutting missing pieces

1. **Unified `LAUNCH_EMOTIONAL_WORLDS` registry** — id, title, subtitle, gradient, resolver type (`genre`|`mood`|`composite`), aliases, curated section id, Hidden Tunes copy only.
2. **Catalog tag promotion** — optional read of `raw.tags` into discovery matching (read-only, no API change).
3. **Onboarding → `preferenceMaps`** — boost worlds matching stored prefs.
4. **World empty-state copy** — per-world branded message when `< minSongs` (reuse `shouldShowCatalogEmpty`).
5. **Sunday Morning composite rules** — document before implementation: e.g. `(Gospel OR Soul) AND (calm|worship|sunday|morning mood tags)`.

### What we must NOT do

- Inject hardcoded fake tracks or external provider IDs
- Show “Audius”, “Archive”, “YouTube” in world UI
- Create songs that aren’t in Hidden Tunes catalog/API

---

## 7. Performance risks

| Risk | Source | Mitigation in Phase 2 |
|------|--------|---------------------|
| Discovery recompute on large catalog | `getSharedDiscoverySnapshot` O(n) over 220 songs | Keep snapshot input capped; add worlds to **definitions**, not input size |
| Extra horizontal rails | Home/Explore nested FlatLists | Mount worlds in **one** chip row or replace mood room count — don’t add 7 new full rails |
| Explore mega-header | Entire UI in `ListHeaderComponent` | Stage world grid at `exploreMountStage >= 2` only; max 7 visible cells |
| Unified catalog cache churn | 28-entry view cache | Prewarm top 3 worlds only; lazy load rest on tap |
| Duplicate catalog state | Search/Home/Explore snapshots | Worlds read from shared snapshot + hub cache, not new React arrays |
| Async hub load after tap | `loadCatalogView` network | Keep existing prefetch (`scheduleGenreCatalogPrewarm`) on chip press-in |
| Search instant index rebuild | `invalidateCatalogSearchIndex` | Don’t invalidate on world definition changes alone |
| Memory | 7 world artwork gradients + previews | Reuse `MoodRoomCard` / existing gradients; no full-res prefetch grid |

**Playback / queue:** World tap → `/genre` hub → user taps song → existing `playSong(song, queue, index)`. **Do not** change queue construction or PlayerContext in Phase 2.

---

## Current reusable files & functions

### Navigation & hubs

| Symbol | File |
|--------|------|
| `openGenreCatalog`, `openMoodCatalog`, `prefetchCatalogNavigation` | `utils/catalogNavigation.ts` |
| `loadCatalogView`, `getInstantCatalogView`, `prefetchCatalogView` | `services/unifiedCatalog.ts` |
| `filterSongsByCatalogLabel`, `songMatchesCatalogLabel` | `utils/catalogResolver.ts` |

### Discovery pipeline

| Symbol | File |
|--------|------|
| `getSharedDiscoverySnapshot`, `buildDiscoveryCacheKey`, `resetSharedDiscoveryCache` | `services/discoveryCache.ts` |
| `buildCuratedDiscoverySections`, `PRIORITY_DISCOVERY_SECTIONS` | `services/smartDiscovery.ts` |
| `buildMoodRooms`, `buildMoodRoomGroups` | `smartDiscovery.ts` + `utils/moodRooms.ts` |
| `buildGenreSpotlights`, `buildGenreSpotlightGroups` | `smartDiscovery.ts` + `utils/exploreGenreGroups.ts` |
| `buildBecauseYouListened`, `buildMoreLikeThisMood` | `services/smartDiscovery.ts` |
| `buildListenerPreferenceMaps`, `rankSongsForListener` | `services/listenerRanking.ts` |

### UI components (reuse, don’t redesign)

| Component | File |
|-----------|------|
| `MoodRoomCard` | `components/explore/MoodRoomCard.tsx` |
| `EmotionalDiscoveryChips` | `components/EmotionalDiscoveryChips.tsx` |
| `ExploreListHeader` (genre grid, mood rail) | `components/explore/ExploreListHeader.tsx` |
| `HomeFeaturedCard`, `HomeCatalogSongRow` | `components/catalog/HomePlaybackRows.tsx` |
| `GenreTrackRow` | `components/catalog/GenreTrackRow.tsx` |

### Search integration

| Symbol | File |
|--------|------|
| `rankCatalogSongs` | `utils/catalogSongRanking.ts` |
| `runInstantCatalogSearch` | `services/instantCatalogSearch.ts` |
| `runUniversalCatalogSearch` | `services/universalSearchService.ts` |
| `HIDDEN_TUNES_GENRES` | `utils/genres.ts` |

### Data / constants

| Symbol | File |
|--------|------|
| `CORE_GENRE_DEFINITIONS`, `MOOD_TAGS`, `getVisibleCoreGenres` | `utils/genreAliases.ts` |
| `EMOTIONAL_DISCOVERY_SHORTCUTS` | `utils/emotionalDiscoveryShortcuts.ts` |
| `HiddenTunesNormalizedSong` | `services/hiddenTunesApi.ts` |

---

## Recommended architecture (Phase 2 implementation — not built yet)

```
utils/launchEmotionalWorlds.ts          ← NEW registry (7 worlds, aliases, resolver type)
        │
        ├─► discoveryCache / smartDiscovery   (world sections in snapshot)
        ├─► catalogResolver                     (composite Sunday Morning matcher)
        ├─► catalogNavigation                   (openLaunchWorld(worldId))
        └─► EmotionalDiscoveryChips OR ExploreWorldsGrid  (mount existing components)

Tap world → openLaunchWorld(id)
         → /genre?type=mood|genre&title=…&query=…
         → unifiedCatalog (cached view)
         → real songs only → playSong (unchanged)
```

**Principles:**

- One registry drives chips, Explore grid, and hub resolver params
- Hidden Tunes branding in all titles/subtitles
- Empty worlds show premium empty copy, not external fallback rows
- Personalization layer reads onboarding prefs into existing `preferenceMaps`
- No new routes required for MVP ( `/genre` hub is sufficient)

---

## Launch world list (planned collections)

| # | World | User-facing subtitle (draft) | Resolver | Primary matcher |
|---|-------|------------------------------|----------|-----------------|
| 1 | Night Drive | Music for the road after dark | mood | Late Night aliases + Sunset Drive / Midnight Soul tags |
| 2 | Worship Sanctuary | Praise, peace, and sacred calm | genre + mood | Gospel genre + worship/spiritual mood tags |
| 3 | Afro Heat | Afrobeats energy and fusion fire | genre | Afrobeats core genre (existing curated section) |
| 4 | Deep Focus | Clean sound for concentration | mood + genre | Focus mood + Lo-Fi / Instrumental curated |
| 5 | Heartbreak Recovery | Emotional songs for letting go | mood | Heartbreak room + Heartbreak Soul tag |
| 6 | Sunday Morning | Gentle gospel and soul for slow mornings | **composite** | Gospel/Soul + calm/worship/sunday tokens |
| 7 | Country Roads | Stories with room to breathe | genre | Country core genre (existing curated section) |

---

## Data requirements before build

| Requirement | Priority | Notes |
|-------------|----------|-------|
| `LAUNCH_EMOTIONAL_WORLDS` registry with ids, aliases, gradients, min song threshold | P0 | Single source of truth |
| Alias audit on live catalog for 7 worlds | P0 | Run against snapshot; document count per world |
| Sunday Morning composite matcher spec | P0 | Prevent gospel/country bleed |
| Promote `MOOD_TAGS` matching in resolver (read-only) | P1 | Better Sunday Morning + Night Drive |
| Wire onboarding prefs → `buildListenerPreferenceMaps` | P1 | Personalization without new UI |
| World-specific empty-state strings | P1 | Hidden Tunes voice |
| Optional `raw.tags` index for discovery | P2 | Only if alias audit shows gaps |
| Prewarm map for top 3 worlds | P2 | Startup/focus performance |
| Analytics keys per world (dev-only) | P3 | Optional |

---

## Safest implementation order

1. **Registry + matcher audit (data-only)** — Add `launchEmotionalWorlds.ts`; script or dev probe counts songs per world from snapshot; no UI.
2. **Resolver extensions** — Sunday Morning composite + Night Drive alias expansion in mood/genre matchers; unit-test against sample catalog slice.
3. **Navigation helper** — `openLaunchWorld(worldId)` wrapping existing `openMoodCatalog` / `openGenreCatalog`; prefetch on press-in.
4. **Mount EmotionalDiscoveryChips on Explore stage 2** — Smallest visible win; reuse component as-is with updated shortcut list aligned to 7 worlds.
5. **Align `EMOTIONAL_DISCOVERY_SHORTCUTS` + `PREMIUM_MOOD_ROOMS` copy** — Rename/consolidate duplicates (Focus vs Deep Focus); no new cards yet.
6. **Explore Genre Spotlights → Launch Worlds grid** — Swap data source from `genreSpotlights` to launch registry (same `MoodRoomCard` / grid cell pattern).
7. **Onboarding prefs → preferenceMaps** — Boost matching worlds in snapshot ranking.
8. **Home feed** — Single world hero or chip row at stage 3 (avoid duplicating Explore).
9. **Search** — Add world shortcuts to grouped empty/browse state (optional chips, Hidden Tunes copy).
10. **Wire `buildContinueListening` in Explore** — Replace ad-hoc “Return To The Feeling” seed (quality, not new worlds).

Steps 1–4 are sufficient for a **safe MVP launch** without touching playback or adding screens.

---

## Validation (this queue)

- **No code implementation** in this queue — audit doc only
- When implementation begins, reuse launch stability gates:

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: each world opens `/genre` hub with real songs; tap-to-play; empty worlds show branded empty state; no provider labels; scroll/Home/Explore heat unchanged.

---

## Related audit docs

- `launch-stability-audit.md` — post Phase 1 fix queues
- `search-provider-branding-audit.md` — provider UI removal
- `memory-battery-safety-audit.md` — snapshot caps
- `catalog-fetch-cache-audit.md` — hub cache behavior
- `artwork-scroll-audit.md` — rail performance patterns
