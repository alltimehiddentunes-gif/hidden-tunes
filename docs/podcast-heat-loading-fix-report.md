# Podcast Heat / Loading Fix — Root Cause Report

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22  
**Symptom:** Podcasts page stuck on "Loading podcasts...", device heats, freezes.

---

## Root Cause

### 1. Home fetches many RSS feeds in parallel

`getPodcastHome()` in `services/podcastService.ts` (pre-fix):

```typescript
await Promise.all(seeds.slice(0, 12).map(seed => getPodcastShow(seed.feedUrl)))
await Promise.all(shows.map(show => getPodcastEpisodes(show.id, { limit: 1 })))
await Promise.all(playableShows.slice(0, 8).map(show => getPodcastEpisodes(...)))
```

Up to **12 simultaneous network requests**, each downloading a full RSS XML document.

### 2. Full-feed RSS parse on device

`parseRssFeed()` used `splitItems(xml)` over the **entire** feed. Known seed sizes:

| Feed | Items parsed |
|------|----------------|
| TED Talks Daily | ~2,739 |
| Song Exploder | ~614 |
| Lex Fridman | ~498 |
| BBC Global News | ~266 |

Parsing thousands of `<item>` blocks with regex on the JS thread blocks UI and causes heating.

### 3. Loading state never clears quickly

`usePodcastHome` starts with `loading: true`. `getPodcastHome()` is async and slow; until all RSS work completes, the home screen shows spinners.

### 4. Double spinner UI

`app/podcasts/index.tsx` showed:

- `RefreshControl refreshing={loading}` (top pull indicator)
- Inline `ActivityIndicator` + "Loading podcasts..." when `loading && !featured.length`

Both active during the same long load.

### 5. Category and search also trigger RSS

- `getPodcastShowsByCategory()` — `Promise.all` + per-show episode fetch
- `searchPodcasts()` — `getPodcastShow` + `getPodcastEpisodes` per matching seed
- `resolvePodcastEpisodeById()` — looped **all** seeds fetching full feeds

---

## Fix Summary

| Area | Change |
|------|--------|
| Home | `ENABLE_PODCAST_RSS_HOME_LOADING = false` — static seed metadata only |
| Category | Static seed shows, no RSS |
| Search | Seed title/category match only, no RSS |
| Show page | **One** feed fetch, max 10 episodes, 5s timeout |
| RSS parser | `maxItems` cap on item parsing |
| UI | No home loading spinner; show metadata instant; episodes load on show page |

Large-scale podcast catalog ingestion belongs in **backend/admin**, not mobile home mount.

---

## Performance Result

| Check | Pre-fix | Post-fix (expected) |
|-------|---------|---------------------|
| Home open time | 30s+ / infinite | < 1s |
| RSS on home mount | 12+ feeds | 0 |
| Device heat on browse | High | Normal |
| RSS on show open | 1 feed (full parse) | 1 feed, 10 items max |

**Device validation:** Re-test on physical device after this fix — home should appear instantly; show page loads one feed only.

---

## Files Changed

| File | Change |
|------|--------|
| `services/podcastService.ts` | Static home, seed-only category/search, single-feed episodes |
| `services/podcast/rssParser.ts` | `maxItems` cap, 5s `Promise.race` timeout |
| `hooks/usePodcastHome.ts` | Instant load, `finally` clears loading |
| `hooks/useDeferredSearchPodcastSections.ts` | Sync seed search |
| `app/podcasts/index.tsx` | No spinners on home, static cards only |
| `app/podcasts/show/[id].tsx` | One-feed load, retry, episode limit 10 |
| `app/podcasts/category/[id].tsx` | Static shows, no RSS |
| `app/podcasts/mature.tsx` | Static mature shows |
| `utils/podcastDiagnostics.ts` | New performance events |
