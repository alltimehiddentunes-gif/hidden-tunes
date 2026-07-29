# SPORTS Audit (Desktop only)

**Owner:** `DesktopSportsPage.tsx` + `dispatchSportsPlayback` / sports catalog APIs  
**Status:** Partially complete · **45%** · structurally incomplete  

> **Desktop Sports ≠ mobile Sports.** Mobile Sports issues are tracked separately and do **not** change this desktop score. CarPlay is mobile-only and out of scope.

## Classification

**fixture-only / watch-UX broken — not production ready · unsafe to market as watchable sports**

| Check | Result |
|-------|--------|
| Feature flag / enabled | API `enabled`; shows “Sports unavailable” when false |
| Fixtures browse | Real live/upcoming/completed lists |
| Fake scores / watch | Play button only if `isPlayable` — no fake watch CTA |
| Streams | HTTPS resolve path exists when playable |
| Video ownership | Uses shared video service, but **`resolveActivePlayerSurface` is TV-only**; Sports does **not** `mountTvVideo` |
| Visible picture | Video can park in clipped 1×1 parking node — **play without visible surface** |
| Notifications / full providers | Not a complete desktop sports product |
| Favourites | Library sports unsupported |

## Verdict

Honest fixture browsing exists. **Watch experience is not production-ready.** Do not enable as a streaming sports product until a visible Sports/TV-shared surface mounts for sports sessions.
