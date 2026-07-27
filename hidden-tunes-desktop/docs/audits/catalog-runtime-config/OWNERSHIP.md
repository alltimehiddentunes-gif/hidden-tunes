# Catalog / Runtime Config — OWNERSHIP

## Runtime configuration

| Concern | Owner |
|---------|--------|
| Main-process URL resolution | `electron/runtimeConfig.js` → `resolveMainRuntimeConfig` |
| Sports private pilot token | Main only: `resolveSportsPilotToken` (never in renderer config) |
| Renderer-safe config | `src/lib/config/desktopRuntimeConfig.ts` → `getDesktopRuntimeConfig` |
| Packaged diagnostics bridge | preload `runtime.getInfo` → IPC `ht-runtime-info` |
| Express music base URL | Renderer: `getExpressCatalogBaseUrlOrThrow` / `getApiBaseUrl` |
| Admin multi-family base URL | Main catalogBridge: `resolveCatalogBaseUrl` |

### Env keys (public)

- `VITE_EXPRESS_CATALOG_API_URL` / `HT_EXPRESS_CATALOG_API_URL` (main)
- `VITE_CATALOG_ADMIN_API_URL` / `HT_CATALOG_ADMIN_API_URL`
- Supabase public URL/anon (renderer; service-role rejected)

### Localhost policy

- Development: localhost HTTPS allowed if explicitly configured; defaults use Render/admin hosts
- Packaged production: localhost **forbidden**; Express host must be allowlisted

## Catalog request path

1. Renderer `api.ts` / `musicCatalog` → HTTPS Express API (music songs/albums/artists)
2. Renderer `desktopCatalogBridge` → preload `catalog.getJson` / `requestJson` → main `catalogBridge` → allowlisted admin HTTPS host

## Pagination

| Concern | Owner |
|---------|--------|
| Page size clamp | `clampCatalogPageSize` |
| Request key | `buildMusicCatalogRequestKey` (+ origin after completion) |
| hasMore | `inferHasMore` |
| First-page bootstrap | `loadMusicCatalogBootstrap` |
| Append + dedupe by id | `CatalogProvider.appendUniqueById` in App.tsx |
| Load-more concurrency | per-resource `*LoadGuard` refs |
| UI window | `useCatalogWindow` |

## Cache

| Concern | Owner |
|---------|--------|
| Per-page cache | `musicCatalog/pageCache.ts` |
| Legacy bundle cache | `catalogCache.ts` (still used for CatalogProvider display cache) |
| In-flight dedupe | `dedupeAsync` |
| Abort | DOMException AbortError → `CatalogRequestError('abort')`; not treated as empty success |

## Must not change

- `DesktopPlaybackProvider` / persistent player / Home hierarchy / sidebar groups
- TV/Sports video ownership
- Unrestricted preload surface (keep allowlisted only)
