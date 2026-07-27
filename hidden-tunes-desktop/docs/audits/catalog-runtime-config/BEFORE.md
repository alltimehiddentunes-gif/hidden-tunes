# Catalog / Runtime Config — BEFORE

**Workspace:** `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration`  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD:** `4e0d56ee8f524c14707386e73e84c388b40983f4`  
**Date:** 2026-07-27

## Protected prior work

Home/player commit `4e0d56e` must remain intact. Catalog work lives as uncommitted dirty files on top of that HEAD.

## Dirty inventory (pre-audit)

### Modified (candidate Category A)
- `electron/catalogBridge.js` — admin URL from `runtimeConfig`; sports token moved to main config
- `electron/main.js` — `ht-runtime-info` sync IPC diagnostics
- `electron/preload.js` — `runtime.getInfo` allowlisted exposure
- `src/App.tsx` — CatalogProvider pagination + MusicPage props (**plus encoding noise from prior bak restore**)
- `src/components/music/MusicWorkspace.tsx` — load-more props passthrough
- `src/components/music/MusicSectionContent.tsx` — server pagination wiring
- `src/lib/api.ts` — Express base via runtime config; paged fetch helpers
- `src/lib/catalogCache.ts` — whitespace / structure cleanup; still used for legacy bundle cache
- `src/lib/desktopCatalogBridge.ts` — packaged sports-token refusal

### Untracked (candidate Category A/B)
- `electron/runtimeConfig.js`
- `src/lib/config/desktopRuntimeConfig.ts`
- `src/lib/musicCatalog/*`
- `scripts/verify-catalog-pagination.mjs`
- `scripts/verify-production-config.mjs`

### Local helpers (Category C — do not commit)
- `docs/audits/home-player-layout/_local/`
- `docs/audits/home-player-layout/smoke-console.txt`
- `scripts/_isolate-app-home-player.mjs`

## Pre-existing implementation snapshot

Already present in the working tree before this completion pass:

| Area | Owner |
|------|--------|
| Main runtime config | `electron/runtimeConfig.js` |
| Renderer runtime config | `src/lib/config/desktopRuntimeConfig.ts` |
| Music page fetch | `src/lib/musicCatalog/catalogService.ts` |
| Page cache | `src/lib/musicCatalog/pageCache.ts` |
| In-flight dedupe | `src/lib/musicCatalog/dedupe.ts` |
| CatalogProvider load-more | `App.tsx` CatalogProvider |
| Music UI windowing | `useCatalogWindow` + MusicSectionContent |

## Known gaps to close before commit

1. Cache request keys omit API origin / environment (production/dev collision risk).
2. Verify scripts pass basic checks but need broader contract assertions from the task list.
3. `App.tsx` dirty diff mixes catalog logic with encoding/noise from Home/player bak restore — must isolate for commit.
4. Confirm preload/IPC allowlist assertions in production-config verification.
5. Confirm abort is not cached as empty data; empty search not permanently cached (partially done).
