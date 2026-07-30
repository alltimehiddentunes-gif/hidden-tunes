# Hidden Tunes TV — Evidence-Based Availability FINAL REPORT

**Status:** Deployed to production (surgical VPS). Soft-failure escalation deployed. Canary passed. **Stopped before mass health.**  
**Date:** 2026-07-30  
**Backend laptop HEAD:** `feature/radio-worldwide-40k` @ `70f8f95` (unchanged branch)  
**Production VPS:** `deploy/sports-private-pilot` @ `b5ebda0` + surgical TV policy/health/play files  
**Production host:** `kojcyswxfuikxmqntwye.supabase.co` / `https://admin.hiddentunes.com`

---

## Verdict (production)

Evidence-based visibility is live. Stale timestamps no longer hide previously verified **browse** channels.

### Important production nuance: catalog tiers

Production browse uses `catalog_eligibility_tier = verified` (pre-existing).

| Metric | Count |
| ------ | ----- |
| Legacy 7-day + verified visible | ~5,719–5,908 |
| Evidence-based **verified** (browse) | **14,128** |
| Restored into browse | **~8,409** |
| Evidence-based any tier (includes search_only) | 16,278 |
| search_only rows (not in browse by design) | 2,189 |

The earlier “10,370 / 16,278” projection mixed tiers. Browse restoration is **~8.4k** previously verified rows that were age-hidden inside the verified tier. `search_only` remains discovery-only.

## Old freshness filter (removed from public eligibility)

```ts
.gte("last_health_checked_at", nowMinus7Days)
```

Replaced with:

```ts
.not("last_health_checked_at", "is", null) // prior verification required
// + catalog_eligibility_tier = verified for browse
```

Age → `needs_revalidation` only.

## Soft-failure escalation

Deployed in `applyTvHealthProbe`. Canary execute: **0 quarantines** from isolated soft failures.

## Search / play samples

NHK, WildEarth, Al Jazeera (space), News, ZA, Ghana, Germany, Russia, China, Korea: hits.  
Al-Jazeera (hyphen) and South Africa (name): still need production search-normalize deploy.

NHK/WildEarth play: success with stream URLs.

## Reports

- `docs/audits/tv-health-failure-escalation/FINAL-REPORT.md`
- `docs/audits/tv-search-playback-unification/FINAL-REPORT.md`
- `docs/audits/tv-production-deployment/FINAL-REPORT.md`

## Stop

No mass health sweep. Await approval for larger bounded revalidation.
