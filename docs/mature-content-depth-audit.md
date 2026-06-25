# Mature Content Depth Audit

Date: 2026-06-22  
Branch: `carplay-scene-safe-test`  
Scope: +18 podcast depth, mature radio reality, hub rails, performance guards

## Summary

Mature discovery now rotates **3 keyword queries per virtual page** (not all keywords at once), merges weak categories into mixed hub rails, and hides standalone browse tiles for categories that would feel like empty rooms. Hub rails require **≥10 playable shows** before display. Mature radio stays below podcasts and is labeled **Live Mature Talk**; radio subcategory browse hides when playable inventory is under 10 stations.

## Backend / source blockers

| Source | Status |
|--------|--------|
| Hidden Tunes `/api/podcasts/shows` | **404** — skipped at runtime; iTunes Search + RSS episode fallback is the live path |
| iTunes Search | Primary mature podcast show source |
| RSS feed extraction | Episode playback when user opens a show |
| Radio Browser API | Mature live talk (HTTPS streams only) |

No fake, placeholder, or paid API keys were added.

## Phase 1 — Dev mature inventory audit

Enable in `utils/devDiagnostics.ts`:

```ts
export const ENABLE_MATURE_DISCOVERY_DIAGNOSTICS = true;
```

When the mature hub mounts (mature ON + consent), `utils/matureInventoryAudit.ts` schedules a **one-per-session** audit after 2.5s idle.

Per mature podcast category (`[HTMatureDiscovery] mature_podcast_category_audit`):

- `queryTermsUsed`
- `raw` shows returned
- `afterDedupe`
- `showsWithEpisodes`
- `afterQuality`
- `playableShows`
- `finalDisplayedCount`
- `first20Titles`

Per mature radio hub (`mature_radio_category_audit` / `mature_radio_inventory_summary`):

- `raw` / `rawStations`
- `playableStreams` / `httpsStreams`
- `finalDisplayedCount`
- `first20StationNames`

## Phase 2 — Source depth (keyword rotation)

`constants/discoveryPerformanceBudget.ts`:

- `MATURE_KEYWORDS_PER_VIRTUAL_PAGE = 3`
- Virtual page 1 → strongest 3 keywords, page 2 → next 3, etc.
- Optional +1 fallback keyword when batch &lt; 20 results
- Page size remains **40/shows**

Expanded natural-language terms in `constants/maturePodcastQueryGroups.ts` for:

- Dating, Relationships, Sexual Health, After Dark, Adult Comedy, Confessions / Real Stories, Unfiltered Interviews

## Phase 3 — Multi-source fallback

Unchanged legal stack: HT backend attempt → iTunes → RSS episodes. HT 404 is expected; mobile uses public iTunes/RSS only.

## Phase 4 — Hub rails (≥10 playable)

`constants/maturePodcastHubLanes.ts` rails:

| Rail | Kind |
|------|------|
| Featured Mature | search |
| Trending Mature | search |
| New Mature Episodes | search |
| Relationships & Dating | categories merge |
| After Dark | categories merge |
| Real Stories | categories merge |
| Adult Comedy | categories |
| Sexual Health | categories merge |
| Hidden Gems | search |

Weak standalone browse tiles hidden (`hubStandalone: false`):

- Marriage, Breakups & Divorce, Intimacy & Communication, Adult Psychology, Human Behavior, Love Advice, Relationship Therapy, Men's/Women's Issues, LGBTQ+, Confessions, Lifestyle 18+, Late Night Talk

Still reachable via merged rails and direct category routes.

## Phase 5 — Mature radio reality

- Hub section title: **Live Mature Talk** (not headline radio inventory)
- Podcast rails + category grid appear **above** live radio
- Mature radio subcategory grid hidden when playable hub stations &lt; **10**

## Phase 6 — Performance safety

| Guard | Implementation |
|-------|----------------|
| Max 2 active requests | `discoveryRequestManager` in `useMaturePodcastHubDiscovery` |
| No 17-category probe on hub open | `MATURE_CATEGORY_PREFETCH = false`; static browse tiles |
| No mature fetch when mature OFF | `shouldIncludeMatureInApi()` gates all loaders |
| Visible-rail-only first paint | `DISCOVERY_PRIORITY_RAIL_LIMIT = 2`, idle/scroll for more |
| Cancel stale / latest wins | `createDiscoveryScreenController` + mature podcast abort controllers |
| Keyword batch sequential | 3 queries per virtual page run sequentially inside category fetch |

## Category counts (before → after)

| Metric | Before | After (expected) |
|--------|--------|------------------|
| Keywords per virtual page | 1 (+1 sparse fallback) | **3** (+1 sparse fallback) |
| Hub rails | 5 search-only | **9** mixed search + category merge |
| Hub rail minimum | any non-empty | **≥10 playable** |
| Standalone browse categories | 20 | **8** strong tiles |
| Mature radio headline | above podcasts possible | **below podcasts**, realistic label |

Run dev audit with `ENABLE_MATURE_DISCOVERY_DIAGNOSTICS = true` for live per-category playable counts on device/network.

## Playable episode proof

Shows must pass `isMaturePlayableShow` in `services/mature/matureQualityFilters.ts`:

- Real title + id
- `episode_count > 0` (iTunes metadata)
- Quality gate + spam/dead-feed rejection

Episode audio URLs resolve at show page via existing iTunes/RSS path (`podcastCatalogApi` → `fetchItunesPodcastEpisodes`).

## Validation

```bash
npm run typecheck
git diff --check
```

## Manual QA checklist

- [ ] Mature ON + consent → open Mature hub
- [ ] Featured Mature rail has ≥10 real shows
- [ ] Dating, Relationships, Sexual Health, After Dark, Real Stories categories open
- [ ] Show → episodes load → episode plays
- [ ] No placeholders / empty standalone rooms
- [ ] Live Mature Talk below podcasts; no inflated radio headline
- [ ] No heat from category probe storm

## Build readiness

- Typecheck: run locally after pull
- Physical episode playback: **manual device QA required**
- Push: requires local GitHub credentials if remote auth fails in CI/agent shell
