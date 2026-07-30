# TV Search / Playback Unification — FINAL REPORT

**Date:** 2026-07-30

## Authority

All public browse/play filters share `applyTvPublicCatalogFilters` / `isTvStationEligibleForPlatform` → evidence policy (no 7-day age gate).

Production browse also requires `catalog_eligibility_tier = verified` (pre-existing production model).

## Post-deploy search samples (`/api/tv/videos?q=`)

| Query | Result |
| ----- | ------ |
| News | hits (CBS News, Sky News Arabia, …) |
| NHK | restored hits + play OK |
| Al Jazeera | hits |
| Al-Jazeera | **0** (hyphen normalize not on production videos route yet) |
| South Africa | **0** (country-name→ISO not on production videos route) |
| ZA | hits (includes WildEarth) |
| WildEarth | hits + play OK |
| Ghana / Germany / Russia / China / Korea | hits |

## Playback

- NHK `ec998983-…` → `success=true` stream URL returned  
- WildEarth `16342949-…` → `success=true` stream URL returned  
- Play route fixed to omit missing `is_mature` columns when mature isolation is off

## Remaining blockers

1. Deploy `tvPublicSearchQuery` hyphen + country alias into production `videos`/`search` routes (laptop has it; VPS kept HEAD browse/search to avoid unrelated drift).
2. Pagination `total` field on production videos route is approximate (`page*limit+1` style) — pre-existing hasMore design.

## Verifier

`npm run verify:tv-search-playback-unification`
