# Media Scale Architecture — Radio + Podcast

Phase **MEDIA-SCALE-A** — audit and design only. No backend implementation, no playback changes, no HiddenAudio native changes.

This document unifies scalable **radio** and **podcast** catalog design. It supersedes scope for future implementation phases; see also [radio-20k-architecture.md](./radio-20k-architecture.md) for radio-specific migration notes.

---

## Goals

| Domain | Backend target | Mobile constraint |
|--------|----------------|-------------------|
| Radio | 20,000+ indexed · 5,000+ quality-approved · mature/18+ gated | Zero stations at startup |
| Podcast | Backend-indexed shows + episodes at scale | Zero full catalog at startup |

Shared principles:

- Backend owns indexing, search, quality scoring, mature classification, stream/feed validation
- Mobile lazy-loads **40 items/page** only when a screen is opened
- Mature content **OFF by default** with explicit consent before play/open
- Existing music, radio, podcast, and video playback paths remain unchanged

---

## Current State Audit

### Radio

| Area | Today | Scale gap |
|------|-------|-----------|
| `services/radio/radioBrowserApi.ts` | Direct Radio Browser API from device; 32/page; search max 120 | No backend index; no mature gating; no quality tiers |
| `services/radio/radioCache.ts` | Memory + AsyncStorage; 18h TTL; up to 2,000 stations/key | Stores full `streamUrl`; no mature metadata |
| `services/radio/radioNormalizer.ts` | Radio Browser → `HiddenTunesStation` | No `isMature`, `contentRating`, `qualityTier` |
| `hooks/useLazyRadioStationList.ts` | Cache-first infinite scroll | Good pattern — swap `loadPage` to backend API |
| `types/radio.ts` | Full station + lightweight list item | Missing mature + rating fields |
| `constants/radioCategories.ts` | 12 static categories → Radio Browser tags | No backend category IDs; no mature lane |
| `app/stations/index.tsx` | Categories only, no station fetch | ✅ Correct baseline |
| `app/stations/[categoryId].tsx` | Lazy category browse | Hits third-party API |
| `app/stations/search.tsx` | Debounced search (350ms) | Device-side Radio Browser search |

### Podcast

| Area | Today | Scale gap |
|------|-------|-----------|
| `services/podcastCatalogApi.ts` | Hidden Tunes admin API (`/api/podcasts/shows`, `/api/podcasts/episodes`); 20–24/page | Partial backend; no mature fields; no dedicated search/categories endpoints |
| `services/podcastDiscoveryApi.ts` | Category + search wrappers; single-page fetch (24–30 items) | No infinite scroll pagination; prefetch helpers exist |
| `utils/podcastDiscoveryCache.ts` | 12h TTL; 32 memory keys | Caches full first page only; no page-level keys |
| `utils/launchPodcastCategories.ts` | ~15 static categories with `catalogQuery` | Client-side category config; no backend `/categories` |
| `types/podcast.ts` | Minimal `PodcastEpisode` playback shape | No mature/rating on catalog types |
| `app/podcasts/index.tsx` | Categories + inline search (page 1 only) | No trending/new/continue lanes at scale |
| `app/podcasts/[categoryId].tsx` | Single fetch per category | No 40/page lazy load |
| `app/podcasts/show/[showId].tsx` | Episodes page 1 only (30 max) | No episode pagination; no mature gate |

### Playback (unchanged in this phase)

- Radio: `usePlaybackRouter().playRadioStation` → live stream
- Podcast: `usePlaybackRouter().playPodcastEpisode` → existing podcast adapter
- `PlayerContext` already saves playback position — basis for **continue listening**

---

## Target Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Supabase (Postgres)                           │
│  radio_stations · radio_categories · radio_station_categories        │
│  podcast_shows · podcast_episodes · podcast_categories               │
│  podcast_listen_progress (continue listening)                          │
│  media_quality_reviews · media_search_documents                      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│              Hidden Tunes Media API (admin.hiddentunes.com)           │
│  GET /api/radio/categories | /stations | /search                     │
│  GET /api/podcasts/categories | /shows | /search                     │
│  GET /api/podcasts/shows/:id/episodes                                │
│  (+ internal ingest / validate / admin — not mobile)                 │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                        Mobile app (Expo)                              │
│  Startup: 0 radio stations · 0 podcast catalog                       │
│  Browse/search: 40/page lazy loads                                   │
│  Mature OFF default · consent modal on tap                           │
│  Playback: existing router — no rewrite                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 1. Radio Architecture

### Scale tiers

| Tier | Count | Mobile visibility |
|------|-------|-------------------|
| `indexed` | 20,000+ | Backend/ingest only |
| `approved` | 5,000+ | Default browse + search |
| `featured` | 500+ | Curated lanes / home rows |

### Quality scoring (backend)

Automated signals combined with editorial override:

- Stream health (last successful validation)
- Bitrate / codec suitability
- Vote / click popularity (from ingest source)
- Duplicate stream dedupe (`stream_url_hash`)
- Broken-station auto-demotion (`is_broken`)

Mobile receives `qualityTier` optionally for sort badges; scoring math stays on backend.

### Browse + search

- **Categories:** metadata only on `/stations` — no station rows
- **Category page:** `GET /api/radio/stations?category=&page=&limit=40`
- **Search:** `GET /api/radio/search?q=&page=&limit=40` — full-text on name, tags, genre, country, language
- **Stream URL:** issued on play via backend (not bulk-loaded in list responses)

### Radio list item (mobile-safe JSON)

```json
{
  "id": "uuid",
  "title": "Smooth Jazz FM",
  "country": "US",
  "genre": "Jazz",
  "tags": ["jazz", "smooth"],
  "subtitle": "US · Jazz",
  "isMature": false,
  "contentRating": "clean"
}
```

No `stream_url`, ingest metadata, or provider identifiers in list/search payloads.

---

## 2. Podcast Architecture

### Indexed catalog

- **Shows** — title, host, description, artwork URL, categories, language, episode count, featured flags
- **Episodes** — per-show paginated list; audio URL fetched or included only on play/deep link
- Ingest from RSS / partner feeds / manual admin — **never** bulk RSS parse on device

### Discovery lanes (backend-driven)

| Lane | Endpoint pattern | Mobile behavior |
|------|------------------|-----------------|
| Categories | `GET /api/podcasts/categories` | Grid on `/podcasts` — no shows |
| Category browse | `GET /api/podcasts/shows?category=&page=&limit=40` | Lazy 40/page |
| Search | `GET /api/podcasts/search?q=&page=&limit=40` | Title, show, host, category, language |
| Trending | `GET /api/podcasts/shows?collection=trending&page=&limit=40` | Optional home row |
| New episodes | `GET /api/podcasts/shows?collection=new_episodes&page=&limit=40` or dedicated episodes feed | Cross-show recent episodes |
| Continue listening | Local progress + `GET /api/podcasts/shows/:id/episodes?episode_ids=` | Resume in-progress episodes only |

### Podcast show list item

```json
{
  "id": "uuid",
  "slug": "tech-talk-daily",
  "title": "Tech Talk Daily",
  "hostName": "Jane Doe",
  "primaryCategory": "Technology",
  "categories": ["Technology", "Business"],
  "language": "en",
  "episodeCount": 142,
  "isMature": false,
  "contentRating": "clean"
}
```

### Podcast episode list item

```json
{
  "id": "uuid",
  "showId": "uuid",
  "title": "Episode 42: AI Tools",
  "publishedAt": "2026-06-01T08:00:00Z",
  "durationSeconds": 2340,
  "episodeNumber": 42,
  "isMature": false,
  "contentRating": "clean"
}
```

`audio_url` omitted from list responses; returned on play or `GET /api/podcasts/episodes/:id/play`.

### Continue listening

- **Local:** AsyncStorage keys for in-progress podcast episodes (position, episode id, show id, updatedAt)
- **Sync (optional later):** `podcast_listen_progress` table keyed by user + episode
- Home/podcasts screen loads **only** user's in-progress rows (typically ≤20), not full catalog
- No RSS re-fetch to rebuild continue list

---

## 3. Backend Tables

### `radio_stations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `slug` | `text` unique | |
| `name` | `text` not null | |
| `stream_url` | `text` not null | Backend only |
| `stream_url_hash` | `text` | Dedupe |
| `logo_url` | `text` nullable | |
| `country_code` | `char(2)` | |
| `language` | `text` | |
| `tags` | `text[]` | |
| `genre` | `text` | |
| `bitrate` | `int` | |
| `codec` | `text` | |
| `quality_tier` | `text` | `indexed` \| `approved` \| `featured` |
| `quality_score` | `numeric` | 0–100 |
| `is_active` | `boolean` | |
| `is_broken` | `boolean` | Backend health checks |
| **`is_mature`** | **`boolean` default false** | 18+ gate |
| **`mature_reason`** | **`text` nullable** | Audit: tag match, manual review, etc. |
| **`content_rating`** | **`text` default 'clean'** | **`clean` \| `explicit` \| `adult`** |
| `featured_rank` | `int` nullable | |
| `last_checked_at` | `timestamptz` | |
| `created_at` / `updated_at` | `timestamptz` | |

### `podcast_shows`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `slug` | `text` unique | |
| `title` | `text` not null | |
| `description` | `text` | |
| `artwork_url` | `text` | |
| `host_name` | `text` | |
| `primary_category` | `text` | |
| `categories` | `text[]` | |
| `language` | `text` | |
| `rss_feed_url` | `text` | Backend only |
| `episode_count` | `int` | Denormalized |
| `is_featured` | `boolean` | |
| `is_exclusive` | `boolean` | |
| **`is_mature`** | **`boolean` default false** | |
| **`mature_reason`** | **`text` nullable** | |
| **`content_rating`** | **`text` default 'clean'** | **`clean` \| `explicit` \| `adult`** |
| `trending_score` | `numeric` | Backend computed |
| `last_episode_at` | `timestamptz` | For new-episodes lanes |
| `created_at` / `updated_at` | `timestamptz` | |

### `podcast_episodes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `show_id` | `uuid` FK | |
| `title` | `text` not null | |
| `description` | `text` | |
| `artwork_url` | `text` | |
| `audio_url` | `text` | Backend / play endpoint |
| `duration_seconds` | `int` | |
| `published_at` | `timestamptz` | |
| `episode_number` | `int` | |
| `season_number` | `int` | |
| **`is_mature`** | **`boolean` default false** | Episode can override show default |
| **`mature_reason`** | **`text` nullable** | |
| **`content_rating`** | **`text` default 'clean'** | **`clean` \| `explicit` \| `adult`** |
| `is_active` | `boolean` | |
| `created_at` / `updated_at` | `timestamptz` | |

### Supporting tables

- **`radio_categories`** / **`podcast_categories`** — id, title, subtitle, icon, gradient, `is_mature`, `sort_order`, filter config
- **`radio_station_categories`** — M2M station ↔ category
- **`podcast_listen_progress`** — `user_id`, `episode_id`, `position_ms`, `updated_at` (optional cloud sync)
- **`media_search_documents`** — tsvector / FTS helpers for radio + podcast at scale

### Mature classification rules (backend)

1. Show/station inherits `content_rating` from RSS `<itunes:explicit>` or tag dictionaries
2. Manual admin override sets `mature_reason`
3. Episode-level `is_mature` wins over show when set
4. `content_rating`: `clean` (default) · `explicit` (language/themes) · `adult` (18+ talk/adult content)

---

## 4. API Endpoints

Base URL: `https://admin.hiddentunes.com`

### Global query parameter — mature content

| Param | Default | When `true` |
|-------|---------|-------------|
| `includeMature` | `false` (omitted) | Include rows where `is_mature = true` |

**Both conditions required for mature results:**

1. API request includes `includeMature=true`
2. Mobile user setting **Show 18+ content** is enabled

If user setting is OFF, mobile must not send `includeMature=true` even if UI attempted toggle without consent.

### Radio

| Method | Path | Query params | Response |
|--------|------|--------------|----------|
| `GET` | `/api/radio/categories` | — | `{ categories: [...] }` — no stations |
| `GET` | `/api/radio/stations` | `category`, `page`, `limit` (max 40), `includeMature` | `{ stations, pagination }` |
| `GET` | `/api/radio/search` | `q`, `page`, `limit` (max 40), `includeMature` | `{ stations, pagination }` |

Default filter: `quality_tier IN ('approved', 'featured')`, `is_active = true`, `is_broken = false`, **`is_mature = false` unless `includeMature=true`**.

### Podcast

| Method | Path | Query params | Response |
|--------|------|--------------|----------|
| `GET` | `/api/podcasts/categories` | — | `{ categories: [...] }` |
| `GET` | `/api/podcasts/shows` | `category`, `collection` (`trending`, `new_episodes`, `featured`), `page`, `limit` (max 40), `includeMature` | `{ shows, pagination }` |
| `GET` | `/api/podcasts/search` | `q`, `page`, `limit` (max 40), `includeMature`, optional `language`, `category` | `{ shows, pagination }` — searches title, show, host, category, language |
| `GET` | `/api/podcasts/shows/:id/episodes` | `page`, `limit` (max 40), `includeMature` | `{ episodes, pagination }` |

### Pagination contract (all list endpoints)

```typescript
type MediaPagination = {
  page: number;       // 1-based
  limit: number;      // max 40
  total: number;
  totalPages: number;
  hasMore: boolean;
};
```

---

## 5. Mature Content Rules

### Defaults

- **Mature OFF** at first launch
- All API calls omit `includeMature` (equivalent to `false`)
- Mature categories hidden on browse home screens
- Search excludes mature stations/shows/episodes

### Enabling mature browsing

1. User opens Settings → **Show 18+ radio & podcasts**
2. Display **18+ consent modal** (legal copy, Confirm / Cancel)
3. **Confirm:** persist locally:
   - `hidden_tunes_media_mature_enabled = true`
   - `hidden_tunes_media_mature_consent_at` (ISO timestamp)
   - `hidden_tunes_media_mature_consent_version = 1`
4. **Cancel:** setting remains OFF; no API change

When enabled, mobile adds `includeMature=true` to radio/podcast list and search requests.

### UI badges

- Mature rows show **18+** badge when `isMature === true` or `contentRating === 'adult'`
- `explicit` rating may show **E** badge (optional, non-blocking)

### Tap to play / open

Even with mature browsing enabled:

1. User taps mature **station**, **show**, or **episode**
2. If consent not recorded for current `consent_version`, show **18+ consent modal**
3. **Confirm** → proceed (fetch stream/audio if needed) → existing playback router
4. **Cancel** → **do not play, do not open show, do not fetch stream/audio**

Inherited maturity: tapping an episode inherits show `is_mature` when episode flag unset; episode-level mature always wins.

### Disabling mature content

When user turns OFF **Show 18+**:

- Clear all mature consent keys
- Purge cache entries fetched with `includeMature=true` (keys suffixed `:mature`)
- Reset in-flight requests
- Mature badges and rows disappear on next fetch

---

## 6. Mobile Rules

### Startup

| Asset | Load at startup? |
|-------|------------------|
| Radio stations | **No** |
| Podcast shows/episodes | **No** |
| Category metadata | Optional lightweight cache (≤30 rows total) |
| Continue listening | Local progress only (≤20 rows) |

### Pagination

| Screen | Page size | Pattern |
|--------|-----------|---------|
| Radio category | 40 | `useLazyRadioStationList` + backend `loadPage` |
| Radio search | 40 | Debounced query; append on scroll |
| Podcast category | 40 | Migrate to lazy hook (mirror radio) |
| Podcast search | 40 | Paginated backend search |
| Podcast episodes | 40 | Infinite scroll on show screen |

Never render arrays > current loaded pages in memory without virtualization (FlatList required).

### Caching

| Data | Cache | TTL | Max |
|------|-------|-----|-----|
| Category metadata | Yes | 24h | ~30 categories |
| List pages (no stream/audio URL) | Yes | 18h radio / 12h podcast | 200 rows/key |
| Search pages | Yes | 30m | 200 rows/query |
| Stream / episode audio URL | On play only | Session | 1 per tap |
| Artwork | Per visible row | Standard image cache | **No bulk prefetch** |

**Never on device:**

- Full 20k radio export
- Full podcast catalog dump
- Bulk stream or RSS validation
- Preload mature artwork when mature setting is OFF

### Artwork

- Load artwork for **visible rows only** (`HTImage` / `Image` lazy)
- When mature OFF: skip prefetch for any row with `isMature` (should not appear anyway)
- When mature ON: still no batch prefetch — scroll-driven only

### Search

- Minimum query length: 2 characters
- Debounce: ~350ms (keep current radio/podcast UX)
- Abort stale requests (keep existing AbortController patterns)
- Client never filters thousands of records — server returns paginated slice

---

## What Must Stay on Backend

| Responsibility | Radio | Podcast |
|----------------|-------|---------|
| Bulk ingest / index | ✅ | ✅ |
| Full-text search | ✅ | ✅ |
| Quality scoring & approval | ✅ | — |
| Stream / feed validation | ✅ | ✅ |
| Mature classification | ✅ | ✅ |
| Featured / trending / new episode ranking | ✅ | ✅ |
| RSS fetch + parse | — | ✅ |
| Rate limiting | ✅ | ✅ |
| Dedupe | stream hash | show slug + audio URL |

---

## What Mobile Can Safely Cache

- Category lists (small, static-ish)
- Recent browse/search **pages** (metadata only)
- User mature preference + consent timestamp
- Continue-listening progress (local first)
- Single stream/audio URL for currently playing item

---

## Migration Phases (future — not this phase)

### MEDIA-SCALE-B — Backend

- Supabase migrations for tables above
- Radio ingest from Radio Browser → `indexed` → promote to `approved`
- Podcast RSS ingest pipeline
- Implement all public API endpoints with `includeMature` filtering
- FTS indexes for search

### MEDIA-SCALE-C — Mobile adapters

- `services/radio/radioCatalogApi.ts` — replace Radio Browser calls
- Extend `podcastCatalogApi.ts` — categories, search, paginated episodes, mature params
- Unified `useLazyMediaList` or extend existing radio hook for podcasts
- Mature settings screen + consent modal component
- Continue listening row on `/podcasts`
- Bump all page sizes to 40

### MEDIA-SCALE-D — Deprecate legacy paths

- Feature flag `MEDIA_USE_BACKEND_INDEX=true`
- Remove direct Radio Browser from production mobile builds
- Remove `prefetchPodcastShowsForCategory` / episode prefetch helpers

---

## Non-Goals (this phase)

- No Supabase migrations or API code
- No playback / HiddenAudio / queue changes
- No loading 20k radio stations or huge podcast catalogs on device
- No on-device stream or feed validation
- No logo/artwork preload passes
- No breaking changes to music, video, or existing playback

---

## Validation Checklist (implementation)

- [ ] Cold start: zero radio + zero podcast catalog network requests
- [ ] `/stations` and `/podcasts` open with categories only
- [ ] Category pages fetch exactly 40 items per page
- [ ] Search fetches 40/page from backend; mature excluded when OFF
- [ ] Mature ON + consent: mature results appear with 18+ badge
- [ ] Tap mature item without consent: modal; cancel does not play/open
- [ ] Disable mature: consent cleared; mature cache purged
- [ ] Continue listening shows local progress only
- [ ] Existing radio/podcast/music/video playback unchanged
- [ ] `npm run typecheck` passes
- [ ] `npx expo config --type introspect --json` passes
