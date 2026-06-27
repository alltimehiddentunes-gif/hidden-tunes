# Podcast + Radio Search Discovery Fix

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Problem

Radio search used Radio Browser `name=` only, so country/genre queries like **ghana** or **love** often returned zero stations. Podcast search used a single catalog query with no alias fallback, causing dead-end empty screens for common topics.

## Solution overview

1. Shared query expansion helpers (`utils/mediaSearchQueryExpansion.ts`)
2. Radio multi-strategy search with capped fallbacks (`services/radio/radioSearchDiscovery.ts`)
3. Podcast search fallback ladder in `fetchSearchShowsFromNetwork`
4. Rich empty states with suggested searches + browse/featured recovery (`components/discovery/MediaSearchEmptyState.tsx`)

Playback, HiddenAudio, queue, CarPlay, Android Auto, and Desktop were not touched.

---

## Query expansion rules

Canonical alias groups cover common intents:

| Query | Expands to (examples) |
|-------|------------------------|
| ghana | ghanaian, accra, twi, akan, highlife; country Ghana (GH); tags ghana, highlife |
| love | romance, relationships, dating, slow jams, r&b |
| gospel | worship, christian, praise, faith, sermons |
| afrobeats | afrobeat, amapiano, highlife, african music |
| news | talk, current affairs, politics |
| sports | football, soccer, basketball |
| business | entrepreneurship, startup, finance |
| relationships | love, dating, marriage, heartbreak |

**Mature aliases** (dating, adult, marriage intimacy) are included only when `shouldIncludeMatureInApi()` is true.

Max expansion:

- **5** radio strategies (direct + country/code + tags/aliases)
- **5** podcast query variants (direct + `podcast` suffix + aliases)

---

## Fallback strategy

### Radio (`fetchExpandedRadioSearchPage`)

Page 1 (offset 0):

1. Direct `name=` query
2. If still under 40 results, try next strategy sequentially:
   - `country=`
   - `bycountrycodeexact/`
   - `tag=`
   - alias `name=` / mature `tag=` (mature ON only)
3. Dedupe by station id + stream URL
4. Rank by quality score
5. Apply mature filter when mature OFF

Page 2+ uses direct `name=` pagination against the original query (cache-first via existing lazy list).

### Podcast (`fetchSearchShowsFromNetwork`)

Page 1:

1. Primary user query
2. If primary returns **0** shows, try expanded queries until results or cap reached
3. If primary returns **>0**, stop (exact match wins)
4. Accumulate fallback batches up to 40 shows
5. Dedupe + quality rank + mature visibility filter

---

## Empty state behavior

### Radio (`app/stations/search.tsx`)

- Idle prompt: suggested searches (Ghana, Gospel, Afrobeats, …)
- No-results: friendly copy + suggestion chips (tap to re-search)
- Never shows bare "No stations found" without suggestions

### Podcast (`app/podcasts/index.tsx`)

- No-results: suggestion chips + featured rail + popular category grid
- **Mature 18+** chip opens mature hub when mature is enabled
- Featured/browse content gives recovery path without leaving search mode

---

## Mature gating

| Mature OFF | Mature ON + consent |
|------------|---------------------|
| No mature alias expansion | Mature alias groups available |
| `filterMatureStations` strips adult radio | Mature radio kept |
| `filterVisiblePodcastShows` strips mature podcasts | Mature podcasts included in API |
| No "Mature 18+" suggestion chip | Suggestion chip routes to `/podcasts/mature` |

---

## Performance rules preserved

- 40 results per page
- Cache-first via existing lazy list hooks
- Sequential radio fallbacks (not unbounded parallel loops)
- Capped alias attempts (max 5)
- Latest query wins via existing request generation in hooks
- No startup bulk fetch added

---

## Manual QA checklist

| Test | Expected | Result |
|------|----------|--------|
| Radio: ghana | Ghana stations / highlife / country matches | **Pending device QA** |
| Radio: love | Romance / R&B / relationship stations | **Pending device QA** |
| Radio: gospel | Worship / christian stations | **Pending device QA** |
| Radio: afrobeats | Afrobeats / amapiano stations | **Pending device QA** |
| Radio: news, sports | Relevant stations, no dead empty | **Pending device QA** |
| Podcast: ghana | African voices / ghana podcasts | **Pending device QA** |
| Podcast: love, relationships | Relationship/dating shows | **Pending device QA** |
| Podcast: gospel, business, health, comedy | Meaningful results or suggestions | **Pending device QA** |
| Mature OFF | No mature results/aliases/suggestions | **Pending device QA** |
| Mature ON | Mature aliases + 18+ chip | **Pending device QA** |
| Fast typing | Latest query wins, no crash | **Pending device QA** |
| Heat | No runaway fallback loops | **PASS (code audit)** |

---

## Files changed

- `utils/mediaSearchQueryExpansion.ts` (new)
- `services/radio/radioSearchDiscovery.ts` (new)
- `components/discovery/MediaSearchEmptyState.tsx` (new)
- `services/radio/radioBrowserApi.ts`
- `services/podcastDiscoveryApi.ts`
- `app/stations/search.tsx`
- `app/podcasts/index.tsx`
- `docs/podcast-radio-search-discovery-fix.md` (this file)
