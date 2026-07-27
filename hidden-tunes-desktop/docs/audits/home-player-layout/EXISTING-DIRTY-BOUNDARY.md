# Existing Dirty Boundary — Catalog / Config / Pagination

**Branch:** `desktop/integrate-home-music-split`  
**HEAD:** `59c532b3fabd8c57b91712fd6313670787213c4e`  
**Rule:** Preserve exactly. Do not stage, commit, reformat, rename, delete, or overwrite.

## Category A — pre-existing dirty work (OUT OF SCOPE)

### Modified

- `hidden-tunes-desktop/electron/catalogBridge.js`
- `hidden-tunes-desktop/electron/main.js`
- `hidden-tunes-desktop/electron/preload.js`
- `hidden-tunes-desktop/src/App.tsx` *(catalog/pagination sections only — see below)*
- `hidden-tunes-desktop/src/components/music/MusicWorkspace.tsx`
- `hidden-tunes-desktop/src/lib/api.ts`
- `hidden-tunes-desktop/src/lib/catalogCache.ts`
- `hidden-tunes-desktop/src/lib/desktopCatalogBridge.ts`

### Untracked

- `hidden-tunes-desktop/electron/runtimeConfig.js`
- `hidden-tunes-desktop/scripts/verify-catalog-pagination.mjs`
- `hidden-tunes-desktop/scripts/verify-production-config.mjs`
- `hidden-tunes-desktop/src/lib/config/`
- `hidden-tunes-desktop/src/lib/musicCatalog/`

## App.tsx dirty sections (must preserve)

`git diff -- src/App.tsx` shows **+444 / −35** focused on catalog pagination and runtime config:

1. **Imports:** replace `fetchCatalogBundle` with `musicCatalog` loaders + `getDesktopRuntimeConfig`
2. **`CatalogContextValue`:** adds `configError`, `*HasMore`, `*PageLoading`, `pageError`, `loadMoreSongs|Albums|Artists`
3. **`CatalogProvider`:** runtime config gate, page state, `appendUniqueById`, `loadMore*` callbacks, bootstrap via `loadMusicCatalogBootstrap` / `loadMusicCatalogPage`
4. **`useVisibleSlice` / `ShowMoreRow` / grid components:** server pagination hooks (`hasServerMore`, `onNeedServerMore`, …)
5. **`MusicPage`:** passes pagination props into `MusicWorkspace`

### Home/player edit policy for App.tsx

Allowed surgical zones (away from CatalogProvider / pagination grids):

- `SIDEBAR_*` nav constants and `Sidebar` markup
- `SIDEBAR_NAV_GROUPS` / DEV nav sync check
- `QueueUpNextPanel` replacement or wrapper call site in `AppShell`
- `GlobalTopNav` / `HomeTopBar` wiring in `AppShell`
- `hasQueueRail` / `data-queue-expanded` so the persistent rail stays visible

**Forbidden:** rewriting CatalogProvider, removing musicCatalog imports, altering MusicPage pagination props, or “cleaning” unrelated App.tsx churn.

If a Home/player change cannot be made without risking those sections → **stop and report**.

## Isolation at commit time

- Stage only Category B (Home/player + audit docs)
- Never `git add .` / `-A` / `commit -a`
- After staging, verify cached diff excludes every Category A path
- Working tree may remain dirty afterward
