# Production Change Plan (AWAITING APPROVAL)

## A. Code deploy (safe, reversible)

Deploy laptop admin TV search unification:

- `lib/tvPublicSearchQuery.ts`
- `lib/tvSearch.ts`
- `app/api/tv/videos/route.ts`
- `app/api/tv/search/route.ts`

Smoke: `Al-Jazeera`, `South Africa`, `News` totals, play routes unchanged.

## B. Health revalidation (separate approval)

Target: playable-but-stale rows (≈10 370), prioritized:

1. Official public broadcasters (e.g. NHK World `*.nhkworld.jp`)
2. Already-favourite / recently watched ids (from device export)
3. Do **not** bulk-enable Shahid/Warner/paid bouquets without rights review

Dry-run → backup → bounded batch → monitor.

**Do not insert duplicate channels for these ids.**

## C. Not approved

- Weakening 7-day freshness globally without product sign-off
- Mass IPTV import
- Quarantine removal for DSTV
- Inventing SuperSport free feeds
- Multi-source player rewrite

## Rollback

- Redeploy previous admin build
- Health job: non-destructive timestamps; re-quarantine failures
