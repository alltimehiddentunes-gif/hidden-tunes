# Podcast Premium Discovery Audit — Phase 1B

**Branch:** `carplay-scene-safe-test`  
**Scope:** Premium podcast home foundation (discovery only — no playback changes)

---

## Populated sections

| Home section | Source | Cache key | Home count |
|--------------|--------|-----------|------------|
| Featured Podcasts | `is_featured=true` + quality ≥ 45 | `podcast-lane:featured` | 40 |
| Trending Podcasts | `collection=trending` + recency sort | `podcast-lane:trending` | 40 |
| Most Popular | `collection=popular` + quality ≥ 30 + episode count | `podcast-lane:popular` | 40 |
| Recently Played | Local `recentlyPlayedEngine` (`podcast-*` ids) | none (local) | user-specific |
| Recommended For You | Client merge featured + trending + recent categories | `podcast-lane:recommended` | 40 |
| Emotional Podcasts | 6 mood lanes (real API queries) | per-world id | cards |
| Browse Categories | Probed browse tiles only | per-category id | tiles |

### Emotional lanes (real data, no placeholders)

1. Heartbreak Recovery  
2. Night Drive  
3. Sunday Worship  
4. Deep Focus  
5. Afro Heat  
6. Hidden Treasures  

### Browse categories (probed — empty hidden)

Business · Technology · Health · Relationships · Faith · **African Voices** · History · Science · Finance · Mature 18+ (hub)

### African Voices

Dedicated browse tile with region-aware fallback query covering Ghana, Nigeria, South Africa, Kenya, Uganda, Tanzania, Pan-African, and Diaspora discovery terms.

### Mature podcasts (separate)

- Default OFF — hidden from browse until Profile setting enabled  
- Hub route: `/podcasts/mature`  
- Nine subcategories: Dating, Relationships, Marriage, Human Behavior, Adult Comedy, After Dark, Psychology, Real Stories, Unfiltered Interviews  
- Mature shows never mixed into standard home lanes (client strip + API gating)  
- 18+ badge on all mature cards via `MatureContentBadge`

---

## Removed sections

| Removed | Reason |
|---------|--------|
| Flat 12-tile-only home grid | Replaced with lane-based home matching radio |
| New Releases standalone tile | Legacy alias → trending |
| Education / True Crime tiles | Replaced by Science / History browse structure |
| Christian / Gospel tile | Renamed/consolidated → Faith |
| `adult-conversations` flat mature tile | Replaced by Mature 18+ hub + subcategories |
| Category empty states (“Nothing here yet”) | Empty categories redirect to `/podcasts` |
| Generic list-only show rows on browse | Upgraded to premium cards with metadata chips |

---

## Quality filtering approach

Client-side `quality_score` (0–100) via `services/podcast/podcastQualityScore.ts`:

| Signal | Weight impact |
|--------|----------------|
| HTTPS artwork | +16 / missing −10 |
| Title + description completeness | +6 to +8 |
| Host / publisher present | +5 |
| Categories + primary category | +5 to +8 |
| Episode count (log scale) | up to +16 |
| Featured / exclusive flags | +8 / +4 |
| Language metadata | +3 |
| Recent publishing (`last_published_at`) | +12 (≤14d) down to −4 (stale) |

Lane curation in `podcastDiscoveryApi.ts`:

- **Featured:** quality ≥ 45, sorted by quality  
- **Trending:** sorted by recency  
- **Popular:** quality ≥ 30, sorted by episode count  
- **Emotional / Browse:** quality sort after tag/category match  
- **Standard lanes:** mature shows stripped client-side  

---

## Heat audit (actual findings)

Reviewed: `usePodcastHomeDiscovery`, `podcastDiscoveryApi`, `podcastCategoryAvailability`, `useLazyPodcastShowList`, `app/podcasts/index.tsx`, `useDeferredSearchMediaSections`.

| Check | Finding | Severity |
|-------|---------|----------|
| Podcast fetch loops | Home hook runs **one** effect per mount/settings change; 3 parallel lane fetches then sequential recent + recommended + browse probe | OK |
| Rerender loops | No render-time logging; state updates batched per async phase; `loading` cleared before secondary fetches | OK |
| Repeated API calls | Lane cache keys + inflight dedup in `podcastDiscoveryApi`; availability probes TTL 30min with inflight map | OK |
| Browse probe storm | Probes run at concurrency **2** after lanes complete; emotional worlds **not** probed (always shown) | OK |
| Search loops | Debounced 350ms; `useLazyPodcastShowList` generation guard prevents stale apply; unchanged from pre-1B | OK |
| Main search impact | Global search still deferred 480ms via `useDeferredSearchMediaSections`; podcast home search is isolated route | OK |
| Mature hub | No network on gate-off screen; subcategories load only on drill-in | OK |

**No new heat sources identified.** Residual risk: first podcast home open issues 3 lane requests + up to 10 browse probes (concurrency 2) — acceptable and mirrors radio Phase 1A pattern.

---

## Remaining blockers

| Blocker | Notes |
|---------|-------|
| Backend `collection=popular` | Falls back to search if empty; verify admin catalog exposes popular collection |
| `last_published_at` field | Quality recency depends on API providing date; gracefully skipped if absent |
| Recently Played show resolution | Episode ids stored as `podcast-{id}`; show-level cache match is best-effort until play history stores show ids |
| Dedicated `/podcasts/search` route | Optional parity with radio — inline search retained and working |
| Backend category API | Still static client categories until `/api/podcasts/categories` lands |

---

## Build readiness verdict

| Gate | Result |
|------|--------|
| `npm run typecheck` | PASS |
| Playback / HiddenAudio untouched | PASS |
| 40/page pagination preserved | PASS |
| Cache-first + inflight dedup | PASS |
| Mature gating preserved | PASS |
| Empty category redirect | PASS |
| Premium cards on home + browse | PASS |

**Verdict: Ready for QA build** on `carplay-scene-safe-test` after manual spot-check of podcast home lanes against live catalog API.
