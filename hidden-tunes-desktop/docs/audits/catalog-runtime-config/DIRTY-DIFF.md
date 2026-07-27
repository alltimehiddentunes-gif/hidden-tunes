# Dirty Diff Classification

**HEAD:** `4e0d56e`  
**Rule:** Commit only Category A + B. Exclude C/D.

## Category A — catalog/runtime production change

| Path | Notes |
|------|--------|
| `electron/runtimeConfig.js` | New main config |
| `electron/catalogBridge.js` | Uses runtimeConfig; host checks |
| `electron/main.js` | `ht-runtime-info` |
| `electron/preload.js` | `runtime.getInfo` |
| `src/lib/config/desktopRuntimeConfig.ts` | Renderer config |
| `src/lib/musicCatalog/*` | Pagination service/cache/dedupe |
| `src/lib/api.ts` | Express base + paged fetches |
| `src/lib/catalogCache.ts` | Trailing whitespace / structure cleanup |
| `src/lib/desktopCatalogBridge.ts` | Packaged sports token refusal |
| `src/components/music/MusicWorkspace.tsx` | Pagination props |
| `src/components/music/MusicSectionContent.tsx` | Load-more UI |
| `src/App.tsx` | **CatalogProvider + MusicPage + grid pagination only** |

### App.tsx catalog hunks (must keep)

- musicCatalog / desktopRuntimeConfig imports
- CatalogContextValue pagination fields
- CatalogProvider: config gate, page state, `loadMore*`, bootstrap via `loadMusicCatalogBootstrap`
- `useVisibleSlice` / `ShowMoreRow` / Api*Grid server-more hooks
- MusicPage pagination prop passthrough
- DiscoverPage remote song search via `searchMusicSongsPage` (if present)

### App.tsx must NOT alter (protected from 4e0d56e)

- Sidebar group structure
- `DesktopPersistentPlayer` wiring
- compact `GlobalTopNav`
- `hasQueueRail = true`
- TV right-rail swap
- Home hierarchy components themselves

### App.tsx noise to scrub before commit

Encoding/mojibake churn in placeholders and copy (from prior bak restore) that is unrelated to catalog — restore those lines to HEAD where they are not catalog logic.

## Category B — verification/docs

| Path | Notes |
|------|--------|
| `scripts/verify-catalog-pagination.mjs` | Strengthen to full contract |
| `scripts/verify-production-config.mjs` | Strengthen to full contract |
| `docs/audits/catalog-runtime-config/*` | This audit set |

## Category C — local helpers (exclude)

| Path | Why |
|------|-----|
| `docs/audits/home-player-layout/_local/` | Isolation backups |
| `docs/audits/home-player-layout/smoke-console.txt` | Local smoke log |
| `scripts/_isolate-app-home-player.mjs` | One-off isolation tool |

## Category D — unrelated

None expected beyond C. If any Home/player redesign appears, stop.
