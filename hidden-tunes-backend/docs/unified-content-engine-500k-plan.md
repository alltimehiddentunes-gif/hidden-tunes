# Unified Content Engine — 500k × 4 Plan

**Status:** Planning only (no implementation in this document)  
**Repo scope:** `hidden-tunes-backend/` (+ admin app as current API host)  
**Scale target:** 500k items each for podcasts, radio, TV, audiobooks → **2M+ catalog records** (plus child rows: podcast episodes, TV sources, etc.)

---

## 1. Executive summary

Hidden Tunes should evolve a **backend-first Unified Content Engine (UCE)** that owns ingestion, verification, approval, refresh, deduplication, ranking, and cleanup for all non-music discovery media. The mobile app remains a **thin metadata client**: paginated list/detail APIs, explicit play resolution, no RSS parsing, no health checks, no giant startup payloads.

**Current baseline (2026):**

| Media type | Backend today | Mobile today |
|------------|---------------|--------------|
| Music | Render Express (`hidden-tunes-api`) | Catalog + playback via API |
| TV | Admin Next.js + `tv_videos`, `tv_sources` | `admin.hiddentunes.com/api/tv/*` |
| Podcasts | Admin Next.js + `podcast_shows`, `podcast_episodes` (Phase 2) | `admin.hiddentunes.com/api/podcasts/*` |
| Radio | Not in HT backend | Radio Browser direct |
| Audiobooks | Not started | Not started |

UCE does **not** replace music playback architecture. It **unifies patterns** for podcasts, radio, TV, and audiobooks so each can reach 500k+ rows without mobile or admin regressions.

**Non‑negotiables:**

1. Mobile stays lightweight — no background ingest, no feed parsing, no HEAD probes.
2. Metadata-first discovery — list/detail never return playable URLs (except dedicated play routes).
3. Play URLs only from `/play` (or equivalent) after server-side gate checks.
4. No fake placeholders — empty lists beat synthetic rows.
5. No heavy startup loading — home feeds are small, cacheable slices.
6. No giant API responses — hard caps on page size and JSON bytes.
7. Backend owns operational complexity.

---

## 2. Recommended data model strategy

### Option A — Separate tables per media type (current direction)

**Examples:** `podcast_shows`, `podcast_episodes`, `tv_videos`, `radio_stations`, `audiobook_titles`, `audiobook_chapters`

| Pros | Cons |
|------|------|
| Type-specific columns without JSON soup | Cross-type search needs federation or search index |
| Clear migrations & admin UX per type | Shared logic duplicated unless extracted to libs |
| Optimized indexes per access pattern | 2M rows split across many tables (manageable) |
| Matches existing TV + podcast work | Global “all content” admin view harder |

### Option B — Shared `content_items` + type extensions

**Examples:** `content_items` (shared metadata + lifecycle) + `content_item_podcast`, `content_item_tv`, …

| Pros | Cons |
|------|------|
| One pagination/search/ranking model | Wide table or heavy JOINs at 500k+ |
| Unified admin queue & observability | Migration from existing TV/podcast tables costly |
| Single dedupe/health job framework | Risk of lowest-common-denominator schema |

### **Recommendation: Hybrid (A + shared primitives)**

Keep **physical tables per media type** (and hierarchical children where needed: show→episode, book→chapter). Add **shared engine tables** for cross-cutting concerns:

```
content_sources          -- RSS, M3U, Radio Browser import, API partner, manual
content_ingest_jobs      -- queue rows, status, payload, error, retry_count
content_health_checks    -- last probe result per item/source
content_moderation_events -- audit trail (approve/reject/quarantine)
content_taxonomy_terms   -- normalized categories/genres/tags
content_item_tags        -- polymorphic tag link (item_type + item_id)
content_rank_signals     -- optional scores for featured/trending (per type)
```

**Why hybrid:** Podcast and TV already have proven per-type schemas with different playback shapes (HTTPS audio vs embed/HLS). Shared primitives avoid duplicating job/health/audit logic without forcing one mega-table.

---

## 3. Logical entity map (500k targets)

| Domain | Primary catalog row (500k target) | Child rows | Play resolution unit |
|--------|-------------------------------------|------------|-------------------------|
| Podcasts | `podcast_shows` | `podcast_episodes` (multi‑million over time) | Episode |
| Radio | `radio_stations` | optional `radio_streams` (backup URLs) | Station stream |
| TV | `tv_videos` (+ optional `tv_live_channels`) | — | Video / live stream |
| Audiobooks | `audiobook_works` | `audiobook_chapters` | Chapter |

**Note:** 500k **podcast shows** ≠ 500k episodes. Episode table may exceed 10M; engine must paginate and index episodes by `(show_id, published_at desc)` and never load all episodes for mobile.

---

## 4. Required indexes (500k+ per type)

### General rules

- Every public list query must hit a **composite index** starting with moderation gates: `(status, is_active, playback_or_feed_status, …)`.
- Use **partial indexes** for hot paths: `WHERE status = 'approved' AND is_active = true AND playback_status = 'playable'`.
- **Cursor pagination** keys must be indexed: `(sort_key, id)` e.g. `(published_at DESC, id DESC)`.
- Avoid `OFFSET` for deep pages; reserve offset for admin-only pages ≤ few hundred.
- Add `dedupe_key` / `source_fingerprint` **UNIQUE** constraints where ingest is idempotent.

### Podcasts (extend current)

```sql
-- Shows (public browse)
CREATE INDEX podcast_shows_public_cursor_idx
  ON podcast_shows (created_at DESC, id DESC)
  WHERE status = 'approved' AND is_active = true AND feed_status = 'active';

CREATE UNIQUE INDEX podcast_shows_feed_url_unique_idx
  ON podcast_shows (feed_url) WHERE feed_url IS NOT NULL;

-- Episodes (public list by show)
CREATE INDEX podcast_episodes_show_public_cursor_idx
  ON podcast_episodes (show_id, published_at DESC NULLS LAST, id DESC)
  WHERE status = 'approved' AND is_active = true AND playback_status = 'playable';

CREATE UNIQUE INDEX podcast_episodes_show_audio_dedupe_idx
  ON podcast_episodes (show_id, audio_url_normalized)
  WHERE audio_url IS NOT NULL;
```

### Radio (new)

```sql
CREATE UNIQUE INDEX radio_stations_source_dedupe_idx
  ON radio_stations (source_type, source_station_uuid); -- e.g. Radio Browser uuid

CREATE INDEX radio_stations_public_cursor_idx
  ON radio_stations (country, name, id)
  WHERE status = 'approved' AND is_active = true AND stream_status = 'playable';

CREATE INDEX radio_stations_tags_gin_idx ON radio_stations USING gin (tags);
```

### TV (extend current)

```sql
CREATE INDEX tv_videos_public_cursor_idx
  ON tv_videos (published_at DESC NULLS LAST, id DESC)
  WHERE status = 'approved' AND is_active = true AND playback_status = 'playable';

-- Already have (source_type, source_id) unique — keep as dedupe key
```

### Audiobooks (new)

```sql
CREATE UNIQUE INDEX audiobook_works_source_dedupe_idx
  ON audiobook_works (source_type, source_id);

CREATE INDEX audiobook_chapters_work_cursor_idx
  ON audiobook_chapters (work_id, chapter_number, id)
  WHERE status = 'approved' AND is_active = true AND playback_status = 'playable';
```

### Shared job/health

```sql
CREATE INDEX content_ingest_jobs_status_priority_idx
  ON content_ingest_jobs (status, priority DESC, scheduled_at ASC);

CREATE INDEX content_health_checks_next_check_idx
  ON content_health_checks (next_check_at ASC)
  WHERE quarantined = false;
```

---

## 5. Pagination strategy

### Public API (mobile)

| Parameter | Rule |
|-----------|------|
| `limit` | Default 20, max 30 (match current podcast caps) |
| `cursor` | Opaque base64 or signed token encoding `(sort_value, id)` |
| Sort | Stable tie-breaker always includes `id` |
| Direction | `next` only for mobile; `prev` optional later |

**Cursor format (example):**

```json
{ "t": "2026-06-27T12:00:00.000Z", "id": "uuid", "v": 1, "scope": "podcast_shows" }
```

Server validates scope + signature (HMAC) to prevent cursor tampering across types.

### Admin API

- Allow `page` + `limit` for first ~100 pages (admin UI).
- Switch admin tables to cursor when lists exceed 10k rows.
- Export/bulk uses background jobs, not paginated HTTP.

### Why not offset-only

At 500k rows, `OFFSET 200000` forces Postgres to scan and discard 200k rows per request — unacceptable latency and cost. **Cursor/keyset pagination is mandatory** for public discovery at scale.

---

## 6. Search strategy

### Phase 1 — Postgres (0–~100k visible items per type)

- `ILIKE` + `pg_trgm` GIN indexes on `title`, `host_name`/`author`, `description` (truncated).
- Prefix search on `slug`.
- Category filters via indexed `primary_category` + `tags @>` / GIN.
- Hard limit: 30 results per query, 300ms statement timeout.

### Phase 2 — Dedicated search (see §22)

- Federated index: `media_type`, `title`, `facets`, `popularity`, `last_verified_at`.
- Mobile calls `/api/search?q=&types=podcast,radio,tv,audiobook&cursor=`.
- Postgres remains source of truth; search index is **derived**.

### Search response shape

Metadata only. No playable URLs. Highlight fields optional. Max 5KB per result card × 30 = ~150KB worst case (still high — target **≤ 50KB** per search response via field truncation).

---

## 7. Category / genre / tag strategy

### Taxonomy layers

1. **Canonical terms** — `content_taxonomy_terms` (slug, label, media_types[], parent_id).
2. **Primary facet** — single indexed column per item (`primary_category`) for fast browse.
3. **Secondary tags** — `text[]` with GIN index, max 12 tags ingested, max 8 exposed publicly.
4. **Source mapping** — ingest maps RSS iTunes categories / Radio Browser tags / YouTube labels → canonical slugs via rules table (`content_taxonomy_mappings`).

### Mobile browse

- Category rails request **curated slices**: `/api/podcasts/shows?category=technology&limit=20&cursor=`.
- No “download all categories at startup” — categories endpoint is small (~10–50 rows).

### Controlled vocabulary

Avoid unbounded tag explosion. Unknown source labels → `pending_mapping` queue for admin or auto-map when confidence ≥ threshold.

---

## 8. Health-check worker architecture

```
┌─────────────┐     enqueue      ┌──────────────────┐
│ Refresh     │ ───────────────► │ content_ingest_  │
│ scheduler   │                  │ jobs (health)    │
└─────────────┘                  └────────┬─────────┘
                                          │
                                          ▼
                                 ┌──────────────────┐
                                 │ Health worker    │
                                 │ pool (Render/    │
                                 │ VPS workers)     │
                                 └────────┬─────────┘
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                               ▼                               ▼
   HEAD/GET probe                   RSS re-parse                    Embed verify
   stream URL                       (metadata drift)               (TV oEmbed/rules)
          │                               │                               │
          └───────────────────────────────┴───────────────────────────────┘
                                          ▼
                              Update playback_status / feed_status
                              Quarantine after N failures
                              Emit moderation_events + metrics
```

### Probe rules by type

| Type | Health signal | Failure handling |
|------|---------------|------------------|
| Podcast show | RSS fetch + parse | `feed_status` → offline/inactive |
| Podcast episode | HTTPS HEAD/Range on `audio_url` | `playback_status` → failed; hide from public |
| Radio | Stream connect (ffmpeg/ffprobe or icy probe) | mark station offline |
| TV | oEmbed/thumbnail/HLS manifest check | playback_status blocked/failed |
| Audiobook chapter | HTTPS audio probe | same as podcast episode |

**Mobile never runs these probes.**

### Quarantine policy

- 3 consecutive failures → `playback_status = offline`, `is_active = false` (public hidden).
- 7 days offline → admin review queue or auto-archive.
- Recovery on successful probe → revert to `unchecked` or auto-`playable` if auto-approve enabled.

---

## 9. Ingest worker queues

### Job types

| `job_type` | Trigger | Worker |
|------------|---------|--------|
| `rss_ingest` | Admin POST or scheduled | Podcast worker |
| `radio_import` | Scheduled / partner sync | Radio worker |
| `tv_import` | Source scan | TV worker (extend existing import runner) |
| `audiobook_ingest` | Partner RSS/API | Audiobook worker |
| `health_probe` | Scheduler | Health worker |
| `search_reindex` | Post-approve webhook | Search indexer |
| `dedupe_sweep` | Nightly | Maintenance worker |

### Queue storage evolution

| Stage | Implementation |
|-------|----------------|
| Now | Postgres `content_ingest_jobs` + `FOR UPDATE SKIP LOCKED` |
| Growth | Redis/BullMQ for concurrency + delayed retries |
| Scale | Dedicated worker service(s) on Render/Docker |

### Job payload contract

```json
{
  "job_type": "rss_ingest",
  "source_id": "uuid",
  "payload": { "feed_url": "https://..." },
  "idempotency_key": "rss:sha256(feed_url)",
  "priority": 100,
  "max_attempts": 5
}
```

Workers must be **idempotent** — safe to retry without duplicate public rows.

---

## 10. Deduplication keys

| Media | Primary dedupe key | Secondary |
|-------|-------------------|-----------|
| Podcast show | Normalized `feed_url` | `slug` (unique) |
| Podcast episode | `(show_id, normalized_audio_url)` | `(show_id, guid)` if RSS guid stored |
| Radio station | `(source_type, source_station_uuid)` | `(normalized_stream_url)` |
| TV video | `(source_type, source_id)` — **already exists** | source_url hash |
| Audiobook work | `(source_type, source_id)` | ISBN if present |
| Audiobook chapter | `(work_id, source_chapter_id)` | `(work_id, chapter_number)` |

Normalize URLs: lowercase host, strip tracking query params, enforce https preference flags.

On dedupe conflict: **update metadata**, preserve moderation state unless source supersedes with higher trust tier.

---

## 11. Automatic approval gates

Auto-approve only when **all** gates pass:

### Show / station / work level

- [ ] Ingest source trust tier ≥ `verified_partner` OR manual admin enable on source
- [ ] Required metadata present (title, artwork, language, category)
- [ ] Feed/stream probe success
- [ ] Not on blocklist (domain, country, keyword)
- [ ] Dedupe check passed (not duplicate of rejected/blocked item)

### Episode / chapter / video level

- [ ] Parent entity approved + active
- [ ] Playable URL is HTTPS (or allowed HLS for TV/radio)
- [ ] Duration/metadata parse success
- [ ] Content rating rules satisfied (mature flag handling)

### Default for unknown feeds

**Pending** — matches current podcast Phase 2C behavior. No auto-publish.

### Trust tiers

| Tier | Behavior |
|------|----------|
| `manual` | Always pending |
| `community` | Pending + admin queue |
| `verified_partner` | Auto-approve if probes pass |
| `first_party` | Auto-approve + priority refresh |

---

## 12. Automatic removal / quarantine

| Condition | Action |
|-----------|--------|
| Probe failures ≥ 3 | Hide from public (`is_active=false` or status offline) |
| Copyright/block flag | `status=blocked`, audit event |
| Duplicate detected post-approval | Merge or deactivate loser |
| Source feed 404/410 | `feed_status=inactive`, stop refresh |
| Stale > 180 days (radio/TV live) | Deprioritize ranking, optional archive |
| Admin reject | Permanent until manual restore |

**Never delete rows immediately** — soft-delete / quarantine for rollback (§18).

---

## 13. Background refresh schedule

| Type | Default cadence | Notes |
|------|-----------------|-------|
| Podcast RSS | 6–24h by popularity tier | Hot shows hourly |
| Radio streams | 12–24h | Shorter for featured |
| TV VOD | Weekly | Metadata drift low |
| TV live/HLS | 1–4h | Manifest stability |
| Audiobook | Daily | Partner-dependent |

Scheduler writes `content_ingest_jobs` with `scheduled_at` staggered to avoid thundering herd. Priority queue: featured > recently played (future) > long tail.

---

## 14. Play endpoint design

### Pattern (consistent across types)

```
GET /api/{type}/{id}/play
GET /api/podcasts/episodes/{id}/play   ← exists today
GET /api/radio/stations/{id}/play      ← future
GET /api/tv/videos/{id}/play           ← future (returns embed/HLS, not raw scrape)
GET /api/audiobooks/chapters/{id}/play ← future
```

### Server steps

1. Authenticate (optional now; rate-limit by IP/device regardless).
2. Load item + parent with **public gate** columns only.
3. Verify: approved, active, playable status, parent gates.
4. Re-check `last_verified_at` freshness (optional soft re-probe async if stale > 24h).
5. Return **minimal play payload**:

```json
{
  "success": true,
  "playback": {
    "url": "https://...",
    "type": "audio/mpeg | application/x-mpegURL | embed",
    "expires_at": "optional signed URL expiry"
  }
}
```

6. Log play resolution (observability) without logging full URL in public logs if signed.

**List/detail routes never include `audio_url`, `stream_url`, `embed_url`, or raw RSS URLs.**

---

## 15. CDN / cache strategy

| Layer | What | TTL |
|-------|------|-----|
| nginx (VPS) | Public GET list/detail | 60–300s stale-while-revalidate |
| CDN (Cloudflare) | Artwork/thumbnails | Long TTL, image domain |
| CDN | API JSON | Short TTL only for **public** read-only routes; **no cache on /play** |
| Application | In-memory LRU | Featured rails, categories (60s) |
| Postgres | Materialized views | Optional featured snapshots refreshed hourly |

Cache keys include: route + cursor + filter hash + `catalog_version` bump on bulk moderation.

**Invalidate** via `catalog_version` increment on admin approve/reject (cheap mobile cache bust without purging CDN globally).

---

## 16. API response size limits

| Guard | Limit |
|-------|-------|
| `limit` max | 30 items public |
| Field truncation | `description` ≤ 1200 chars public |
| Arrays | tags ≤ 8, categories ≤ 6 |
| JSON body max | 256KB hard reject server-side |
| Target typical list | ≤ 25KB |
| Search | ≤ 50KB |
| Admin list | 512KB max (still paginated) |

Omit null fields in public JSON. Use explicit select constants (pattern from `PODCAST_PUBLIC_*_SELECT`).

---

## 17. Admin override tools

Extend current admin patterns (`requireUploadPermission`, moderation pages):

| Tool | Purpose |
|------|---------|
| Ingest console | RSS/M3U/partner import (podcast ingest page exists) |
| Moderation queue | Approve/reject/bulk (podcast moderation page exists) |
| Source manager | Trust tier, scan frequency (TV sources pattern) |
| Health dashboard | Last probe, failure streak, quarantine |
| Dedupe merge UI | Pick canonical row |
| Taxonomy mapper | Map raw labels → canonical |
| Reindex trigger | Search rebuild |
| Rollback | Restore soft-deleted/quarantined |
| Job inspector | Retry/cancel ingest jobs |

All admin mutations write `content_moderation_events`.

---

## 18. Rollback strategy

- **Soft lifecycle** — prefer status flips over DELETE.
- **Moderation audit** — every approve/reject stores previous state JSON.
- **Job replay** — ingest jobs retain payload for re-run.
- **Search index** — rebuild from Postgres snapshot; index is disposable.
- **Migration rollback** — backward-compatible columns; avoid destructive DDL in place.
- **Feature flags** — `catalog_version` + env toggles to disable new type without mobile deploy.

---

## 19. Rate limiting

| Surface | Limit |
|---------|-------|
| Public list/search | 60 req/min/IP |
| Play endpoints | 30 req/min/IP + 10 req/min/item |
| Admin ingest | 10 req/min/user |
| Admin bulk | 5 req/min/user |

Implement at nginx → optional Redis sliding window. Return `429` + `Retry-After`. Play endpoint limits reduce stream URL scraping abuse.

---

## 20. Supabase / Postgres scaling risks

| Risk | Mitigation |
|------|------------|
| Connection exhaustion (Next.js serverless) | PgBouncer/session pooler; move workers to dedicated pool |
| Large table seq scans | Keyset indexes, partial indexes, EXPLAIN monitoring |
| Episode table >> 500k | Partition by `published_at` year or `show_id` hash |
| Autovacuum bloat on hot updates | Tune autovacuum; batch health updates |
| PostgREST schema cache | Migration notify (already documented for podcasts) |
| Single-region latency | Read replicas for public list (future) |
| Storage of probe logs | Separate `content_health_checks` append-only, prune 90d |
| 2M+ row backups | Point-in-time recovery; test restore quarterly |

**Supabase tier planning:** Pro → Team as ingest workers increase write IOPS; consider **moving workers + search off Supabase compute** while keeping Postgres as SoT.

---

## 21. When to introduce Redis / queues

| Signal | Action |
|--------|--------|
| Ingest job backlog > 15 min routinely | Redis + BullMQ (or Supabase Queues) |
| Multiple worker processes competing on Postgres locks | External queue with concurrency controls |
| Rate limiting needs cross-instance consistency | Redis counters |
| Featured rail hot-cache | Redis TTL cache |
| Session/admin token blocklist | Redis (optional) |

**Before Redis:** Postgres `content_ingest_jobs` with `SKIP LOCKED` is sufficient for Phase 2–3 volumes.

---

## 22. When to introduce OpenSearch / Meilisearch

| Signal | Action |
|--------|--------|
| Trgm search p95 > 300ms at 100k+ rows/type | Pilot Meilisearch (simpler ops) |
| Cross-type search required in product | Federated index |
| Faceted browse (genre × country × language) | Search engine facets |
| Typo-tolerance / ranking beyond SQL | Meilisearch/OpenSearch |
| 500k × 4 unified search | Dedicated search cluster; Postgres not primary search |

**Recommendation:** Meilisearch first for speed of integration; OpenSearch if complex analytics ranking needed later.

Index fields: `id`, `media_type`, `title`, `subtitle`, `facets[]`, `popularity`, `approved_at`, `cursor_sort`.

Mobile still calls HT API — **never talks to search engine directly**.

---

## 23. When to split workers from admin app

| Signal | Action |
|--------|--------|
| RSS ingest blocks Next.js event loop | Extract `hidden-tunes-content-worker` Docker service |
| Health probes exceed 5 min route timeouts | Separate worker (podcast ingest already uses `maxDuration=300` — fragile at scale) |
| CPU-heavy ffmpeg/transcode mixed with admin | Already splitting audio worker on Render — mirror for content |
| Deploy cadence differs (admin daily, workers hourly) | Split repos/services |
| 2M catalog refresh load | Dedicated worker fleet + scheduler |

**Target architecture (mature):**

```
admin.hiddentunes.com (Next.js) ── API read + admin UI + enqueue jobs
hidden-tunes-content-worker (Render/VPS) ── ingest + health + dedupe
hidden-tunes-search-indexer ── optional
Supabase Postgres ── source of truth
```

Admin **never** runs bulk probes synchronously in request handlers at 500k scale.

---

## 24. Phase-by-phase roadmap

### Phase 0 — Foundation (current → Q3 2026)

- [x] TV catalog + moderation patterns
- [x] Podcast schema + public metadata APIs + play endpoint
- [x] Podcast RSS ingest + admin moderation UI (Phase 2C)
- [ ] Document UCE primitives (this plan)
- [ ] Add shared `content_ingest_jobs` + `content_moderation_events` tables
- [ ] Standardize cursor pagination on podcast public routes (keep offset temporarily with deprecation)

### Phase 1 — Engine primitives (Q3–Q4 2026)

- Shared job queue in Postgres
- Health worker v1 (podcast RSS + episode HTTPS probes)
- Dedupe sweeps + quarantine automation
- Admin health dashboard
- nginx cache headers on public catalog routes
- Rate limiting at edge

### Phase 2 — Radio backend (Q4 2026 – Q1 2027)

- `radio_stations` schema + indexes
- Radio Browser ingest worker (backend replaces mobile direct calls gradually behind feature flag)
- Public metadata API + play endpoint
- Mobile switches to HT API **only after** backend parity verified — out of scope until then

### Phase 3 — TV at scale (Q1 2027)

- Cursor pagination for `/api/tv/videos`
- Async import runner moved to worker service
- HLS/live health probes
- TV play endpoint (metadata/list remains embed-free)

### Phase 4 — Audiobooks (Q2 2027)

- `audiobook_works` + `audiobook_chapters`
- Partner/licensed ingest only — **no fake catalog**
- Chapter play endpoint (HTTPS audio)

### Phase 5 — Search & federation (Q3 2027)

- Meilisearch cluster
- Unified `/api/search` metadata-only
- Cross-type featured rails from `content_rank_signals`

### Phase 6 — 500k hardening (Q4 2027)

- Partition large child tables (episodes, chapters)
- Read replica for public lists
- Redis queue + worker fleet autoscaling
- Load test: 500k/type synthetic **approved** subset, p95 list < 200ms
- DR drill + rollback exercises

---

## 25. Mobile contract (unchanged principles)

Mobile **may**:

- Fetch paginated metadata lists with cursor
- Show artwork from CDN URLs
- Call play endpoint on user tap
- Cache small recent slices locally

Mobile **must not**:

- Parse RSS/Atom/M3U
- Probe stream health
- Hold playable URLs in list cache from non-play APIs
- Bulk-sync entire catalog at startup
- Embed admin credentials

---

## 26. Success metrics

| Metric | Target at 500k/type |
|--------|---------------------|
| Public list p95 latency | < 200ms |
| Play resolve p95 | < 150ms |
| Ingest backlog age p95 | < 30 min |
| Broken playable rate (approved) | < 1% |
| Duplicate public rows | < 0.1% |
| Mobile cold-start catalog fetch | < 100KB |
| Admin bulk approve 20 episodes | < 10s async job |

---

## 27. Open decisions (to resolve before Phase 1 implementation)

1. **Radio licensing** — Radio Browser ToS vs self-hosted mirror vs partner API.
2. **Audiobook source** — licensed partner only vs public domain archives.
3. **TV play** — embed-only vs direct HLS where rights allow.
4. **Search vendor** — Meilisearch hosted vs self-run.
5. **Worker host** — extend Render vs dedicated VPS vs Supabase Edge Functions (likely too limited for probes).
6. **Unified vs separate public API paths** — keep `/api/podcasts/*`, `/api/tv/*` etc. (recommended) vs `/api/content/:type/*`.

---

## 28. References in repo

| Area | Path |
|------|------|
| Podcast schema | `hidden-tunes-admin/supabase/migrations/20260627120000_podcast_catalog.sql` |
| Podcast public selects | `hidden-tunes-admin/lib/podcastCatalog.ts` |
| Podcast ingest | `hidden-tunes-admin/lib/podcastRssIngest.ts` |
| TV schema | `hidden-tunes-admin/supabase/migrations/20260521150000_tv_catalog.sql` |
| TV import runner | `hidden-tunes-admin/lib/tvImportRunner.ts` |
| Admin auth | `hidden-tunes-admin/lib/requireUploadPermission.ts` |
| VPS env template | `hidden-tunes-admin/.env.production.example` |

---

*Document version: 1.0 — planning only, no code changes.*
