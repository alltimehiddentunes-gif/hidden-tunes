# TV Health Failure Escalation — FINAL REPORT

**Date:** 2026-07-30  
**Status:** Implemented, deployed to production VPS, canary verified.

## Old behaviour

`applyTvHealthProbe` quarantined a previously verified channel on the **first** failed probe (`is_active=false`, `quarantined_at=now`).

## New behaviour

| Kind | Previously verified | Action |
| ---- | ------------------- | ------ |
| Soft (timeout/DNS/5xx/soft_skip/…) | failures 1–3 | Remain `playable`, visible, record error, increment `consecutive_failures` |
| Soft | failures ≥ 4 | Temporarily unavailable (hide) |
| Hard technical (404/410) | failures 1 | Remain visible pending confirmation |
| Hard technical | failures ≥ 2 | Hide |
| Hard immediate (DRM/login/legal/blocked) | any | Immediate quarantine |
| Same-run retry (`independentFailureIncrement: 0`) | any | No escalation |
| Success | any | Reset streak, clear quarantine fields |
| Never-verified failed probe | — | Stay non-public / quarantine |

## Files

- `lib/tvStationHealth.ts` — `classifyTvHealthFailureKind`, escalated `applyTvHealthProbe`
- `scripts/verify-tv-health-failure-escalation.ts`
- `scripts/test-tv-station-health.ts`
- `npm run verify:tv-health-failure-escalation`

## Canary (execute)

```text
selected=36 successful=33 softFailed=3 hardFailed=0
remainedVisible=36 becameDegraded=3 quarantined=0 unexpectedMutations=0
```

**Isolated soft-failure quarantine count: 0**

## Stop

No mass health sweep authorized. Await separate approval for larger bounded runs.
