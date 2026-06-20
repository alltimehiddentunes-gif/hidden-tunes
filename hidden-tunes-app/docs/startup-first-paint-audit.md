# Startup + First Paint Audit (Fixing Queue)

Scope: launch path only. Playback, queue, navigation UI unchanged.

## Startup task map (before)

| Task | Phase | Issue |
|------|-------|-------|
| Onboarding route check | `afterPaint` | Extra splash frame before tabs |
| Catalog memory hydrate | `afterPaint` ×2 | Duplicated in tab shell + Home |
| RNTP prewarm | `afterPaint` | Competes with first Home paint |
| Home catalog load | `runAfterInteractions` | Delayed first content |
| Home storage hydrate | `background` | Slow cache fill on cold start |
| Home API refresh | `background` | OK but ran even with warm cache |
| Player restore light | `background` | Acceptable |
| Player restore heavy | `deferred` | Acceptable |
| Runtime instrumentation | root mount | Already no-op when flag off |

## Root causes

1. **Routing gate** — AsyncStorage onboarding read blocked redirect until after first paint.
2. **Duplicate catalog hydrate** — Tab shell + root both hydrated memory cache early.
3. **Home load deferred** — `InteractionManager` delayed catalog even when memory snapshot existed.
4. **API refresh timing** — Ran at 720ms even when cached catalog already visible.

## Fixes applied

1. **`onboardingPreferences.ts`** — in-memory cache + `preloadOnboardingStatus()` + `peekOnboardingComplete()`
2. **`app/index.tsx`** — critical route check; instant redirect when cache says completed
3. **`app/_layout.tsx`** — preload onboarding + single `afterPaint` catalog hydrate
4. **`startupCoordinator.ts`** — remove duplicate hydrate; defer RNTP prewarm to `deferred`
5. **`index.tsx` (Home)** — immediate load when memory snapshot exists; `afterPaint` otherwise
6. **Home storage hydrate** — `afterPaint` (was `background`)
7. **Home API refresh** — `idle` when cache hit, `background` when miss

## Deferred

- Optimistic tabs redirect for first-time users (would flash Home briefly)
- Synchronous disk catalog read before Home render
- Defer `configureAudio` on player mount (playback risk)
