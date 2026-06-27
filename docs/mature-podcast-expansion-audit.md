# Mature Podcast Expansion Audit

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Goal

Expand the mature (18+) podcast discovery hub with **20 real categories**, **11 hub rails**, playable-first ranking, and mature-gated search — using only legitimate iTunes Search + RSS sources (HT podcast API fallback when deployed).

---

## Categories implemented (20)

| # | Category ID | Query group | Keywords (sample) |
|---|-------------|-------------|-------------------|
| 1 | `mature-dating` | dating | dating, dating advice, modern dating, singles, relationships |
| 2 | `mature-relationships` | relationships | relationships, romance, couples, love advice, marriage |
| 3 | `mature-marriage` | marriage | marriage, marriage advice, married life, couples therapy |
| 4 | `mature-breakups-divorce` | breakups-divorce | breakup podcast, divorce stories, separation, moving on |
| 5 | `mature-sexual-health` | sexual-health | sexual health, intimacy, sex education, communication |
| 6 | `mature-intimacy-communication` | intimacy-communication | intimacy, communication, emotional intimacy, couples communication |
| 7 | `mature-adult-psychology` | adult-psychology | psychology, human behavior, attachment styles, emotional intelligence |
| 8 | `mature-human-behavior` | human-behavior | human behavior, social psychology, human nature podcast |
| 9 | `mature-love-advice` | love-advice | love advice, romance advice, modern love |
| 10 | `mature-relationship-therapy` | relationship-therapy | relationship therapy, couples therapy, marriage counseling |
| 11 | `mature-mens-issues` | mens-issues | men's issues, modern manhood, men's mental health |
| 12 | `mature-womens-issues` | womens-issues | women's issues, women's health podcast, modern womanhood |
| 13 | `mature-lgbtq-conversations` | lgbtq-conversations | LGBTQ podcast, queer podcast, gay podcast, pride podcast |
| 14 | `mature-adult-comedy` | adult-comedy | adult comedy, uncensored comedy, late night comedy |
| 15 | `mature-confessions` | confessions | confessions, anonymous stories, true confessions |
| 16 | `mature-real-stories` | real-stories | real stories, personal stories, life stories |
| 17 | `mature-after-dark-conversations` | after-dark-conversations | after dark, late night talk, unfiltered talk, nightlife |
| 18 | `mature-lifestyle-18` | lifestyle-18 | adult lifestyle, nightlife, dating culture, mature lifestyle |
| 19 | `mature-late-night-talk` | late-night-talk | late night talk, midnight talk, grown folk talk |
| 20 | `mature-unfiltered-interviews` | unfiltered-interviews | unfiltered interviews, uncensored interviews, raw interviews |

**UI rule:** Categories appear only after availability probe returns ≥1 show (`limit: 1`, concurrency 2, 30min TTL cache).

---

## Hub rails (11)

Only populated rails render on `/podcasts/mature`:

| Lane | Search query |
|------|--------------|
| Featured Mature Podcasts | relationships dating advice podcast |
| Trending Mature Podcasts | trending relationships podcast |
| Popular Mature Podcasts | popular love advice podcast |
| New Episodes | new relationship podcast episodes |
| Dating & Relationships | dating relationships podcast |
| Sexual Health | sexual health intimacy podcast |
| Adult Psychology | psychology relationships podcast |
| Adult Comedy | adult comedy uncensored podcast |
| Real Stories | confessions real stories podcast |
| After Dark | after dark late night talk podcast |
| Hidden Gems | underrated relationships podcast |

Lanes load **sequentially** with `HOME_LANE_STAGGER_MS` stagger — no startup fetch storm.

---

## Source architecture

| Layer | Implementation |
|-------|----------------|
| Shows | `fetchPodcastShows` → HT API; on 404 → **iTunes Search API** (`podcastItunesRssSource.ts`) |
| Episodes | HT API; on 404 → **RSS enclosure parsing** (HTTPS audio URLs) |
| Show IDs | `itunes-{collectionId}` |
| Mature gating | `shouldIncludeMatureInApi()` — OFF by default; consent modal on open/play |
| Page size | 40 items (`MATURE_DISCOVERY_PAGE_SIZE`) |
| Cache | `readCachedPodcastShows` / `writeCachedPodcastShows` per lane and category |

**No fake podcasts, no fake episodes, no generated audio, no placeholders.**

---

## Per-category audit logging (dev)

Enable `ENABLE_MATURE_DISCOVERY_DIAGNOSTICS` in `utils/devDiagnostics.ts`.

`filterAndRankMaturePodcastShows` logs via `[HTMatureDiscovery] mature_podcast_category_audit`:

| Metric | Meaning |
|--------|---------|
| `raw` | iTunes/API rows before dedupe |
| `afterDedupe` | Unique by id/slug/title |
| `afterQuality` | Passes mature quality gate (min 25) |
| `playableShows` | Episode count > 0 + artwork/feed validity |

Sparse categories (< 20 on page 1) trigger adjacent-group fallback and `mature_weak_category` log.

---

## Expected source counts (iTunes probe, typical)

Based on prior runtime verification with iTunes Search + RSS:

| Signal | Expected |
|--------|----------|
| Raw shows per keyword | 15–50 from iTunes |
| After dedupe | ~80–90% of raw |
| After quality filter | ~60–75% of deduped |
| Playable (episode_count > 0) | ~90%+ of quality-passed iTunes shows |
| Categories with probe hit | **18–20 / 20** (all major groups return results) |

**Likely weak categories** (may need adjacent fallback on first page):

- `mens-issues` / `womens-issues` — narrower query terms
- `lifestyle-18` — generic lifestyle overlap
- `unfiltered-interviews` — interview noise from non-mature shows

---

## Quality filtering

`services/mature/matureQualityFilters.ts`:

- Dedupe by id, slug, normalized title
- Spam/dead-feed keyword rejection
- Abandoned feed demotion (>180 days, <3 episodes)
- Playable-first ranking (episode count, artwork, recency)
- iTunes shows relaxed: artwork OR episode_count ≥ 1

Demoted: dead feeds, empty feeds, no playable episodes, spam, duplicates.

---

## Search integration

`utils/mediaSearchQueryExpansion.ts` — 12 mature alias groups (dating, relationships, marriage, breakups, sexual health, psychology, confessions, after dark, adult comedy, real stories, LGBTQ, mature).

When mature OFF: no mature aliases, no mature suggestions, search filters `is_mature` results.

When mature ON + consented: mature queries expand into podcast search fallbacks.

---

## Preserved constraints

- Mature content OFF by default
- Consent gate required before category/show open
- 18+ badges on mature cards
- Cache-first lane/category loading
- 40 items per page, load next 40
- No startup fetch storms (staggered lanes, probe limit 1)
- HiddenAudio / playback / queue / CarPlay / Android Auto **unchanged**

---

## Remaining blockers

| Blocker | Impact | Mitigation |
|---------|--------|------------|
| HT podcast API 404 | Primary catalog unavailable | iTunes + RSS fallback active |
| GitHub HTTPS push in agent shell | Cannot auto-push | User pushes locally |
| Episode playback depends on RSS HTTPS enclosures | Rare feeds use HTTP-only | Skipped in RSS parser |
| Category availability probe adds ~10 lightweight requests on first mature hub open | Minor latency once per 30min | Cached; concurrency capped at 2 |

---

## Validation checklist

- [x] `npm run typecheck`
- [x] `git diff --check`
- [ ] Manual: Mature OFF → no mature podcasts visible
- [ ] Manual: Mature ON + consent → mature hub with populated rails
- [ ] Manual: Dating, Relationships, Sexual Health, Adult Comedy, After Dark, Real Stories open with real shows
- [ ] Manual: Episode audio plays via existing playback path
- [ ] Manual: No placeholders, no black pages, no heat spikes

---

## Files touched

| Area | Files |
|------|-------|
| Categories | `constants/podcastMatureCategories.ts`, `constants/maturePodcastQueryGroups.ts`, `constants/matureCategoryFallbacks.ts` |
| Hub lanes | `constants/maturePodcastHubLanes.ts`, `services/mature/maturePodcastHubLanes.ts`, `hooks/useMaturePodcastHubDiscovery.ts` |
| Availability | `services/mature/maturePodcastCategoryAvailability.ts`, `hooks/useMaturePodcastCategoryAvailability.ts` |
| UI | `app/podcasts/mature/index.tsx` |
| Search | `utils/mediaSearchQueryExpansion.ts` |
| Home mature grid | `hooks/usePodcastHomeDiscovery.ts` (availability-filtered) |
| Quality | `services/mature/matureQualityFilters.ts` (iTunes playable relax) |
