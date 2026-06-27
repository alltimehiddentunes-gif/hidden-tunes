# Mature Audio Discovery Maximization

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Strategy

Mature discovery is **podcast-first (80–90%)** with a **live radio slice (10–20%)** when real playable inventory exists. No fake stations, podcasts, placeholders, or generated audio.

| Layer | Source | Role |
|-------|--------|------|
| Podcasts | iTunes Search + RSS (HT API when deployed) | Hero experience — rails, categories, playback |
| Radio | Radio Browser API | Secondary — only categories with ≥5 HTTPS streams |

---

## Mature hub structure

### Podcast rails (top — only populated)

1. Featured Mature  
2. Trending Mature  
3. New Episodes  
4. Most Popular  
5. Hidden Gems  

### Live radio (when inventory exists)

6. Live Mature Radio — horizontal station rail  
7. Mature radio rooms — category grid (≥5 stations each, or merged talk)

### Podcast categories (20 — availability probed)

Dating · Relationships · Marriage · Breakups · Sexual Health · Intimacy & Communication · Adult Psychology · Human Behavior · Love Advice · Relationship Therapy · Men's Issues · Women's Issues · LGBTQ+ Conversations · Adult Comedy · Confessions · Real Stories · After Dark Conversations · Lifestyle 18+ · Late Night Talk · Unfiltered Interviews

---

## After Dark expansion

`after-dark-conversations` query group expanded with mature discussion terms (no explicit keywords required):

- late night conversations, dating culture, intimacy discussions  
- adult lifestyle, nightlife, confessions, relationship advice  
- call-in talk show, adult comedy podcast, mature storytelling  

Adjacent fallbacks: `late-night-talk`, `confessions`, `lifestyle-18`.

---

## Podcast quality rules

`services/mature/matureQualityFilters.ts` promotes:

- Recent episodes (≤14 days +18 score, ≤30 days +14)  
- Multiple episodes (≥3, ≥10, ≥25 tiers)  
- HTTPS artwork, host name, rich description  
- Playable iTunes/RSS inventory  

Demotes: dead feeds, empty feeds, spam, duplicates, abandoned catalogs (>540 days + low episode count).

Dev audit logs: `raw`, `afterDedupe`, `afterQuality`, `playableShows` via `[HTMatureDiscovery]`.

---

## Mature radio rules

**Threshold:** `MATURE_RADIO_MIN_CATEGORY_STATIONS = 5`

| Primary room | Shown when |
|--------------|------------|
| Adult Talk | ≥5 playable HTTPS streams |
| Relationship Radio | ≥5 |
| Love Advice Radio | ≥5 |
| Late Night Radio | ≥5 |
| Call-In Radio | ≥5 |
| Psychology Radio | ≥5 |

**Supplement groups** (hidden individually when weak): Dating Radio, Adult Comedy Radio, Unfiltered Talk, International Adult Radio.

**Merged section:** When supplement groups have 1–4 stations, inventory merges into **Mature Talk** (`mature-talk-radio`) if merged pool reaches ≥5 streams.

**Hidden:** Categories with 0 playable streams; merged talk if merged pool also <5.

Probe cache: 30min TTL, concurrency 2.

---

## Inventory expectations

| Signal | Podcasts | Radio |
|--------|----------|-------|
| Query groups | 20 categories + 5 hub lanes | 6 primary + 4 supplement + 1 merged |
| Typical raw per keyword | 15–50 iTunes shows | 5–40 Radio Browser stations |
| After quality filter | ~60–75% of deduped | ~40–60% of deduped |
| Playable threshold | episode_count > 0 + feed | HTTPS stream URL |
| Expected visible categories | 18–20 / 20 podcast | 2–5 / 6 primary radio (+ merged when needed) |

### Weak areas remaining

- **Men's / Women's Issues** — narrower podcast queries  
- **Lifestyle 18+** — overlaps general lifestyle  
- **Dating Radio / International Adult Radio** — often <5 stations → merged into Mature Talk  
- **HT podcast API** — still 404; iTunes/RSS fallback active  

---

## Source limitations

- Radio Browser mature talk inventory is sparse in some regions  
- iTunes episode counts are estimates until RSS is fetched  
- No bulk catalog preload — cache-first, staggered lanes, no startup storms  
- Mature OFF by default; consent required for open/play  

---

## Files

| Area | Files |
|------|-------|
| Hub lanes | `constants/maturePodcastHubLanes.ts` |
| After Dark | `constants/maturePodcastQueryGroups.ts` |
| Radio groups | `constants/matureRadioQueryGroups.ts` |
| Radio availability | `services/mature/matureRadioCategoryAvailability.ts` |
| Radio hub lane | `services/mature/matureRadioHubLanes.ts` |
| Podcast quality | `services/mature/matureQualityFilters.ts` |
| Hub UI | `app/podcasts/mature/index.tsx` |
| Hooks | `useMaturePodcastHubDiscovery`, `useMatureRadioHubDiscovery`, `useMatureRadioCategoryAvailability` |
| Radio home filter | `hooks/useRadioHomeDiscovery.ts` |

---

## Validation

- [x] `npm run typecheck`
- [x] `git diff --check`
- [ ] Manual: Featured Mature populated  
- [ ] Manual: Dating, Relationships, After Dark, Adult Comedy, Real Stories  
- [ ] Manual: Episode + station playback  
- [ ] Manual: No empty rails, no black pages, no heat spikes  
