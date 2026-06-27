# Mature Podcast Expansion Audit

**Date:** 2026-06-27  
**Goal:** Expand Mature Podcasts 18+ catalog safely without heat, lag, RSS fan-out, or App Store risk.

---

## Catalog Expansion

| Metric | Before | After |
|--------|--------|-------|
| Mature seed shows | 9 (Hidden Tunes originals with unverified feeds) | **58** real shows |
| Categories | 5 | **12** (empty categories hidden) |
| Discovery rails on `/podcasts/mature` | Category grid only | **8 horizontal rails** + category browse |
| `feedUrl` on seeds | Required, fake Hidden Tunes URLs | **Optional** — omitted (discovery-only) |
| Episode network fetch for `mature-*` IDs | Skipped (prior fix) | Unchanged — still skipped |

All seeds use real titles, publishers, descriptions, categories, and rich keywords. No duplicate show entries. No fabricated RSS feeds.

---

## Categories (non-empty only)

1. All Mature Podcasts  
2. Relationships & Dating  
3. Sex Education  
4. Adult Comedy  
5. Confessions & Storytelling  
6. Psychology & Intimacy  
7. Marriage & Couples  
8. Women's Health  
9. Men's Health  
10. LGBTQ+ Conversations  
11. Explicit Interviews  
12. After Dark Talk  

`getVisibleMatureCategories()` counts seeds in a single pass and filters `showCount === 0`.

---

## Discovery Rails (`/podcasts/mature`)

Rendered only when mature 18+ is enabled and the rail has shows:

| Rail | Source |
|------|--------|
| Featured Mature | `seed.featured` |
| Trending Mature | `seed.trending` |
| Relationships & Dating | category slice (max 8) |
| Sex Education | category slice |
| Adult Comedy | category slice |
| After Dark Talk | category slice |
| New Mature Shows | `seed.isNew` |
| All Mature Podcasts | all seeds slice + See all |

No RSS, no episode parsing, no network on this screen.

---

## Search

- Remains **local metadata only** via `searchLocalPodcastDiscovery()` + `searchMaturePodcastSeeds()`
- Max **25** results
- Returns **empty** when mature 18+ disabled
- Keywords include: adult, explicit, 18+, nsfw, relationship, dating, love, sex education, comedy, after dark, confessions, etc.

---

## Safety Gates

| When mature OFF | Behavior |
|-----------------|----------|
| Mature home | Hidden catalog, toggle prompt |
| Category pages | Blocked with settings link |
| Show deep links (`mature-*`) | Blocked with settings link |
| Search | No mature results |
| Episodes | Not loaded for mature IDs |

| When mature ON | Behavior |
|----------------|----------|
| Explicit **E** badge on mature rail cards | Yes |
| Episode fetch | Skipped for `mature-*` — show page shows “Episodes unavailable right now.” |
| Toggle off anytime | Immediate hide via preference |

---

## Performance Rules (unchanged)

- No RSS on mature home or category pages  
- One feed fetch only on non-mature show open (N/A for mature seeds)  
- Max 10 episodes, 5s timeout for admin shows  
- Precomputed search haystacks  
- Horizontal rails: `initialNumToRender={4}`, clipped subviews  

---

## Files Changed

- `data/podcastSeeds.ts` — optional `feedUrl`, rail flags  
- `data/maturePodcastSeedCatalog.ts` — **58 show catalog**  
- `utils/maturePodcastCategories.ts` — 12 categories  
- `utils/podcastCategoryMatching.ts` — category aliases  
- `services/podcastService.ts` — `getMatureDiscoveryRails()`  
- `components/podcast/MaturePodcastShowRail.tsx` — horizontal rail  
- `components/podcast/PodcastDiscoveryCards.tsx` — explicit badge  
- `app/podcasts/mature.tsx` — rails + category browse  
- `app/podcasts/show/[showId].tsx` — direct-link block when disabled  

**Not touched:** PlayerContext, mature radio, music/radio playback.

---

## Validation

```bash
cd hidden-tunes-app
npm run typecheck   # pass
git diff --check    # pass
```

### Device checklist

- [ ] Mature page opens fast, no heat  
- [ ] Search: adult, explicit, love, dating, sex education → results  
- [ ] Every visible category has shows  
- [ ] No empty category pages  
- [ ] Opening one show does not freeze  
- [ ] Deep link to mature show blocked when 18+ off  

---

## Remaining Risks

1. **Discovery-only playback** — mature catalog shows metadata; episodes unavailable until verified feed integration (by design).  
2. **Search cache** — home search merges cached admin shows + mature seeds; first launch may have thinner non-mature cache.  
3. **Artwork** — most seeds omit `artworkUrl`; mic fallback used (no mass image preload).
