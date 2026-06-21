# Radio 20K+ Architecture

Phase **RADIO-20K-A** — audit and design only. No backend implementation or playback changes in this phase.

## Goals

- Index **20,000+** radio stations on the backend
- Surface **5,000+** quality-approved stations to mobile browse/search
- Promote **500+** featured stations in curated lanes
- Gate **mature / 18+** content behind explicit user consent
- Keep the mobile app fast: **zero stations at startup**, paginated lazy loads only

## Current State (Audit)

### `services/radio/`

| File | Role today | 20K gap |
|------|------------|---------|
| `radioBrowserApi.ts` | Direct Radio Browser API client; category/search pagination (max 40/page); abort + dedupe | Hits third-party API from device; no mature gating; no quality tiers; search capped at 120 results |
| `radioCache.ts` | In-memory + AsyncStorage cache per category/search key; 18h TTL; max 2,000 stations/key | Can grow unbounded per key on device; stores full `streamUrl` blobs; no mature/consent metadata |
| `radioNormalizer.ts` | Radio Browser raw → `HiddenTunesStation`; playback → `AppSong` via `radioStationToAppSong` | No mature flags; favicon passed through; HTTPS stream filter only |

**Key constants today**

- `RADIO_STATION_PAGE_SIZE = 32` (API allows up to 40)
- `RADIO_SEARCH_MAX_RESULTS = 120`
- Page fetch timeout: 12s
- Cache TTL: 18 hours

### `app/stations/`

| Screen | Behavior today | 20K gap |
|--------|----------------|---------|
| `index.tsx` | Static category grid from `RADIO_CATEGORIES`; **no station fetch** | Good baseline — categories only |
| `[categoryId].tsx` | Lazy list via `useLazyRadioStationList` + `loadRadioCategoryPage` | Fetches Radio Browser by tag/country/top-votes; no mature filter |
| `search.tsx` | Debounced search (350ms); lazy pages via `loadRadioSearchPage` | Device-side name search against Radio Browser; no mature gating |

### `hooks/useLazyRadioStationList.ts`

- Initializes from memory cache page 0 when available (not startup-global)
- Hydrates AsyncStorage on mount; fetches page 0 if stale
- `loadMore` appends by offset = `listItems.length`
- Keeps full `HiddenTunesStation` (incl. `streamUrl`) in a ref map for playback on tap
- **Reusable pattern** for backend pagination — swap `loadPage` implementation only

### `types/radio.ts`

- `RadioBrowserStationRaw` — third-party shape
- `HiddenTunesStation` — cached full record with `streamUrl`
- `RadioStationListItem` — list row without stream URL (good for FlatList)
- **Missing:** `isMature`, `contentRating`, `qualityTier`, `featuredRank`, backend `stationId`

### `constants/radioCategories.ts`

- 12 hard-coded mood/genre categories with Radio Browser `tag`, `countryCode`, or `useTopVotes`
- Each maps to a listening-room query for `/radio` song fallback
- **Missing:** mature category, featured lane config, backend category IDs

### Related (unchanged in this phase)

- `app/radio.tsx` — song listening rooms (YouTube/catalog), separate from live station browse
- `components/radio/RadioBrowserCards.tsx` — category + station cards
- `hooks/usePlaybackRouter.ts` — `playRadioStation` → existing live-stream playback (do not rewrite)

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Supabase (Postgres)                       │
│  radio_stations (20k+ indexed)                                   │
│  radio_categories / radio_station_categories                     │
│  radio_featured (500+ curated)                                   │
│  radio_quality_reviews (approval workflow)                       │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│              Hidden Tunes Radio API (Render / admin)               │
│  GET /api/radio/categories                                       │
│  GET /api/radio/stations?category=&page=&limit=40&mature=        │
│  GET /api/radio/search?q=&page=&limit=40&mature=                 │
│  GET /api/radio/stations/:id/stream  (playback token / URL)      │
│  POST /api/radio/ingest/*  (batch jobs only — not mobile)         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                     Mobile app (Expo)                            │
│  Startup: 0 stations                                             │
│  /stations: categories only (static or API metadata)             │
│  /stations/[id]: 40/page lazy list                               │
│  /stations/search: 40/page backend search                        │
│  Playback: stream URL fetched on tap (or from page payload)      │
│  Mature: OFF by default; consent modal before play               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Supabase Table Shape (proposed)

### `radio_stations`

Primary indexed catalog. Ingestion jobs populate this; mobile never writes.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Stable Hidden Tunes station ID |
| `slug` | `text` unique | URL-safe identifier |
| `name` | `text` not null | Display name |
| `stream_url` | `text` not null | **Backend only** — not in list/search JSON by default |
| `stream_url_hash` | `text` | Dedupe key |
| `logo_url` | `text` nullable | Optional; never preloaded on mobile |
| `country_code` | `char(2)` | ISO |
| `language` | `text` | |
| `tags` | `text[]` | Normalized lowercase tags |
| `genre` | `text` | Primary genre for subtitle |
| `bitrate` | `int` | |
| `codec` | `text` | |
| `source` | `text` | e.g. `radio_browser`, `manual`, `partner` |
| `source_station_uuid` | `text` | Original Radio Browser UUID if applicable |
| `quality_tier` | `text` | `indexed` \| `approved` \| `featured` |
| `quality_score` | `numeric` | 0–100 internal ranking |
| `is_active` | `boolean` default true | Soft delete / broken stream |
| `is_broken` | `boolean` default false | Set by backend health checks |
| `is_mature` | `boolean` default false | 18+ gate |
| `mature_labels` | `text[]` | e.g. `explicit`, `adult-talk` |
| `featured_rank` | `int` nullable | Lower = higher priority; null if not featured |
| `vote_count` | `int` default 0 | Popularity signal |
| `last_checked_at` | `timestamptz` | Stream validation timestamp |
| `created_at` | `timestamptz` | |
| `updated_at` | `timestamptz` | |

**Tier targets**

- `indexed` — all ingested (~20k+)
- `approved` — passes quality rules (~5k+)
- `featured` — editorial + score (`featured_rank` set, ~500+)

### `radio_categories`

Curated browse lanes (replaces hard-coded tag → Radio Browser mapping over time).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `text` PK | e.g. `jazz`, `gospel`, `mature` |
| `title` | `text` | |
| `subtitle` | `text` | |
| `icon` | `text` | Ionicons name |
| `gradient` | `jsonb` | `[from, to]` |
| `sort_order` | `int` | |
| `is_mature` | `boolean` default false | Category-level gate |
| `is_visible` | `boolean` default true | |
| `filter_tags` | `text[]` | Backend query filter |
| `filter_country_code` | `text` nullable | |

### `radio_station_categories`

Many-to-many station ↔ category.

| Column | Type |
|--------|------|
| `station_id` | `uuid` FK → `radio_stations.id` |
| `category_id` | `text` FK → `radio_categories.id` |

### `radio_search_documents` (optional Phase B)

Postgres `tsvector` or Supabase full-text for name/tags search at 20k scale.

---

## API Endpoints (proposed)

Base: `https://admin.hiddentunes.com/api/radio` (consistent with TV catalog pattern).

### Public (mobile)

| Method | Path | Query | Response |
|--------|------|-------|----------|
| `GET` | `/categories` | — | `{ categories: RadioCategoryMeta[] }` — no stations |
| `GET` | `/stations` | `category`, `page` (1-based), `limit` (max 40), `mature` (`0`\|`1`) | `{ stations: RadioStationListItem[], pagination }` |
| `GET` | `/search` | `q`, `page`, `limit` (max 40), `mature` | Same list shape; mature stations excluded unless `mature=1` |
| `GET` | `/stations/:id` | — | Single station metadata for deep link |
| `GET` | `/stations/:id/play` | — | `{ streamUrl, expiresAt? }` — fetched **on tap**, not at list load |

**List item JSON (mobile-safe)**

```json
{
  "id": "uuid",
  "title": "Station Name",
  "country": "US",
  "genre": "Jazz",
  "tags": ["jazz", "smooth"],
  "subtitle": "US · Jazz",
  "isMature": false
}
```

No `stream_url`, `source`, `radio_browser`, or ingest fields in list/search responses.

### Internal (ingest / admin only)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/ingest/radio-browser/sync` | Batch import from Radio Browser |
| `POST` | `/ingest/stations/validate` | Backend stream health sweep |
| `PATCH` | `/admin/stations/:id/quality` | Promote to approved/featured |
| `PATCH` | `/admin/stations/:id/mature` | Set mature flags |

---

## Mature / 18+ Fields

### Backend

- `radio_stations.is_mature = true` when tags/name match mature dictionaries **or** manual review
- `radio_stations.mature_labels` for audit trail
- `radio_categories.is_mature = true` for dedicated mature lane (hidden until consent)
- API default: **`mature=0`** — exclude mature stations from all list/search
- API with **`mature=1`** — include mature stations (still requires mobile consent before play)

### Mobile settings (local)

| Key | Storage | Default |
|-----|---------|---------|
| `hidden_tunes_radio_mature_enabled` | AsyncStorage | `false` |
| `hidden_tunes_radio_mature_consent_at` | AsyncStorage | null |
| `hidden_tunes_radio_mature_consent_version` | AsyncStorage | `1` |

### Consent rules

1. **Mature OFF (default)**  
   - Settings toggle off  
   - API calls use `mature=0`  
   - Mature category card hidden on `/stations`  
   - Mature stations never appear in search results  

2. **Enable mature browsing**  
   - User toggles “Show 18+ stations” in radio settings  
   - Show one-time **18+ consent modal** (copy + Confirm / Cancel)  
   - On Confirm: persist `mature_enabled=true` + consent timestamp  
   - On Cancel: toggle stays off; no API change  

3. **Play mature station**  
   - Even with mature browsing on, **tap to play** shows consent modal if not yet confirmed for current consent version  
   - Confirm → fetch stream via `/stations/:id/play` → existing `playRadioStation`  
   - Cancel → **do not play**; no stream fetch  

4. **Revoke consent**  
   - Turning mature OFF clears consent flags  
   - Purge mature pages from local cache keys prefixed `mature:`  

---

## Mobile Lazy Loading Rules

| Rule | Current | Target |
|------|---------|--------|
| Startup | ✅ No station fetch | Keep — zero stations |
| `/stations` | ✅ Categories only | Keep; optional lightweight `/categories` metadata |
| Category page | 32/page via Radio Browser | **40/page** via Hidden Tunes API |
| Search | 32/page, max 120 | **40/page**, backend pagination + total count |
| Logos | Passed as `artworkUrl`; Image lazy per row | **No preload**; load on visible row only; placeholder if missing |
| Stream URLs | In list cache (`HiddenTunesStation`) | **Fetch on tap** via `/play` endpoint |
| Pull-to-refresh | Force refresh page 0 | Keep |
| Infinite scroll | `onEndReached` → append | Keep; stop when `pagination.hasMore=false` |

### Pagination contract

```typescript
type RadioPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
};
```

- Default `limit = 40`
- Mobile never requests `limit > 40`
- Offset derived as `(page - 1) * limit` on backend

---

## Search Rules

1. **Minimum query length:** 2 characters (keep current debounce ~350ms)
2. **Backend full-text** on `name`, `tags`, `genre`, `country_code`
3. **Quality filter for mobile:** default `quality_tier IN ('approved', 'featured')` for search/browse; ingest tier `indexed` admin-only unless explicitly expanded later
4. **Mature filter:** respect `mature` query param + mobile setting
5. **No client-side scan** of 20k records — every search is an API call
6. **Cache:** only current query page results in memory (reuse `radioCache` pattern with smaller `MAX_STATIONS_PER_KEY = 200` per query)

---

## What Must Stay on Backend

| Responsibility | Why |
|----------------|-----|
| Ingest 20k+ stations from Radio Browser / partners | Device cannot bulk import |
| Stream URL validation & broken flag | Never validate on device |
| Quality scoring & approval workflow | Editorial + automated rules |
| Mature classification | Consistent gating; audit trail |
| Full-text search index | 20k scale |
| Featured ranking | 500+ curated ordering |
| Stream URL issuance (`/play`) | Hide raw provider URLs; rotate if needed |
| Rate limiting & abuse protection | Protect origin streams |
| Dedupe by `stream_url_hash` | Single canonical station per stream |

---

## What Mobile Can Safely Cache

| Data | Cache? | TTL | Max size |
|------|--------|-----|----------|
| Category metadata | Yes | 24h | ~12–20 rows |
| Station list pages (no stream URL) | Yes | 18h | 200 rows/key |
| Search result pages | Yes | 30m | 200 rows/query |
| Stream URL | **No** — fetch on play | — | — |
| Logos | Optional image disk cache per URL | Standard HTImage | No bulk prefetch |
| Mature consent flags | Yes | Until revoked | 3 keys |
| Featured station IDs | Yes | 12h | 500 IDs max |

**Never cache on mobile**

- Full 20k station export
- Bulk stream URLs
- Ingest / admin payloads
- Raw Radio Browser responses

---

## Migration Path (future phases)

### Phase RADIO-20K-B — Backend ingest + API

- Create Supabase tables + indexes (`quality_tier`, `is_mature`, `tsvector`)
- Ingest job: Radio Browser → `radio_stations` (tier `indexed`)
- Promotion job: top votes + health check → `approved`
- Editorial: `featured_rank` for 500+
- Implement `/categories`, `/stations`, `/search`, `/stations/:id/play`

### Phase RADIO-20K-C — Mobile adapter swap

- Add `services/radio/radioCatalogApi.ts` mirroring `tvCatalogApi.ts`
- Replace `radioBrowserApi.ts` calls in `[categoryId].tsx` / `search.tsx` only
- Keep `useLazyRadioStationList`, `radioNormalizer`, `playRadioStation` path
- Add mature settings + consent modal component
- Bump page size to 40

### Phase RADIO-20K-D — Deprecate direct Radio Browser

- Feature flag: `RADIO_USE_BACKEND_INDEX=true`
- Remove device-side Radio Browser fetch in production builds
- Keep Radio Browser ingest on server only

---

## Non-Goals (this phase)

- No Supabase migrations
- No API implementation
- No playback / HiddenAudio changes
- No changes to `app/radio.tsx` listening rooms
- No loading 20k stations on device
- No on-device stream validation
- No logo prefetch pass

---

## Validation Checklist (when implementing later)

- [ ] Cold app start: zero radio network requests
- [ ] `/stations` opens without station list fetch
- [ ] Category page loads exactly 40 stations
- [ ] Search loads 40 at a time; mature off → zero mature hits
- [ ] Mature on + consent → mature results visible
- [ ] Tap mature station without consent → modal; cancel does not play
- [ ] Tap approved station → plays via existing live-stream path
- [ ] Background / lock-screen radio unchanged
