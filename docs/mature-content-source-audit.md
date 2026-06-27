# Mature Content Source Audit

**Branch:** `carplay-scene-safe-test`  
**Date:** 2026-06-22

## Source architecture

| Content | Primary API | Fallback |
|---------|-------------|----------|
| Mature podcasts | `GET https://admin.hiddentunes.com/api/podcasts/shows` (`includeMature=true`, keyword `q=`) | Secondary keyword page + adjacent mature category merge |
| Mature radio | Radio Browser (`name=` / `tag=` search) | Expanded query aliases per category |

**Not used on mobile (by design):** Direct Podcast Index API, paid directories, hardcoded shows.

Backend ingest (Podcast Index + RSS) feeds the Hidden Tunes catalog server-side per `docs/mature-20k-discovery-plan.md`.

---

## Diagnostics (dev-only)

Enable in `utils/devDiagnostics.ts`:

```ts
export const ENABLE_MATURE_DISCOVERY_DIAGNOSTICS = true;
```

Logs via `utils/matureDiscoveryDiagnostics.ts` — `[HTMatureDiscovery]` prefix.

Per mature podcast category batch:

| Metric | Meaning |
|--------|---------|
| `raw` | API rows before dedupe |
| `afterDedupe` | Unique shows by id/slug/title |
| `afterQuality` | Passes mature quality gate (min 25, relaxed 20 for supplements) |
| `playableShows` | Shows with `episode_count > 0` and `last_published_at` |

Per mature radio category:

| Metric | Meaning |
|--------|---------|
| `raw` | Radio Browser rows |
| `afterDedupe` | Unique station ids/streams |
| `playableStreams` | HTTPS stream URLs |
| `afterQuality` | Passes mature radio quality gate (min 28) |

**No production logging** unless dev flag is enabled.

---

## Category keyword expansion

Each mature podcast category now queries **4 keywords per virtual page** (was 3) with expanded real-world aliases:

| Category | Example new terms |
|----------|-------------------|
| Dating | dating advice, modern dating, singles, dating app, first dates |
| Relationships | toxic relationships, love stories, couples talk, love advice |
| Marriage | marriage counseling, divorce stories, couples therapy |
| Sexual Health | reproductive health, relationships and intimacy |
| Adult Psychology | attachment styles, trauma bonding, intimacy psychology |
| After Dark | uncensored podcast, taboo talk, nightlife talk |
| Adult Comedy | stand up comedy podcast, comedy after dark |
| Real Stories | confessions podcast, anonymous stories |
| Unfiltered Interviews | no filter podcast, real talk podcast |
| Lifestyle 18+ | dating culture, modern relationships |
| Adult Talk | grown folk talk, late night conversations |

**Total keyword slots:** 66 (up from ~40).

---

## Sparse category expansion

When a mature podcast category returns **< 20** shows on page 1:

1. Fetch **secondary keyword virtual page** (next keyword rotation)
2. If still sparse, merge up to **2 adjacent categories** (relaxed quality floor 20)
3. Log `mature_weak_category` in dev diagnostics

Adjacent map in `constants/matureCategoryFallbacks.ts`.

UX: Mature category screens show **"More Mature Podcasts"** footer instead of redirecting away.

---

## Playable-first ranking

Mature shows ranked by:

1. Playable signal first (`episode_count > 0` + `last_published_at`)
2. Quality score boosts: 3+ episodes, recent publish, artwork, publisher, description
3. Demoted: spam, dead feeds, placeholders, abandoned feeds

Unplayable shows filtered at episode layer (HTTPS `audio_url` required).

---

## Mature radio

- Expanded to **5 queries per category** (was 3)
- HTTPS stream required for playable count
- Long-term target: 500–2,000 quality stations
- Naturally smaller than podcasts; weak categories may still return few streams

---

## Expected category counts (code audit estimates)

| Category | Raw/API variance | After filters | Playable proxy |
|----------|------------------|---------------|----------------|
| Dating | Medium–High | Moderate | Moderate |
| Relationships | High | Moderate–High | Moderate–High |
| Marriage | Medium | Moderate | Moderate |
| Sexual Health | Medium | Moderate | Moderate |
| Adult Psychology | Medium | Moderate | Moderate |
| After Dark | Medium | Moderate | Moderate |
| Adult Comedy | Medium | Moderate | Moderate |
| Real Stories | Medium–High | Moderate | Moderate |
| Unfiltered Interviews | Medium | Moderate | Moderate |
| Lifestyle 18+ | Medium | Moderate | Moderate |
| Adult Talk | High | Moderate–High | Moderate–High |

**Note:** Exact counts require device QA with `ENABLE_MATURE_DISCOVERY_DIAGNOSTICS=true`.

---

## Weak categories / remaining backend needs

1. **Backend mature catalog depth** — Mobile can only surface what `admin.hiddentunes.com` indexes with `includeMature=true`
2. **Episode HTTPS coverage** — Shows may index before playable enclosures are hosted
3. **Mature radio inventory** — Radio Browser has limited explicit/adult-tagged stations vs podcast volume
4. **Sexual Health / After Dark** — May remain thinner until backend ingest expands

### Fixes applied

- Broader keyword aliases (66 slots)
- 4 parallel keywords per fetch
- Secondary page + adjacent category supplement
- Playable-first ranking
- Relaxed quality floor (20) for supplements only
- Dev-only category audit logs
- Mature empty-state UX (no black redirect)
- Expanded mature radio queries

---

## Manual QA checklist

Mature ON + consent:

- [ ] Dating — many real shows, episodes play
- [ ] Relationships — many real shows
- [ ] Sexual Health — non-empty or supplemented
- [ ] After Dark — non-empty or supplemented
- [ ] Adult Comedy — non-empty
- [ ] Real Stories — non-empty
- [ ] No fake placeholders
- [ ] No dead empty sections (footer guides user)
- [ ] No heavy heat (sequential supplement, capped adjacent fetches)

---

## Files changed

- `constants/maturePodcastQueryGroups.ts`
- `constants/matureRadioQueryGroups.ts`
- `constants/matureCategoryFallbacks.ts`
- `constants/matureDiscoveryFoundation.ts`
- `services/mature/maturePodcastDiscovery.ts`
- `services/mature/matureQualityFilters.ts`
- `services/mature/matureRadioDiscovery.ts`
- `utils/matureDiscoveryDiagnostics.ts`
- `utils/devDiagnostics.ts`
- `app/podcasts/[categoryId].tsx`
- `docs/mature-content-source-audit.md`
