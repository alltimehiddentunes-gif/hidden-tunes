# Phase 6 Smart Radio + Recommendations Audit

**Scope:** Planning and audit only. No implementation in this queue. No playback, queue, Desktop, TV, CarPlay, or Android Auto changes. No UI redesign. No provider branding — users see **Hidden Tunes** only.

**Goal:** Design the complete Hidden Tunes **recommendation ecosystem** for launch planning — retention, session length, discovery, personalization, and churn reduction — by auditing every existing signal, helper, and gap. Recommendations must **excel for brand-new users** with no playlists, likes, or listening history.

---

## Executive summary

Hidden Tunes already has a **catalog-native recommendation core** (~65% wired) built on a single pipeline:

```text
Catalog snapshot (≤220 songs)
  → buildListenerPreferenceMaps(recentlyPlayed, favorites)
  → smartDiscovery builders (because you listened, mood rooms, curated sections, …)
  → getSharedDiscoverySnapshot() [in-memory cache]
  → Home / Explore rails → playSong / /radio Listening Room
```

A **parallel orphan stack** exists for YouTube-centric radio (`radioEngine`, `smartRelatedEngine`) that **does not play audio** and returns empty results today (`YOUTUBE_DATA_API_ENABLED = false`).

| Layer | Status | Launch role |
|-------|--------|-------------|
| **Catalog discovery snapshot** | **Wired** Home + Explore | Primary cold-start + warm personalization |
| **`/radio` Listening Room** | **Wired** — Hidden Tunes search → `playSong` | Smart radio launch path |
| **Recently played + favorites** | **Wired** — AsyncStorage | Personalization signals |
| **Onboarding preferences** | **Stored, partially used** | Prewarm only — not ranked into discovery |
| **`radioEngine` + PlayerContext radio state** | **Orphan** — no UI callers | Do not expand; deprecate misleading labels |
| **`smartRelatedEngine`** | **Dead** — no callers | Replace with catalog matchers |
| **Profile “Recommended For You”** | **Placeholder** | Future hub |
| **Legacy `fetchTrendingSongs`** | **Dead** — wrong API host | Replace with catalog `created_at` rails |

**Critical rule:** Phase 6 recommendations must **extend `getSharedDiscoverySnapshot` and `/radio`**, not revive client YouTube API radio. **Do not touch** `playSong`, `activeQueue`, or queue tab in this planning phase.

**Cold-start verdict:** The app **already serves non-empty discovery** without history (mood rooms, curated sections, recently added, genre spotlights). Gaps are **labeling**, **onboarding fusion**, **true continue/resume**, and **several named launch systems** that are placeholders or misimplemented.

---

## 1. Existing radio engine

### `services/radioEngine.ts` — YouTube engine radio (orphan)

| Export | Behavior | Wired? |
|--------|----------|--------|
| `buildRelatedRadioQueue(seed)` | 3× `searchYouTubeBackend` | `PlayerContext.startRadio` — **no UI caller** |
| `buildPersonalRadioQueue()` | Generic YouTube queries | `PlayerContext.startPersonalRadio` — **no UI caller** |
| `extendRadioQueue` / session API | Session lifecycle + AsyncStorage | **Dead** — not imported elsewhere |
| `RadioTrack` | `source: "youtube"` only | Misleading MiniPlayer “Radio queue” labels |

**Data source:** exclusively disabled YouTube API — queues are **always empty** at runtime.

### `app/radio.tsx` — Song Listening Room (primary smart radio UI)

| Behavior | Detail |
|----------|--------|
| Params | `title`, `artist`, `genre`, `mood`, `query` |
| Load | Up to **8 deduped search terms** × `searchHiddenTunesSongs()` |
| Play | `playSong(normalized, queue, index)` → native audio |
| Fallback | 3× `searchYouTubeBackend` → `/youtube-player` (returns empty today) |
| Entry | Genre hub “Listening Room”, Search “Start a mood radio”, Profile “Personal Radio” |

**This is the launch smart-radio surface.** Genre/Mood/Faith/Country/Afrobeats/Focus/Workout/Relationship radios should route here with params — **not** through `radioEngine`.

### `context/PlayerContext.tsx` — parallel radio state

| API | Behavior | Risk |
|-----|----------|------|
| `startRadio` / `startPersonalRadio` | Sets `radioMode`, persists YouTube-shaped queue | **Never called from UI** |
| `playNextRadioTrack` | Extends YouTube queue | **Never called**; auto-next uses `activeQueue` only |
| `radioMode`, `radioQueue` | Restored on boot | Confusing queue tab / MiniPlayer copy |

---

## 2. Existing related-track engine

### `services/smartRelatedEngine.ts`

| Function | Source | Callers |
|----------|--------|---------|
| `getSmartRelatedSongs(seed?)` | `searchYouTubeBackend` + recent seed | **None** |
| `getPersonalRadioSongs()` | Recent seed → YouTube | **None** |

Branding leak: `sourceName: "YouTube"`. **Do not wire for launch.**

### Catalog-native “related” today

| Helper | File | Mechanism |
|--------|------|-----------|
| `buildBecauseYouListened` | `smartDiscovery.ts` | Artist/album/genre/mood overlap vs recent + favorites |
| `buildMoreLikeThisMood` | `smartDiscovery.ts` | Same mood label in catalog |
| `generateSmartPlaylists` | `playlists.ts` | Artist/genre/mood keyword filters → smart mixes |
| `rankSongsForListener` | `listenerRanking.ts` | Weighted score from preference maps |
| `rankCatalogSongs` | `catalogSongRanking.ts` | Search relevance (not discovery rails) |

**Gap:** No dedicated **Similar Artists** or **Similar Albums** section builders — data exists (`rankedArtists`, `rankedAlbums`) but not productized as launch rails.

---

## 3. Existing recently-played engine

### `services/recentlyPlayedEngine.ts`

| Feature | Detail |
|---------|--------|
| Storage | AsyncStorage `hidden_tunes_recently_played` |
| Cap | 60 tracks |
| Fields | id, title, artist, artwork, streamUrl, type, `playedAt`, `playCount` |
| `addToRecentlyPlayed` | Called from PlayerContext on play |
| `buildRecommendationSeedFromRecent` | Top 5 by playCount → query string; fallback **`"popular afrobeats songs"`** |
| `getTopRecentlyPlayed` | Used internally for seed building |

**Wired into:** `getSharedDiscoverySnapshot`, Home, Explore, `/recently-played` screen.

**Gap:** No **per-track progress** in recently played — resume is separate (`hidden_tunes_position` single key for current song only).

---

## 4. Existing search history

### `app/(tabs)/search.tsx`

| Feature | Detail |
|---------|--------|
| Key | `hidden_tunes_recent_searches_v4` |
| Cap | 12 queries |
| Persist | Debounced 1.2s AsyncStorage write |
| UI | “Recent searches” chips in empty search mode |
| Recommendation use | **Not fed into discovery ranking today** |

**Opportunity:** Search history is a **cold/warm signal** (intent topics) — safe to add to preference maps without touching playback.

---

## 5. Existing favorites

### `context/PlayerContext.tsx`

| Feature | Detail |
|---------|--------|
| Key | `hidden_tunes_favorites` |
| API | `toggleFavorite`, `isFavorite` |
| UI | Library (`favorites.tsx`), Player heart button |
| Discovery | Fed into `buildListenerPreferenceMaps` (+35 score) and `buildBecauseYouListened` |

**“Rediscover Favorites”** — favorites exist but **no dedicated rail title**; favorites boost “Because You Listened” indirectly.

---

## 6. Existing likes

**There is no separate “likes” system.** Heart = **favorites** only (`toggleFavorite`). No track-level like count, no unlike telemetry beyond remove from favorites list.

Plan: treat **Favorites = Likes** for Phase 6; do not add a second like store without explicit product need.

---

## 7. Existing playlists

| System | File | Role |
|--------|------|------|
| User playlists | `services/playlists.ts` | AsyncStorage `hidden_tunes_user_playlists_v2` — CRUD, local only |
| Legacy playlists | `services/playlistEngine.ts` | Separate key `hidden_tunes_playlists_v1` — **parallel store** |
| Smart playlists | `generateSmartPlaylists()` | Recently Added, Afrobeats Mix, Emotional Mix, per-artist, per-genre — **client-generated** |
| Cloud playlists | Explore/Search API sections | Display only; not recommendation engine |

**Gap:** User playlists are **not** inputs to `getSharedDiscoverySnapshot` (only songs from catalog snapshot + favorites/recent). New users with zero playlists are unaffected — good for cold start.

---

## 8. Existing genre metadata

| File | Role |
|------|------|
| `utils/genreAliases.ts` | 29 core genres, subgenre aliases, **`MOOD_TAGS` (layer 3, reserved)** |
| `utils/genreNormalization.ts` | Canonical genre matching on songs |
| `utils/genres.ts` | `HIDDEN_TUNES_GENRES` — search chips |
| `utils/catalogResolver.ts` | Genre/mood/album/artist hub matching |
| `utils/exploreGenreGroups.ts` | Genre spotlight grid data |

**Backend:** Supabase songs `genre`, `mood` fields; search scans both (`routes/songs.js`).

**Smart radio dependency:** Genre/Mood radio quality = **metadata coverage** on catalog rows.

---

## 9. Existing mood metadata

| File | Role |
|------|------|
| `utils/moodRooms.ts` | 8 premium mood rooms (Late Night, Healing, Party Energy, Focus, Romantic, Heartbreak, Calm, Nostalgic) |
| `utils/emotionalDiscoveryShortcuts.ts` | 10 chip shortcuts → `openMoodCatalog` |
| `components/EmotionalDiscoveryChips.tsx` | Built; **partially mounted** (Home footer; not full chip grid everywhere) |
| `buildMoreLikeThisMood` | Requires `song.mood` on current or recent track |

**Gap:** Many launch emotional worlds (Night Drive, Worship Sanctuary, Feel Good Friday) map to **aliases or curated sections**, not first-class mood room ids — see §14 mapping table.

---

## 10. Existing recommendation helpers

| Module | Key exports | Wired? |
|--------|-------------|--------|
| `services/discoveryCache.ts` | `getSharedDiscoverySnapshot`, `MAX_DISCOVERY_INPUT_SONGS=220` | Home + Explore |
| `services/smartDiscovery.ts` | `buildBecauseYouListened`, `buildContinueListening`, `buildMoreLikeThisMood`, `buildRecentlyDiscovered`, curated/mood/genre builders | Via snapshot |
| `services/listenerRanking.ts` | `buildListenerPreferenceMaps`, `rankSongsForListener`, `rankArtistsForListener`, `rankAlbumsForListener` | Via snapshot |
| `services/onboardingPreferences.ts` | `preferredGenres`, `preferredMoods`, `discoveryStyle`, `preferredEnergy` | Stored |
| `services/onboardingPrewarm.ts` | Prefetch catalog + search cache from onboarding | **Not** discovery ranking |
| `utils/homeFeedRows.ts` | Staged Home rows incl. Because You Listened, More Like This Mood | Home |
| `utils/trendingCharts.ts` | Static chart definitions (YouTube-query shaped) | **Unused in discovery** |
| `services/api.ts` | `fetchTrendingSongs` → legacy host | **Dead** |
| `services/smartQueue.ts` | Saved smart autoplay picks | Queue-adjacent; separate from discovery rails |

### Known semantic bugs (planning fixes — not implemented here)

1. **`buildContinueListening`** filters catalog songs whose ids **match** recently played ids — it repeats recent tracks, not “resume mid-song” or “up next similar.”
2. **Explore “Continue Listening” rail** uses `continueSongsSeed` = recent plays deduped — overlaps **Recently Played**, not true continue.
3. **Explore `ContinueListeningCard`** = resume **current player song** — correct UX, different from rail title collision.
4. **`groupedForUniversalSearch` TV strip** — unrelated but same class of “computed then hidden” risk; keep podcast/TV out of song recommendations.

---

## 11. Complete recommendation architecture (target)

```text
┌─────────────────────────────────────────────────────────────────┐
│                     SIGNAL LAYER (client)                        │
│  recentlyPlayed · favorites · searchHistory · onboardingPrefs   │
│  currentSong · playCount · (future: session time, skip rate)    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              RECOMMENDATION BRAIN (extend, don’t fork)           │
│  buildListenerPreferenceMaps                                     │
│  + editorial weights (featured, new uploads, onboarding genres)  │
│  + searchHistoryTopicBoost (new)                                 │
│  → getSharedDiscoverySnapshot()                                  │
│  → getEditorialDiscoverySnapshot() [cold-start guaranteed rails] │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          ▼                  ▼                  ▼
   HOME / EXPLORE      SMART RADIO           LIBRARY
   staged rails         /radio params         smart playlists
   playSong             playSong queue        playSong
          │                  │
          └────────── ✕ ─────┘
                Do not merge with
                radioEngine YouTube queue
                or WebView TV playback
```

**Three recommendation tiers:**

| Tier | Purpose | History required? |
|------|---------|-------------------|
| **Editorial** | Curated sections, mood rooms, genre spotlights, Popular Right Now | **No** |
| **Contextual** | More Like This Mood, Because You Played, Continue (player) | Soft — mood from catalog tags |
| **Personal** | Favorites boost, ranked artists/albums, smart playlists | **Yes** — degrades gracefully |

New users receive **Tier 1 + onboarding-boosted Tier 1** immediately; Tier 3 activates after first play.

---

## 12. Launch recommendation systems (planned → existing)

| Launch system | Current state | Recommended launch behavior |
|---------------|---------------|----------------------------|
| **Because You Played** | `buildBecauseYouListened` on Home/Explore | Rename copy optionally; require ≥1 play for section mount |
| **Continue Listening** | Player card (good) + conflated Explore rail (weak) | **Player resume only** at launch; fix rail or rename “Recent Plays” |
| **Recently Played** | Wired — engine + screen | Keep; cap display 10 on Explore |
| **Rediscover Favorites** | Favorites exist; no rail | New section when `favorites.length ≥ 3` — shuffle favorites ranked |
| **You Might Like** | Not wired | `rankSongsForListener` top 10 excluding recent IDs — works **without** favorites if onboarding genres set |
| **More Like This** | `buildMoreLikeThisMood` on Home | Mount when `currentSong.mood` or genre match |
| **Similar Artists** | Partial via `generateSmartPlaylists` | Rail: top 6 artists by shared genre with 3 songs each |
| **Similar Albums** | `rankedAlbums` unused as rail | Rail: albums sharing genre with current/recent |
| **Recommended For You** | Profile placeholder | Explore hub linking to blended rail (editorial + ranked) |
| **Trending Near You** | Not wired | **Defer** — no geo pipeline; use “Trending in Hidden Tunes” editorial |
| **Popular Right Now** | `buildRecentlyDiscovered` / Recently Added | Rename rail; sort `created_at` + play velocity when server stats exist |

---

## 13. Launch radio systems (planned → existing)

All launch radios use **`/radio` Listening Room** + Hidden Tunes catalog search — **not** `radioEngine`.

| Launch radio | Route params | Search seed strategy |
|--------------|--------------|----------------------|
| **Artist Radio** | `artist`, `query` | Artist name + top song title variants |
| **Album Radio** | `title`, `query` | Album + artist from album entity |
| **Genre Radio** | `genre`, `query` | Canonical genre + aliases from `genreAliases` |
| **Mood Radio** | `mood`, `query` | Mood room aliases from `moodRooms.ts` |
| **Faith Radio** | `genre=Gospel`, mood hints | Gospel + Worship + Spiritual aliases |
| **Country Radio** | `genre=Country` | Country + Americana aliases |
| **Afrobeats Radio** | `genre=Afrobeats` | Afrobeats + Amapiano + Afro fusion |
| **Workout Radio** | `mood=Party Energy` | High BPM keywords + Afrobeats/Hip-Hop |
| **Focus Radio** | `mood=Focus` | Lo-Fi + Instrumental curated matchers |
| **Relationship Radio** | `mood=Romantic` | Romantic + R&B + Soul overlap |

**Queue behavior:** Radio builds a **finite queue** (catalog search hits) then `playSong` — acceptable for launch. **Infinite radio** = repeated `/radio` term expansion server-side (future); do not enable YouTube fallback for launch.

---

## 14. Emotional discovery mapping

| Launch world | Existing primitive | Gap |
|--------------|-------------------|-----|
| Night Drive | Party Energy aliases include “sunset drive” | Add dedicated room or alias bundle |
| Deep Focus | Focus mood room + Lo-Fi Focus curated | **Ready** |
| Heartbreak Recovery | Heartbreak mood room | **Ready** |
| Sunday Morning | MOOD_TAGS + Phase 2 composite matcher | Needs alias work |
| Afro Heat | Afrobeats Energy curated + genre spotlight | **Ready** |
| Worship Sanctuary | Gospel genre + Spiritual mood tags | **Ready** |
| Gym Energy | Party Energy room | **Ready** |
| Peaceful Piano | Calm room + “Emotional Piano” MOOD_TAG | Tag songs in admin |
| Late Night Vibes | Late Night mood room | **Ready** |
| Feel Good Friday | Partial (Party Energy / Uplifting) | Add curated section id |

**UI:** Mount `EmotionalDiscoveryChips` on Home + Search empty state (Phase 2 plan) — zero playback change.

---

## 15. Future AI discovery (deferred)

| Concept | Prerequisites | Phase |
|---------|---------------|-------|
| Mood Matching | Reliable `mood` + `energy` tags on ≥80% catalog | Post-launch |
| Vibe Continuation | Session embeddings or audio feature vectors | Research |
| Energy Matching | `preferredEnergy` wired to ranking | Quick win before ML |
| Listening Habit Learning | Skip/complete telemetry pipeline | Server analytics |
| Time Of Day | Local hour buckets → mood room boost | Client-only heuristic |
| Weather | External API + privacy review | Defer |
| Emotional Journey | Multi-step playlist narratives | Editorial |
| Memory Based Discovery | Long-term taste profile store | Server |

**No on-device ML required for launch.** Heuristic + editorial + onboarding covers cold start.

---

## 16. Metadata requirements

| Field | Used by | Launch requirement |
|-------|---------|-------------------|
| `genre` | Genre radio, spotlights, because-you-listened | ≥90% public catalog tagged |
| `mood` | Mood rooms, More Like This | ≥60% for mood rails; fallback to genre |
| `artist` / `artist_id` | Artist radio, similar artists | Required |
| `album` / `album_id` | Album radio, similar albums | Recommended |
| `created_at` | Popular Right Now, Recently Added | Required |
| `tags` / MOOD_TAGS | Fine-grained emotional worlds | Admin pass — map layer-3 tags |
| `duration` | Session length analytics | Nice-to-have |
| `is_featured` | Editorial rails | Admin flag (future API field or client list) |
| Onboarding `preferredGenres` | Cold-start boost | Wire into `scoreSong` editorial boost |

**Backend optional (scalability):** `GET /api/discovery/home` bundled rails to cut client compute — not required for launch if snapshot stays ≤220 songs.

---

## 17. Caching strategy

| Cache | Location | TTL | Recommendation use |
|-------|----------|-----|-------------------|
| Discovery snapshot | `discoveryCache.ts` in-memory | Until catalog/listener fingerprint changes | **Primary** — extend key with searchHistory sample |
| Catalog view | `unifiedCatalog.ts` | 28 views + persisted | Genre/mood hub loads |
| Search results | `searchQueryCache.ts` | 30 min | Prewarm from onboarding |
| Recently played | AsyncStorage | Persistent | Invalidate snapshot on play |
| Favorites | AsyncStorage | Persistent | Same |
| Radio queue (orphan) | `radioEngine` keys | Persistent | **Ignore for launch** |
| Smart queue | `smartQueue.ts` | Persistent | Separate from recommendations |
| Position | `hidden_tunes_position` | Single current song | Continue Listening (player) |

**Rules:**

- Never recompute snapshot on every keystroke — Home/Explore already gate by fingerprint
- Cap inputs at **220 songs** (`MAX_DISCOVERY_INPUT_SONGS`) — add rails in **definitions**, not input size
- Debounce listener updates 300–500ms after `addToRecentlyPlayed`

---

## 18. Personalization strategy

| Signal | Weight (conceptual) | Cold-start fallback |
|--------|---------------------|---------------------|
| Favorites | High (+35 maps) | Skip section |
| Recent artist/album/genre/mood | Medium (+6–12) | Editorial genres |
| Play count | Medium | — |
| Search history topics | Medium (proposed) | Trending editorial |
| Onboarding genres/moods | High (proposed) | Default Afrobeats/Gospel/Lo-Fi mix |
| `discoveryStyle` adventurous | Widen genre spotlights | Balanced = default |
| Upload recency | Low (+2–8) | Drives Popular Right Now |

**Anti-churn tactics (launch):**

1. **First session:** onboarding → editorial Home stage 1–3 within 2s of catalog hydrate
2. **Second session:** Because You Played + You Might Like after 1 play
3. **Return after 7d:** Rediscover Favorites + Recently Played rail

---

## 19. Cold-start strategy

**Guaranteed rails with zero history, zero favorites, zero playlists:**

| Rail | Source |
|------|--------|
| Mood Rooms (6–8) | `buildMoodRooms` — always from catalog |
| Curated sections | `PRIORITY_DISCOVERY_SECTIONS` — genre matchers |
| Recently Added | `buildRecentlyDiscovered` |
| Genre Spotlights | `buildGenreSpotlights` |
| Hero / Featured | `featuredSongs` + editorial pick |
| Smart playlists (library) | `generateSmartPlaylists` from catalog |

**Onboarding boost (wire in Phase 6 build):**

```text
loadOnboardingPreferences()
  → boost scoreSong() for preferredGenres / preferredMoods
  → prewarm searchQueryCache for top preferred genre
  → open first mood room matching preferredMood
```

**Fallback seed:** Replace hardcoded `"popular afrobeats songs"` in `buildRecommendationSeedFromRecent` with **onboarding-aware default** — still Hidden Tunes catalog, not YouTube.

---

## 20. New-user strategy

Target: **excellent recommendations in first 60 seconds**.

| Step | Experience |
|------|------------|
| 0–10s | Catalog hydrate → Home hero + Mood Rooms visible (feed stage ≥3) |
| 10–30s | Emotional Discovery chips → mood hub → instant playable list |
| 30–60s | One tap play → Recently Played begins → Because You Played on return |
| Optional | Search trending mood chips — no empty states |

**Do not require:** account, playlists, likes, or history for full Home/Explore value.

**Avoid:** empty “Recommended For You” placeholder screens — hide until signals exist or show editorial default.

---

## 21. Performance risks

| Risk | Source | Mitigation |
|------|--------|------------|
| O(n) snapshot over 220 songs × 8 builders | `getSharedDiscoverySnapshot` | Keep cap; memoize; don’t add O(n²) pairwise similarity on device |
| `/radio` 8 sequential API searches | `radio.tsx` loop | Cap terms at 4 for launch; parallel 2-at-a-time with cancel |
| Recompute snapshot every play | Home listener deps | Debounce fingerprint update |
| Explore section dedupe passes | Multiple arrays | Already deduped — don’t add more full scans |
| Smart playlist generation on large catalog | Library tab | Generate from capped snapshot slice |
| YouTube radio API calls | `radioEngine`, radio fallback | Remove fallback calls when API disabled (separate queue) |

---

## 22. Scalability risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Client-only ranking | Breaks at 10k+ songs | Move to `GET /api/discovery/home` with server rank |
| No play analytics | Trending/Personalization ceiling | Batch play events to Supabase (future) |
| Single global catalog | “Trending Near You” impossible | Editorial regional charts (Ghana, Naija) via static config — already in `TRENDING_CHARTS` shape |
| Metadata sparsity | Empty mood rooms | Admin tagging SLO + hide empty lanes |
| Dual playlist stores | Confusion | Consolidate `playlistEngine` vs `playlists.ts` in future refactor |
| Orphan radio state | Support burden | Deprecate MiniPlayer radio labels |

---

## 23. Safest implementation order

No code in this queue — recommended build sequence:

1. **Metadata pass (admin)** — genre/mood coverage SLO for launch catalog
2. **Wire onboarding → discovery ranking** — no playback change; extend `scoreSong` / snapshot input
3. **Editorial cold-start registry** — guaranteed rails config; hide empty sections
4. **Fix Continue Listening semantics** — player resume vs rail naming (UI copy or data fix)
5. **Mount Emotional Discovery chips** — links to existing mood hubs
6. **Launch radio param matrix** — document `/radio` query templates for 10 smart radios
7. **Add missing rails** — Rediscover Favorites, You Might Like, Similar Artists, Popular Right Now (catalog-native)
8. **Feed search history into preference maps** — lightweight topic boost
9. **Remove/disable YouTube radio dead paths** — `radioEngine` UI labels, radio fallback API calls
10. **Profile Recommended For You** — route to Explore blended view, not placeholder
11. **Server discovery endpoint** (optional scale) — when catalog >500 playable rows
12. **Future AI tier** — telemetry + server ranker

**Explicitly defer:** queue changes, playback engine changes, TV/podcast recommendation merge, CarPlay/Android Auto smart mixes, weather/time ML.

---

## 24. Reusable files checklist

| Area | Files |
|------|-------|
| Discovery core | `services/discoveryCache.ts`, `services/smartDiscovery.ts`, `services/listenerRanking.ts` |
| Signals | `services/recentlyPlayedEngine.ts`, `PlayerContext` favorites, `search.tsx` history |
| Onboarding | `services/onboardingPreferences.ts`, `services/onboardingPrewarm.ts` |
| Smart radio UI | `app/radio.tsx`, `utils/catalogNavigation.ts`, `app/genre.tsx` |
| Mood / emotional | `utils/moodRooms.ts`, `utils/emotionalDiscoveryShortcuts.ts`, `components/EmotionalDiscoveryChips.tsx` |
| Genre | `utils/genreAliases.ts`, `utils/exploreGenreGroups.ts` |
| Playlists | `services/playlists.ts` (`generateSmartPlaylists`) |
| Home / Explore | `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `utils/homeFeedRows.ts`, `components/explore/ExploreListHeader.tsx` |
| **Avoid for launch** | `services/radioEngine.ts`, `services/smartRelatedEngine.ts`, `services/api.ts` fetchTrending |

---

## 25. Validation (this queue)

- [x] Audit only — no feature, UI, playback, or queue implementation
- [x] Complete recommendation + smart radio architecture documented
- [x] Cold-start / new-user strategies defined (no history required)
- [x] Launch system mapping for all named recommendation, emotional, and radio products
- [ ] Future build queues: onboarding wire → editorial rails → radio matrix → deprecate orphan YouTube radio

**Related audits:** [Phase 2 discovery](./phase-2-discovery-audit.md), [Phase 3 radio browser](./phase-3-radio-browser-audit.md), [Phase 4 video discovery](./phase-4-video-discovery-audit.md), [Phase 5 podcast ecosystem](./phase-5-podcast-ecosystem-audit.md), [Search flow](./search-flow-audit.md), [Memory + battery safety](./memory-battery-safety-audit.md).
