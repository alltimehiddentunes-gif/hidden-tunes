# Radio 100K+ Architecture

> **Target updated:** **100,000+** indexed radio stations and **100,000+** podcasts (mobile loads **40/page** only).
> Phase **RADIO-SCALE-A** — audit and design. Backend indexing required for full scale.

## North-star goal

Build one of the **largest searchable radio catalogs in any music app** while keeping **startup, scrolling, heat, memory, and playback performance unchanged**.

Hidden Tunes achieves scale on the **backend index**; the mobile app never holds or searches the full catalog.

---

## Goals

| Layer | Target |
|-------|--------|
| **Indexed catalog** | **100,000+** radio stations (metadata only in database) |
| **Podcast catalog** | **100,000+** shows · **10M+** episodes long-term |
| **Quality-approved** | **10,000+** stations surfaced in default browse/search |
| **Featured** | **1,000+** editorially promoted stations |
| **Mature / 18+** | Gated behind explicit user consent — unchanged |
| **Mobile** | Zero stations at startup; **40/page** lazy loads only (never the full catalog) |

---

## Backend requirements

### Catalog scale

- Support **100,000+ indexed stations** in Postgres (Supabase)
- Store **metadata only** in the database — names, tags, country, logos, quality fields, stream URL as backend-only column
- **Do not preload streams** — no bulk stream fetch, probe, or cache warming at ingest time
- **Periodically validate streams** via scheduled backend jobs (HEAD/range probe or lightweight playback check)
- **Deduplicate aggressively** — canonical row per `stream_url_hash`; merge duplicates from multiple providers
- **Assign `quality_score`** (0–100) from health, bitrate, popularity, editorial signals
- **Track failures** — `failure_count`, consecutive failure streak, last error reason
- **Track last successful checks** — `last_checked_at`, `last_successful_check_at`

### Stream validation policy

| Rule | Behavior |
|------|----------|
| Ingest | Accept metadata + stream URL; mark `validation_status = pending` |
| First validation | Async job within 24h of ingest |
| Re-validation | Rolling sweep — high-traffic stations weekly; long tail monthly |
| Failure threshold | N consecutive failures → `is_broken = true`, hidden from mobile |
| Recovery | Successful check resets failure streak; station re-enters browse pool if quality rules pass |

### Dedupe strategy

1. **Primary key:** normalized `stream_url_hash` (HTTPS canonical URL)
2. **Secondary:** fuzzy name + country + bitrate within provider merge window
3. **Cross-provider:** same stream from Radio Browser + broadcaster directory → one canonical `radio_stations.id`
4. **Winner selection:** highest `quality_score`, most recent successful check, richest metadata
5. **Losers:** soft-linked to canonical row or marked `is_duplicate = true`, never shown on mobile

### Quality scoring (backend-only math)

Signals combined into `quality_score`:

- Last successful stream check (heavy weight)
- Bitrate / codec suitability
- Vote / click / listen popularity (when available)
- Logo/metadata completeness
- Provider trust tier
- Failure history (penalty)
- Duplicate penalty (non-canonical rows score 0 for mobile)

Mobile may receive `qualityTier` badge hints; scoring formula stays on backend.

### Tier targets

| Tier | Count | Mobile visibility |
|------|-------|-------------------|
| `indexed` | 40,000+ | Ingest/admin only — includes unvalidated or low-score rows |
| `approved` | **10,000+** | Default browse + search — backend filters dead/unavailable stations |
| `featured` | **1,000+** | Curated lanes (`featured_rank` set) |

---

## Search requirements

All search runs against the **backend index** — never on device.

| Rule | Detail |
|------|--------|
| Query target | Postgres FTS / `tsvector` on name, tags, genre, country, language |
| Sort | **Relevance** (text rank) **+ `quality_score`** (boost playable, high-quality stations) |
| Visibility | **`is_active = true`**, **`is_broken = false`**, **`is_duplicate = false`** — backend filters dead/unavailable stations |
| Playable quality | Search and browse show **only quality-approved, playable stations** (`approved` / `featured` tiers) |
| Hide dead | Stations with failed validation or expired grace period |
| Hide spam/test | `is_spam = true` or name/tag blocklist match — ingest quarantine |
| Hide duplicates | Only canonical row per `stream_url_hash` in results |
| Pagination | **40 stations per page**; mobile infinite scroll requests next page |
| Mature | Excluded unless `includeMature=true` + user consent |

**No client-side scan of 40k records** — every search is an API call.

---

## Country coverage

| Backend | Mobile |
|---------|--------|
| Index **every country** available from Radio Browser and future providers | Show **only countries with ≥1 playable station** |
| Maintain `radio_countries` table synced from ingest | Country browse/filter uses `/api/radio/countries` |
| Store `station_count_playable` per country (denormalized, refreshed by jobs) | Empty countries never appear in UI |

Country lanes and filters derive from backend counts — not hard-coded ISO lists on device.

---

## Future provider support

Ingest pipeline designed for multiple sources with unified canonical schema:

| Provider type | Examples | Notes |
|---------------|----------|-------|
| **Radio Browser** | Primary bulk ingest | UUID → `source_station_uuid` |
| **Additional radio directories** | Partner XML/JSON feeds | Map to same `radio_stations` shape |
| **Public broadcaster directories** | NPR, BBC, national PSB APIs | Higher trust tier in `quality_score` |
| **Country-specific aggregators** | Regional open-data radio lists | Country code + language normalization |

Each provider row includes:

- `source` — e.g. `radio_browser`, `broadcasters_uk`, `partner_xyz`
- `source_station_uuid` — provider-native ID
- `source_imported_at` — last sync timestamp

Mobile never talks to third-party radio APIs directly in production.

---

## Current state (audit snapshot)

### `services/radio/`

| File | Role today | Scale gap |
|------|------------|-----------|
| `radioBrowserApi.ts` | Direct Radio Browser API from device | No backend index; no quality tiers; search capped at 120 |
| `radioCache.ts` | Memory + AsyncStorage; 18h TTL; up to 2,000/key | Stores `streamUrl`; no mature/quality metadata |
| `radioNormalizer.ts` | Radio Browser → `HiddenTunesStation` | No mature, quality, or backend ID fields |
| `hooks/useLazyRadioStationList.ts` | Cache-first infinite scroll | ✅ Reusable — swap `loadPage` to backend API |

### Mobile screens

| Screen | Today | Target |
|--------|-------|--------|
| `app/stations/index.tsx` | Categories only, no fetch | ✅ Keep |
| `app/stations/[categoryId].tsx` | Lazy browse via Radio Browser | 40/page via Hidden Tunes API |
| `app/stations/search.tsx` | Device-side Radio Browser search | Backend search, 40/page |

---

## Target architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Supabase (Postgres)                            │
│  radio_stations (40k+ indexed, metadata + backend-only stream_url)   │
│  radio_countries (playable counts per ISO code)                      │
│  radio_categories · radio_station_categories                         │
│  radio_provider_sync (ingest cursors per source)                     │
│  radio_validation_jobs · radio_quality_reviews                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│              Hidden Tunes Radio API (admin.hiddentunes.com)            │
│  GET /api/radio/categories                                           │
│  GET /api/radio/countries                                            │
│  GET /api/radio/stations?category=&page=&limit=40                    │
│  GET /api/radio/search?q=&page=&limit=40                             │
│  GET /api/radio/stations/:id/play   (stream URL on tap only)         │
│  POST /api/radio/ingest/*           (batch jobs — not mobile)        │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│                     Mobile app (Expo)                                  │
│  Startup: 0 stations                                                 │
│  /stations: categories (+ countries metadata only)                   │
│  Browse/search: 40/page · infinite scroll · cache recent pages only  │
│  Never load 40k locally · never search 40k on device               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Supabase table shape (proposed)

### `radio_stations`

Primary indexed catalog. **Metadata in DB; streams validated asynchronously.**

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | Stable Hidden Tunes station ID |
| `slug` | `text` unique | URL-safe identifier |
| `name` | `text` not null | Display name |
| `stream_url` | `text` not null | **Backend only** — never in list/search JSON |
| `stream_url_hash` | `text` unique | Dedupe key |
| `logo_url` | `text` nullable | Never bulk-preloaded on mobile |
| `country_code` | `char(2)` | ISO |
| `language` | `text` | |
| `tags` | `text[]` | Normalized lowercase |
| `genre` | `text` | Primary genre |
| `bitrate` | `int` | |
| `codec` | `text` | |
| `source` | `text` | `radio_browser`, `broadcaster`, `partner`, … |
| `source_station_uuid` | `text` | Provider-native ID |
| `source_imported_at` | `timestamptz` | |
| `quality_tier` | `text` | `indexed` \| `approved` \| `featured` |
| `quality_score` | `numeric` | 0–100 ranking |
| `validation_status` | `text` | `pending` \| `valid` \| `broken` \| `unknown` |
| `is_active` | `boolean` default true | Soft delete |
| `is_broken` | `boolean` default false | Failed validation threshold |
| `is_duplicate` | `boolean` default false | Non-canonical duplicate row |
| `canonical_station_id` | `uuid` nullable | Points to winner when duplicate |
| `is_spam` | `boolean` default false | Quarantined spam/test |
| `failure_count` | `int` default 0 | Consecutive or rolling failures |
| `last_failure_reason` | `text` nullable | Last probe error |
| `last_checked_at` | `timestamptz` | Last validation attempt |
| `last_successful_check_at` | `timestamptz` nullable | Last known good stream |
| `is_mature` | `boolean` default false | 18+ gate |
| `mature_labels` | `text[]` | Audit trail |
| `featured_rank` | `int` nullable | Lower = higher priority |
| `vote_count` | `int` default 0 | Popularity signal |
| `created_at` / `updated_at` | `timestamptz` | |

### `radio_countries`

| Column | Type | Notes |
|--------|------|-------|
| `country_code` | `char(2)` PK | ISO |
| `name` | `text` | Display name |
| `station_count_indexed` | `int` | Total indexed |
| `station_count_playable` | `int` | Active + not broken — **mobile filter** |
| `last_synced_at` | `timestamptz` | |

Only countries with `station_count_playable > 0` appear in mobile country browse.

### Supporting tables

- **`radio_categories`** / **`radio_station_categories`** — curated browse lanes
- **`radio_provider_sync`** — per-source ingest cursor, last run, row counts
- **`radio_search_documents`** — `tsvector` for 40k-scale FTS
- **`radio_validation_jobs`** — job queue / audit log for stream checks

---

## API endpoints (proposed)

Base: `https://admin.hiddentunes.com/api/radio`

### Public (mobile)

| Method | Path | Query | Response |
|--------|------|-------|----------|
| `GET` | `/categories` | — | Category metadata only — no stations |
| `GET` | `/countries` | `includeMature` | Countries with playable stations + counts |
| `GET` | `/stations` | `category`, `country`, `page`, `limit` (max 40), `includeMature` | 40/page; active, non-duplicate, non-broken |
| `GET` | `/search` | `q`, `page`, `limit` (max 40), `includeMature` | Sorted by relevance + `quality_score` |
| `GET` | `/stations/:id` | — | Single station metadata |
| `GET` | `/stations/:id/play` | — | Stream URL on tap only |

**List item JSON (mobile-safe)** — no `stream_url`, provider IDs, or validation internals.

### Internal (ingest / admin only)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/ingest/radio-browser/sync` | Bulk import from Radio Browser |
| `POST` | `/ingest/provider/:source/sync` | Additional directory ingest |
| `POST` | `/ingest/stations/validate` | Stream health sweep |
| `POST` | `/ingest/stations/dedupe` | Cross-provider merge pass |
| `PATCH` | `/admin/stations/:id/quality` | Promote/demote tiers |
| `PATCH` | `/admin/stations/:id/mature` | Mature flags |

---

## Mobile rules (unchanged performance contract)

| Rule | Requirement |
|------|-------------|
| Startup | **Zero** station fetch |
| `/stations` | Categories (+ countries metadata) only |
| Category page | **40 stations per page** |
| Search | **40 stations per page** from backend |
| Infinite scroll | Load next 40 when user reaches list end |
| Local catalog | **Never** load 40,000 stations |
| Local search | **Never** search 40,000 on device |
| Cache | Recent browse/search **pages only** (~200 rows/key max) |
| Stream URLs | Fetch on tap via `/play` — not in list payloads |
| Logos | Lazy per visible row — no offscreen preload |
| Playback | Existing `playRadioStation` path — no rewrite |

### Pagination contract

```typescript
type RadioPagination = {
  page: number;       // 1-based
  limit: number;      // max 40
  total: number;
  totalPages: number;
  hasMore: boolean;
};
```

---

## Mature / 18+ (unchanged)

- Default: mature excluded from all list/search/country endpoints
- Mobile: `includeMature=true` only when user setting + consent enabled
- Tap mature station → 18+ consent modal before play
- See [media-scale-architecture.md](./media-scale-architecture.md) for unified mature rules across radio + podcast

---

## What must stay on backend

| Responsibility | Why at 40k scale |
|----------------|------------------|
| Ingest 40k+ from Radio Browser + future providers | Device cannot bulk import |
| Metadata-only storage + async stream validation | No preload storms |
| Aggressive dedupe across providers | Single canonical catalog |
| `quality_score` + failure tracking | Rank playable stations |
| Full-text search + relevance sort | 40k cannot be searched on device |
| Hide dead / spam / duplicate rows | Clean mobile experience |
| Country playable counts | Show only countries with stations |
| Stream URL issuance on play | Security + rotation |
| Rate limiting | Protect origin streams |

---

## What mobile can safely cache

| Data | Cache? | TTL | Max |
|------|--------|-----|-----|
| Category + country metadata | Yes | 24h | ~50 rows |
| Browse/search pages (no stream URL) | Yes | 18h | 200 rows/key |
| Stream URL | On play only | Session | 1 |
| Mature consent flags | Yes | Until revoked | 3 keys |

**Never on mobile:** full 40k export, bulk stream URLs, ingest payloads, raw provider responses, on-device stream validation.

---

## Migration path (future phases)

### Phase RADIO-SCALE-B — Backend ingest + API

- Supabase migrations for 40k-scale indexes (`stream_url_hash`, `quality_score`, `tsvector`, country counts)
- Multi-provider ingest: Radio Browser first, then broadcaster/partner adapters
- Validation + dedupe jobs; failure tracking
- Public API: categories, countries, stations, search, play

### Phase RADIO-SCALE-C — Mobile adapter swap

- `services/radio/radioCatalogApi.ts` replaces direct Radio Browser calls
- Keep `useLazyRadioStationList`, `playRadioStation` — no playback rewrite
- 40/page everywhere; mature consent UI

### Phase RADIO-SCALE-D — Deprecate device-side Radio Browser

- `RADIO_USE_BACKEND_INDEX=true` in production
- Radio Browser used for **server ingest only**

---

## Non-goals

- No loading 40k stations on device
- No on-device stream validation or search
- No playback / HiddenAudio / queue changes
- No logo preload passes
- No UI redesign

---

## Validation checklist

- [ ] Cold start: zero radio network requests
- [ ] `/stations` opens with categories only
- [ ] Category/search: exactly 40 stations per page; infinite scroll loads next 40
- [ ] Search sorted by relevance + quality; no dead/spam/duplicate rows
- [ ] Country list shows only countries with playable stations
- [ ] Stream URL fetched on tap only
- [ ] Startup, scroll, heat, memory, playback unchanged vs today
- [ ] Background / lock-screen radio unchanged
