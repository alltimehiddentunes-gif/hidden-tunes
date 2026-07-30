# TV Production Deployment — FINAL REPORT

**Date:** 2026-07-30  
**Host:** `admin.hiddentunes.com` / VPS `srv1677509` (`148.230.109.215`)  
**Branch on VPS:** `deploy/sports-private-pilot` @ `b5ebda0` (surgical file deploy; no branch switch)  
**DB:** `kojcyswxfuikxmqntwye.supabase.co`

## Pre-deploy counts (read-only)

| Metric | Count |
| ------ | ----- |
| total tv_videos | 17,795 |
| catalog_eligibility_tier=verified | 15,606 |
| catalog_eligibility_tier=search_only | 2,189 |
| Visible under legacy 7-day + verified | ~5,719–5,908 |
| Evidence-based verified (browse target) | **14,128** |
| Evidence-based any tier | 16,278 |
| Stale verified restored by removing age gate | **~8,409** |
| Hard-failure playback statuses | 1,476 |
| Quarantined | 1,381 |
| Disabled | 840 |

## Deploy method

Surgical SCP + build + `pm2 restart hidden-tunes-admin` (no unrelated dirty work; no laptop branch merge onto VPS).

### Deployed files

- `lib/tvPublicEligibilityPolicy.ts` (new)
- `lib/tvPlatformPolicy.ts` (evidence + keep production tier exports)
- `lib/tvStationHealth.ts` (soft-failure escalation)
- `app/api/tv/videos/[id]/play/route.ts` (omit missing mature columns)
- Test mock patches for `not()` typing

### Restored from VPS git HEAD (avoid laptop route drift)

- `app/api/tv/videos/route.ts`
- `app/api/tv/search/route.ts`
- `lib/tvSearch.ts`

### Backup

`/root/hidden-tunes-safety-backups/tv-evidence-20260730T174419Z`

## Post-deploy verification

- PM2 online after successful `npm run build`
- Browse returns large pages (`hasMore=true` beyond prior 7-day cliff)
- NHK / WildEarth searchable and playable
- Soft-failure canary execute: **quarantined=0**

## Rollback

1. Restore backed-up `tvPlatformPolicy.ts` / `tvStationHealth.ts` / play route  
2. `npm run build && pm2 restart hidden-tunes-admin`  
3. Visibility returns toward ~5.7–5.9k verified fresh rows  

## Canary

See `docs/audits/tv-health-failure-escalation/FINAL-REPORT.md` and `canary-execute-*.json`.

## Remaining blockers before mass health

- Separate approval required for >50 channel sweeps  
- Hyphen/country search normalize still pending on production list routes  
- Exact pagination totals still approximate on videos route  

## Commit/push

Not performed (surgical VPS deploy only; laptop dirty tree left intact; no stash/reset/branch switch).
