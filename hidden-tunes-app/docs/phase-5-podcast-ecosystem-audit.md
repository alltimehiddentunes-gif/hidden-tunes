# Phase 5 Podcast Ecosystem Audit

**Scope:** Planning and audit only. No implementation in this queue. No playback, queue, Desktop, TV, CarPlay, or Android Auto changes. No UI redesign. No provider branding — users see **Hidden Tunes** shows and episodes only.

**Goal:** Design the complete **Hidden Tunes Podcast** ecosystem for launch planning by auditing existing search, discovery, backend, recommendation, playback, category, cache, and artwork systems — and mapping them to the planned category tree without disturbing working music flows.

---

## Executive summary

The mobile app has **no podcast ecosystem today**. A repo-wide search finds **zero** `podcast` references in `hidden-tunes-app`. The only adjacent infrastructure is:

| Adjacent system | Podcast relevance | Status |
|-----------------|-------------------|--------|
| **Music catalog** (`GET /api/songs`) | Could stream long MP3/M4A via `HiddenAudio` | **Music-only schema** — no show/episode/RSS model |
| **TV catalog** (`GET /api/tv/videos`) | `tv_taxonomy` includes `Podcasts` as a **video format** | **Video WebView path** — out of scope (do not merge with audio podcasts) |
| **Search waterfall** | Hidden Tunes + Audius + Archive | **Song-shaped results only** — no spoken-show metadata |
| **Discovery snapshot** | Mood rooms, genre spotlights, curated sections | **Song ranking only** |
| **PlayerContext** | Native audio via `HiddenAudio` | **Music UX** — lyrics, song queue auto-next, lock-screen song semantics |

Phase 5 must **introduce a parallel podcast plane**, mirroring the Phase 4 pattern (TV catalog + isolated playback owner), **not** extend the music song table or pollute `playSong` / `activeQueue` without a dedicated design review.

**Readiness:** **~0% wired** for podcasts. **~85% of patterns are reusable** from TV catalog API, universal search grouping, discovery lanes, cache TTLs, and artwork utilities.

**Biggest launch blockers:**

1. No backend `podcast_shows` / `podcast_episodes` tables or public API
2. No client types, catalog service, or discovery screen
3. No podcast-specific playback owner (resume position, episode queue, show subscribe)
4. Mature-topic categories require **admin moderation + App Store content rating** before surfacing

---

## 1. Existing search architecture

### Current pipeline

```text
Search tab (app/(tabs)/search.tsx)
  ├── Instant grouped: runInstantCatalogSearch(universalCatalog, query)
  │     └── songs · artists · albums · genreMoods · tv (when corpus injected)
  ├── Deferred fuzzy: runUniversalCatalogSearch (InteractionManager)
  ├── Network waterfall: runSearchWaterfall → Hidden Tunes API → Audius → Archive
  └── Filters: all | hidden | audius | archive | TV (redirect to /tv)
```

| Module | Role | Podcast reuse |
|--------|------|---------------|
| `services/universalSearchService.ts` | Grouped ranking, `searchTv` pattern | **Template for `searchPodcasts`** — add `podcastShows` / `podcastEpisodes` buckets |
| `services/instantCatalogSearch.ts` | Fast type-ahead caps | Same pattern with `INSTANT_LIMITS.podcasts` |
| `services/searchWaterfall.ts` | Song provider waterfall | **Do not merge** — keep podcasts out of song waterfall |
| `utils/searchQueryCache.ts` | 30 min TTL, debounced AsyncStorage | Reuse for podcast query cache key `podcast:{query}` |
| `components/UniversalSearchGroupedResults.tsx` | Section renderers | Extend with **Podcasts** section (future) — mirror TV section |
| `utils/catalogSearchIndex.ts` | Document scoring helpers | Reuse `scoreSearchDocument` / `buildSearchDocument` |

### Search fields today (`GET /api/songs`)

Backend search scans: `title`, `artist`, `artist_name`, `album`, `album_title`, `genre`, `mood` (`hidden-tunes-backend/routes/songs.js`). **No show name, episode number, transcript, or podcast category.**

### Podcast search integration strategy (recommended)

**Option A — Safest for launch (mirror TV chip):**

- Add Search filter **“Podcasts”** → submit redirects to `/podcasts?q=` (dedicated screen search)
- **Do not** alter `runSearchWaterfall` or grouped song results
- Preserves “Preserve existing search” rule literally

**Option B — Richer (post-launch):**

- Inject capped podcast corpus into `universalCatalog` (like `tvVideos`)
- Add `podcast:` hit ids; **do not strip** in grouped results (avoid Phase 4 TV strip bug)
- `onPodcastPress` → podcast detail or episode player — **separate route**, not `playSong`

**Hard rules:**

- Never label rows with RSS host names (Spotify, Apple Podcasts, etc.)
- `sourceName: "Hidden Tunes"` on all surfaced metadata
- Podcast search **parallel API** — not a filter on `/api/songs`

---

## 2. Existing discovery architecture

### Current pipeline

```text
Catalog snapshot (≤220 songs)
  → getSharedDiscoverySnapshot() [services/discoveryCache.ts]
  → moodRooms · genreSpotlights · curatedSections · becauseYouListened
  → Home / Explore rails
  → tap → openGenreCatalog / openMoodCatalog → /genre → unifiedCatalog → playSong
```

| Surface | File | Data | Podcast fit |
|---------|------|------|-------------|
| Home | `app/(tabs)/index.tsx` | `getSharedDiscoverySnapshot` | Add **podcast lanes** as separate rails — not inside song ranking |
| Explore | `app/(tabs)/explore.tsx` | Same snapshot + `ExploreListHeader` | Category grid for podcast browse roots |
| Genre hub | `app/genre.tsx` | `loadCatalogView` | **Wrong model** for shows — use `/podcast/[slug]` hub instead |
| Entry links | `SubtleTvEntryLink` | → `/tv` | Pattern for `SubtlePodcastEntryLink` → `/podcasts` (future) |
| Emotional chips | `EmotionalDiscoveryChips.tsx` | Built, partially mounted | Do not overload with podcast chips on Home until podcast catalog exists |

### Discovery integration strategy (recommended)

1. **New discovery owner:** `fetchPodcastHomeLanes()` — parallel to `fetchTvHomeLanes()` (Phase 4)
2. **Separate tab or top-level section:** `/podcasts` tab (or Explore stage) — **do not** mix episode cards into song carousels
3. **Reuse lane UI pattern:** horizontal `FlatList` + card component (like `TvVideoCard` → `PodcastShowCard` / `PodcastEpisodeCard`)
4. **Keep `getSharedDiscoverySnapshot` song-only** — add `getSharedPodcastDiscoverySnapshot()` or compose at screen level to avoid O(n) regression on music discovery
5. **Link-out from music where natural:** “Hidden Tunes Exclusives → Artist Interviews” as podcast lane, not as songs

---

## 3. Existing backend metadata systems

### Music catalog (production)

| Layer | Detail |
|-------|--------|
| API | `GET /api/songs` — Express + Supabase (`hidden-tunes-backend/routes/songs.js`) |
| Fields | title, artist, album, genre, mood, duration, audio_url, cover_url, type, source_type |
| Model | **Single-track** — album is a string field, not a show container |
| Ingest | Admin upload, artist submissions, R2 audio |

**Not suitable as primary podcast store** without overloading `songs` rows (wrong semantics, breaks listener ranking, lyrics UI, radio rooms).

### TV catalog (reference architecture — do not conflate)

| Layer | Detail |
|-------|--------|
| Tables | `tv_videos`, `tv_sources`, `tv_taxonomy` |
| Public API | `GET /api/tv/videos` with category/genre/mood/format filters |
| Taxonomy | `tv-ultra-premium-v2-foundation.sql` includes `('Podcasts', 'podcasts', 'format', 3160)` — **video format**, not audio RSS |
| Admin | Import, oEmbed, playback_status, approval gates |

**Rule:** Audio podcasts are **not** TV videos. Do not route podcast discovery through `tvCatalogApi` or WebView player.

### Recommended backend architecture (net-new)

Mirror TV catalog patterns with audio-first schema:

```text
┌─────────────────────────────────────────────────────────────┐
│                 Hidden Tunes Admin (ingest)                  │
│  RSS / manual upload · oEmbed or RSS parse · moderation      │
│  playback_status · category tree · mature_content flags      │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
   podcast_shows                      podcast_episodes
   (slug, title, artwork,             (show_id, title, audio_url,
    category_primary,                  duration, published_at,
    categories[], host_name,           episode_number, season,
    is_exclusive, is_featured,         playback_status, transcript)
    mature_rating)
          │                                 │
          └────────────────┬────────────────┘
                           ▼
              GET /api/podcasts/shows
              GET /api/podcasts/episodes
              GET /api/podcasts/home        (optional bundled lanes)
```

**Public query params (mirror TV):** `page`, `limit`, `q`, `category`, `collection`, `is_exclusive`, `is_featured`, `show_id`

**Ingest sources (server-side only):**

- Hidden Tunes hosted audio (R2) — **preferred for exclusives**
- RSS poll (Apple/Spotify URLs never shown — store `source_id` internally only)
- Manual admin episode create

**Branding contract:** Public JSON exposes `host_name`, `show_title`, `Hidden Tunes` as `sourceName` — never `itunes`, `spotify`, or feed provider names.

---

## 4. Existing recommendation systems

| System | File | Inputs | Podcast gap |
|--------|------|--------|-------------|
| Listener preferences | `services/listenerRanking.ts` | recentlyPlayed + favorites → genre/artist/album maps | **Song-only** — podcast listens would poison music recommendations if mixed |
| Shared discovery | `services/discoveryCache.ts` | 220 songs max | No show/episode ranking |
| Smart sections | `services/smartDiscovery.ts` | Genre/mood curated matchers | Music genres only |
| Smart related | `services/smartRelatedEngine.ts` | YouTube search | Dead / wrong domain |
| Onboarding prefs | `services/onboardingPrewarm.ts` | preferredGenres/Moods | Not wired to discovery ranking |
| Explore smart picks | `app/(tabs)/explore.tsx` | `becauseYouListenedRanked` | Song queue seeds |

### Recommendation strategy (recommended)

**Separate preference graph for podcasts:**

| Signal | Storage key (proposed) | Use |
|--------|------------------------|-----|
| Episode completes / 80% listened | `hidden_tunes_podcast_listen_history_v1` | Continue listening |
| Subscribed shows | `hidden_tunes_podcast_subscriptions_v1` | New episode badges |
| Category affinities | Derived from listen history | “Because you listened to **Business**” |
| Featured / exclusives | Admin `is_featured`, `is_exclusive` | Launch lanes |

**Do not** feed podcast plays into `buildListenerPreferenceMaps` until explicitly designed — avoids Afrobeat recommendations skewing after a user listens to **Finance** podcasts.

**Launch recommendation rails (minimal):**

1. **Continue Listening** — last in-progress episodes (position persisted separately from music `POSITION_KEY`)
2. **Featured Now** — admin `is_featured`
3. **Hidden Tunes Originals** — `is_exclusive = true`
4. **Because you listened** — same primary category as last completed episode
5. **New This Week** — `published_at DESC`

**Defer:** ML embeddings, cross-media “song + podcast” bundles, collaborative filtering.

---

## 5. Existing playback compatibility

### Native audio stack

| Component | Capability | Podcast implication |
|-----------|------------|---------------------|
| `modules/HiddenAudio.ts` | load, play, pause, seek, getStatus | **Engine can play long MP3/M4A** — no technical block for 60–180 min episodes |
| `context/PlayerContext.tsx` | `playSong`, `activeQueue`, auto-next, lock screen | **Music semantics** — lyrics, 4s min duration finish window, song recently played |
| `services/recentlyPlayedEngine.ts` | Unified recently played list | Types: local, audius, archive, youtube — **no podcast** |
| Position persist | `hidden_tunes_position` | **Per current song id** — needs **per-episode** key for resume |
| YouTube / TV | WebView owner, `stopPlayback()` on enter | **Separate** — podcasts must not use WebView |

### Compatibility assessment

| Approach | Verdict |
|----------|---------|
| Upload episodes as `/api/songs` rows | **Reject for launch** — breaks search, discovery, lyrics, queue UX |
| Reuse `HiddenAudio` inside **new podcast playback owner** | **Recommended** — same engine, isolated state (mirror TV vs music split) |
| Reuse `playSong` + `activeQueue` for episodes | **Reject without redesign** — auto-next would chain episodes like songs; lock screen shows lyrics panel |
| Archive.org spoken word via waterfall | **Reject for podcast product** — unmoderated, provider leakage risk, no category tree |

### Playback rules (preserve existing music playback)

1. **Do not modify** `PlayerContext.playSong`, `activeQueue`, or queue tab in Phase 5 build queues
2. Podcast play enters **`/podcast-player`** (or equivalent) — pauses music via existing `stopPlayback()` / pause pattern
3. Episode queue is **show-scoped or user-built** — not merged into music `activeQueue`
4. Resume position: **`hidden_tunes_podcast_position_{episodeId}`** — separate from music position key
5. CarPlay / Android Auto: **defer** — out of scope per queue rules

---

## 6. Existing category infrastructure

### Music categories (client)

| File | Scope |
|------|-------|
| `utils/genreAliases.ts` | 29 core **music** genres + `MOOD_TAGS` (layer 3, unused in UI) |
| `utils/genres.ts` | `HIDDEN_TUNES_GENRES` for search chips |
| `utils/catalogResolver.ts` | `CatalogResolverType` includes `"category"` — used for music hub matching |
| `utils/moodRooms.ts` | Mood labels for songs |
| `services/smartDiscovery.ts` | `PRIORITY_DISCOVERY_SECTIONS` — music curated |

### TV taxonomy (server — reference only)

`tv_taxonomy` in `tv-ultra-premium-v2-foundation.sql` — rich genre/mood/format/collection slugs including **Podcasts (video format)**. Useful as a **pattern** for slug + `kind` + sort_order, not as podcast audio categories.

### Podcast category infrastructure (recommended)

New table **`podcast_categories`** (or JSON taxonomy file in admin):

| Field | Example |
|-------|---------|
| `slug` | `african-business` |
| `title` | African Business |
| `group` | `african-content` |
| `sort_order` | 4100 |
| `mature` | false |
| `launch_visible` | true |

Shows link via `primary_category` + `categories[]` tags (max 3 for UI).

---

## 7. Complete category tree (launch plan)

User-facing names only — all slugs stored admin-side.

### Business & culture

```text
Hidden Tunes Podcasts
├── Business
│   ├── Business
│   ├── Technology
│   ├── Finance
│   ├── Entrepreneurship
│   ├── Education
│   ├── History
│   ├── News
│   ├── Politics
│   ├── Sports
│   ├── Music
│   ├── Culture
│   ├── Comedy
│   ├── Storytelling
│   ├── Entertainment
│   ├── Faith
│   ├── Health
│   └── Motivation
```

### Life & relationships

```text
├── Life & Relationships
│   ├── Relationships
│   ├── Dating
│   ├── Marriage
│   ├── Family
│   ├── Parenting
│   ├── Breakup Recovery
│   ├── Communication
│   ├── Personal Development
│   ├── Men's Growth
│   ├── Women's Growth
│   ├── Self Improvement
│   └── Life Advice
```

### Mature topics (gated)

```text
├── Mature Topics                    [requires mature gate + admin allowlist]
│   ├── Adult Conversations
│   ├── Intimacy
│   ├── Relationship Advice
│   ├── Human Psychology
│   ├── Real Life Stories
│   ├── Modern Relationships
│   ├── Marriage Challenges
│   └── Dating Culture
```

### African content

```text
├── African Content
│   ├── African Voices
│   ├── African Business
│   ├── African History
│   ├── African Culture
│   ├── African Entrepreneurship
│   ├── African Relationships
│   └── African Faith
```

### Hidden Tunes exclusives

```text
└── Hidden Tunes Exclusives
    ├── Hidden Tunes Originals
    ├── Creator Shows
    ├── Artist Interviews
    ├── Behind The Music
    ├── Music Industry
    └── Hidden Tunes Stories
```

**Total leaf categories:** 58  
**Browse groups:** 5 top-level roots (+ Mature gated subtree)

---

## 8. Launch category recommendations

Ship **content-filled lanes**, not an empty 58-chip grid.

### Tier 1 — Launch day home lanes (8)

| Lane | Category filter | Why |
|------|-----------------|-----|
| Featured Now | `is_featured` | Editorial control |
| Hidden Tunes Originals | exclusives group | Brand differentiator |
| Business & Money | Business + Finance + Entrepreneurship | Broad appeal |
| Culture & Storytelling | Culture + Storytelling + Entertainment | Engagement |
| Faith & Motivation | Faith + Motivation | Aligns with catalog audience |
| African Voices | African Content group | Core brand |
| Health & Growth | Health + Personal Development | Wellness segment |
| Comedy & Conversation | Comedy + Life Advice | Discovery hook |

### Tier 2 — Browse grid (launch week)

All **Life & Relationships** + **African Content** leaves with ≥8 episodes each.

### Tier 3 — Deferred until moderation pipeline

**Entire Mature Topics group** — App Store 17+ / content declarations / admin review queue required.

### Tier 4 — Post-launch expansion

News, Politics, Sports — higher moderation and freshness burden (RSS churn).

---

## 9. Existing caching systems

| Cache | Key / TTL | Owner | Podcast adaptation |
|-------|-----------|-------|-------------------|
| Discovery snapshot | In-memory keyed fingerprint | `discoveryCache.ts` | **Separate** podcast home cache — do not bloat music snapshot |
| Catalog view | 28 entries in-memory + persisted | `unifiedCatalog.ts` | `podcastShowViewCache` per show slug |
| Search results | 30 min, 24 memory entries | `searchQueryCache.ts` | `podcast:{source}:{query}` |
| TV home | 12h AsyncStorage | `tvCatalogApi.ts` | **`PODCAST_HOME_CACHE_TTL_MS = 12h`** same pattern |
| Catalog songs | `hiddenTunesApi` hydrate | Large persisted catalog | Podcast episodes **paginated** — never full corpus on device |
| Image preload | 512 URL session cap | `imagePreloader.ts` | Reuse; square show art prioritized |

### Cache strategy (recommended)

1. **Podcast home lanes:** AsyncStorage `hidden_tunes_podcast_home_cache_v1`, 12h TTL, paint-from-cache-first
2. **Stagger lane fetches:** max 3 concurrent (lesson from Phase 4 TV `Promise.all` heat risk)
3. **Episode lists:** in-memory per `show_id` + page, 10 min TTL
4. **Search:** debounced network + optional flatten-home-cache for offline type-ahead (cap **≤200 episodes** in memory index)
5. **Listen progress:** AsyncStorage per episode — **not** in home cache payload
6. **Invalidation:** refresh on `/podcasts` focus if TTL expired; no background polling

---

## 10. Existing artwork handling

| Utility | Behavior | Podcast use |
|---------|----------|-------------|
| `utils/artwork.ts` | HTTPS normalize, fallback logo, failed URL LRU (512) | Show + episode art |
| `utils/imagePreloader.ts` | Batch 1, max 4, skips during playback | Lane prefetch only when idle |
| `components/MediaCard.tsx` | Song cards | Pattern for podcast cards |
| `getArtworkUri` / `getArtworkValue` | Multi-field extract | Map `show.artwork_url`, `episode.artwork_url` |
| Backend fallback | Unsplash default in songs API | Admin-required **1400×1400** show art — avoid generic fallback for podcasts |

### Artwork strategy (recommended)

| Asset | Spec | Source |
|-------|------|--------|
| Show cover | 1400×1400 min, JPG/WEBP HTTPS | Admin upload or RSS `<itunes:image>` ingested to R2 |
| Episode art | Optional; fallback to show cover | RSS or admin |
| Placeholder | Hidden Tunes logo via `FALLBACK_ARTWORK` | Only when URL missing |
| Caching | `expo-image` + `recyclingKey={show.id}` | Same as `TvVideoCard` |
| Prefetch | First 4 visible lane cards on Wi‑Fi / idle | Respect `shouldRunNonEssentialWork()` |

**Do not** hotlink third-party CDN URLs in production without proxying through R2 (RSS feed URLs break; branding leak).

---

## 11. Performance risks

| Risk | Cause | Mitigation |
|------|-------|------------|
| Home cold start burst | 8+ parallel lane API calls | Stagger + bundled `/api/podcasts/home` later |
| Large episode lists | Loading full show back catalog | Paginate 20/page; virtualize lists |
| Memory | Flattening all episodes for search | Cap corpus at 200 for instant index |
| Duplicate network | Search + home refresh together | Share in-flight dedup ref (pattern in `search.tsx` TV fetch) |
| Audio preload | Preloading next **episode** while playing | **Disable** until podcast player exists — long files costly |
| Discovery regression | Adding podcasts to `getSharedDiscoverySnapshot` | Keep snapshots separate |
| RSS ingest on client | Temptation to poll feeds in app | **Server-only** scheduled ingest |
| Mature content flash | Wrong cache serving unapproved episode | Public API filters: `status=approved`, `playback_status=playable` |

---

## 12. App review risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| User-generated / unmoderated RSS | High | Admin approval before public API; no arbitrary URL subscribe in v1 |
| Mature Topics categories | High | Age gate, 17+ rating, `mature_content` flag, hidden until allowlist |
| Misleading “podcast app” without content | Medium | Do not ship empty Podcast tab — Tier 1 lanes must have episodes |
| Third-party branding | Medium | Hidden Tunes labels only; no Apple Podcasts / Spotify badges |
| Background audio entitlement | Low | Same as music if using `HiddenAudio` — document episode vs song in review notes |
| News / Politics editorial | Medium | Editorial policy; geo restrictions if needed |
| Health / Faith advice disclaimers | Medium | Standard “informational only” copy in show descriptions |
| Duplicate functionality (music + podcast + TV) | Low | Clear tab separation; review notes explain three media types |

---

## 13. Safest implementation order

No code in this queue — recommended sequence for future build phases:

1. **Backend schema + admin** — `podcast_shows`, `podcast_episodes`, categories taxonomy, moderation fields, R2 audio ingest
2. **Public API** — `GET /api/podcasts/shows`, `/episodes`, filters matching TV catalog params
3. **Content seeding** — Fill Tier 1 launch lanes (≥8 episodes per lane) before any client surface
4. **Client service only** — `podcastCatalogApi.ts` (mirror `tvCatalogApi.ts`) + types + home cache
5. **Discovery screen** — `/podcasts` tab with lane UI (reuse TV horizontal pattern, **no music UI changes**)
6. **Search chip** — “Podcasts” redirect to `/podcasts?q=` (Option A — preserves song search)
7. **Podcast playback owner** — new route + `HiddenAudio` wrapper; **do not touch** `PlayerContext.playSong`
8. **Continue listening + subscriptions** — separate AsyncStorage keys
9. **Grouped search Option B** — inline podcast section after launch stable
10. **Tier 2 categories + African / Life grids**
11. **Mature Topics** — only after moderation UI + App Store rating update
12. **Recommendations v2** — category affinity rails, not cross-media listener maps

**Explicitly defer:** Desktop podcast UI, CarPlay episodes, Android Auto, TV podcast video format merge, Archive.org podcast waterfall, client RSS parsing.

---

## 14. Reusable files checklist

| Area | Reuse from | New (future) |
|------|------------|--------------|
| Catalog API pattern | `services/tvCatalogApi.ts` | `services/podcastCatalogApi.ts` |
| Search grouping | `services/universalSearchService.ts` (`searchTv`) | `searchPodcasts`, `searchPodcastEpisodes` |
| Instant search | `services/instantCatalogSearch.ts` | Podcast limits + corpus injection |
| Grouped UI | `components/UniversalSearchGroupedResults.tsx` | Podcast section + handlers |
| Discovery entry | `components/EmotionalDiscoveryChips.tsx` | `SubtlePodcastEntryLink` |
| Lane screen | `app/(tabs)/tv.tsx` | `app/(tabs)/podcasts.tsx` |
| Card | `components/tv/TvVideoCard.tsx` | `PodcastShowCard`, `PodcastEpisodeRow` |
| Cache TTL pattern | `TV_HOME_CACHE_*` constants | `PODCAST_HOME_CACHE_*` |
| Artwork | `utils/artwork.ts`, `utils/imagePreloader.ts` | Show/episode field mapping |
| Search cache | `utils/searchQueryCache.ts` | Podcast source keys |
| Admin reference | `lib/tvCatalog.ts`, `app/api/tv/videos/route.ts` | Podcast admin + public routes |
| Native engine | `modules/HiddenAudio.ts` | Podcast player wrapper only |

**Do not reuse for podcasts:** `playSong`, `searchWaterfall`, `getSharedDiscoverySnapshot`, `tvCatalogApi`, `youtube-player`, music `type: "r2"` normalizer.

---

## 15. Validation (this queue)

- [x] Audit only — no feature or UI implementation
- [x] No playback / queue / TV / Desktop / CarPlay / Android Auto changes
- [x] Complete category tree documented (58 leaves, 5 roots)
- [x] Launch recommendations, backend/search/discovery/rec/cache/artwork strategies defined
- [ ] Future build queues: backend → client service → `/podcasts` screen → isolated player

**Related audits:** [Phase 2 discovery](./phase-2-discovery-audit.md), [Phase 3 radio browser](./phase-3-radio-browser-audit.md), [Phase 4 video discovery](./phase-4-video-discovery-audit.md), [Search flow](./search-flow-audit.md), [Memory + battery safety](./memory-battery-safety-audit.md).
