# Mature 20k Discovery Plan

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`

## Goal

Build search/source architecture so Hidden Tunes can surface a large mature catalog without hardcoding or bulk-loading content on mobile.

| Target | Scale | Mobile behavior |
|--------|-------|-----------------|
| Mature podcasts | **20,000+** quality shows long term | 40/page, load next 40 |
| Mature radio | **500–2,000** quality stations (realistic) | 40/page, load next 40 |

No fake content. No 20k radio stations. No startup mature fetch.

---

## Source Strategy

### Podcasts

| Source | Role |
|--------|------|
| **Hidden Tunes catalog API** (`admin.hiddentunes.com/api/podcasts/shows`) | Primary mobile search surface; proxies Podcast Index + RSS ingestion server-side |
| **Podcast Index search** | Backend ingest/search provider (not called directly from mobile) |
| **RSS feeds / public directories** | Backend ingest sources for catalog growth |
| **Category keyword expansion** | Mobile rotates through keyword groups per mature category (`constants/maturePodcastQueryGroups.ts`) |
| **Mature/adult query mapping** | 11 query groups × 3–5 keywords each = deep catalog coverage |

Mobile never stores 20k shows. It issues paginated searches and merges/dedupes/ranks each page.

### Radio

| Source | Role |
|--------|------|
| **Radio Browser API** | Primary live station search (name + tag queries) |
| **Public internet radio directories** | Long-term backend ingest (see `docs/radio-20k-architecture.md`) |
| **Mature category search expansion** | 9 mature radio groups × 3 name queries + tag fallback (`constants/matureRadioQueryGroups.ts`) |

Realistic mature radio target: **500–2,000** stations after quality filtering — not 20k.

---

## Query Groups

### Mature Podcast Groups (`constants/maturePodcastQueryGroups.ts`)

| Group | Keywords |
|-------|----------|
| Dating | dating, singles, modern dating, dating advice |
| Relationships | relationships, love, couples, romance, relationship advice |
| Marriage | marriage, couples therapy, married life, divorce |
| Sexual Health | sexual health, sex education, intimacy, safe sex |
| Adult Psychology | adult psychology, human behavior, intimacy, desire |
| After Dark | after dark, late night talk, unfiltered, taboo |
| Adult Comedy | adult comedy, uncensored comedy, late night comedy |
| Real Stories | confessions, real stories, personal stories, life stories |
| Unfiltered Interviews | uncensored interviews, unfiltered talk, adult conversations |
| Lifestyle 18+ | adult lifestyle, mature lifestyle, relationships, nightlife |
| Adult Talk | adult talk, mature conversations, grown up talk, explicit talk |

Each maps to a mature podcast category tile (`constants/podcastMatureCategories.ts`).

### Mature Radio Groups (`constants/matureRadioQueryGroups.ts`)

- Late Night Radio
- Adult Talk
- Relationship Radio
- Dating Radio
- Adult Comedy Radio
- Psychology Radio
- Call-In Shows
- Unfiltered Talk
- International Adult Radio

Each maps to a mature radio browse category (`constants/radioCategories.ts` → `RADIO_MATURE_CATEGORIES`).

---

## Quality Filters (`services/mature/matureQualityFilters.ts`)

### Prefer (rank higher)

- Recent episodes / `last_published_at`
- HTTPS artwork
- Valid title + publisher/host
- Episode count > 0
- Language/country metadata
- Reliable stream URLs (radio)
- Higher bitrate / votes / clicks (radio)

### Demote / remove

- Dead feeds (0 episodes, no publish date)
- Duplicate id/slug/title (podcast) or stream URL (radio)
- Missing title
- Spam keyword stuffing
- Placeholder/test feeds
- Abandoned podcasts (>540 days, <3 episodes)
- Broken or missing artwork (demoted, not always removed)

Minimum quality gates:

- Podcasts: `quality_score >= 25` (`MATURE_PODCAST_MIN_QUALITY`)
- Radio: `quality_score >= 28` (`MATURE_RADIO_MIN_QUALITY`)

---

## Mature Gating

**Default: OFF**

When OFF:

- No mature podcasts in lists
- No mature radio in browse
- No mature search results (`includeMature` not sent)
- No mature category tiles

When ON + consent:

- `shouldIncludeMatureInApi()` returns true
- Mature content visible with 18+ badges
- Mature stays in separate hub/categories
- Consent text: *"I confirm that I am 18 or older and want to access mature content."*

Implementation: `utils/matureContentSettings.ts`, `hooks/useMatureContentGate.ts`, `utils/maturePodcastVisibility.ts`.

---

## Pagination Model

```
Mobile request (offset N)
  → virtualPage = floor(N / 40)
  → rotate 3 keywords/queries per virtualPage
  → fetch catalog/Radio Browser (40 per keyword max)
  → merge → dedupe → quality filter → rank
  → return top 40 to UI
  → hasMore if sources have more AND virtualPage < 500
```

Constants (`constants/matureDiscoveryFoundation.ts`):

- `MATURE_DISCOVERY_PAGE_SIZE = 40`
- `MATURE_KEYWORDS_PER_FETCH = 3`
- `MATURE_MAX_VIRTUAL_PAGES = 500` (safety cap; 500 × 40 = 20k exposure ceiling)

Orchestration:

- Podcasts: `services/mature/maturePodcastDiscovery.ts`
- Radio: `services/mature/matureRadioDiscovery.ts`

Wired into:

- `services/podcastDiscoveryApi.ts` (mature category tier)
- `services/radio/radioBrowserApi.ts` (mature category tier)

---

## Mobile Performance Rules

| Rule | Status |
|------|--------|
| No startup mature fetch | ✅ Mature loads only when user opens mature hub/category |
| No bulk 20k mobile load | ✅ 40 items per page only |
| Cache-first standard discovery | ✅ Unchanged for non-mature lanes |
| Request dedupe | ✅ Inflight map per virtual page key |
| Stale request cancellation | ✅ Generation counter + abort controllers (radio) |
| Latest tap wins | ✅ Generation invalidates stale responses |

---

## Architecture Files

| File | Purpose |
|------|---------|
| `constants/matureDiscoveryFoundation.ts` | Targets, page size, quality floors |
| `constants/maturePodcastQueryGroups.ts` | Podcast keyword expansion groups |
| `constants/matureRadioQueryGroups.ts` | Radio search expansion groups |
| `constants/podcastMatureCategories.ts` | UI category tiles → query groups |
| `constants/radioCategories.ts` | `RADIO_MATURE_CATEGORIES` browse tiles |
| `services/mature/matureQualityFilters.ts` | Dedupe, spam filter, ranking |
| `services/mature/maturePodcastDiscovery.ts` | Multi-query podcast page loader |
| `services/mature/matureRadioDiscovery.ts` | Multi-query radio page loader |
| `services/podcastDiscoveryApi.ts` | Routes mature tier to expansion loader |
| `services/radio/radioBrowserApi.ts` | Routes mature tier to expansion loader |

---

## Long-Term Backend Path (not mobile)

To reliably reach **20,000+ indexed mature podcasts**:

1. Server-side ingest from Podcast Index + RSS + directories
2. Dedupe by feed URL / Podcast Index id
3. Quality score at index time
4. Mature flag + `content_rating` at index time
5. Mobile continues 40/page via catalog API — no architecture change needed

For radio **500–2,000** mature stations:

1. Server-side Radio Browser ingest + quality filter
2. Mature tag/name classification at index time
3. Mobile 40/page via future `radioCatalogApi` (see `docs/radio-20k-architecture.md`)

---

## Manual QA

- [ ] Mature OFF → no mature podcasts/radio anywhere
- [ ] Enable mature + consent → mature hub categories appear
- [ ] Open Dating podcasts → 40 shows, load next 40
- [ ] Open Adult Talk radio → stations play
- [ ] Quality: no blank-title rows, spam minimized
- [ ] Fast navigation between mature categories → no crash
- [ ] 18+ badges visible on mature items
