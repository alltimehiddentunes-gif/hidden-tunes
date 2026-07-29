# Catalog Audit

## Owners

- Music Express: `src/lib/api.ts`, `src/lib/musicCatalog/*`
- Admin/multi-family bridge: `electron/catalogBridge.js`, `src/lib/desktopCatalogBridge.ts`
- Runtime config: `src/lib/config/desktopRuntimeConfig.ts`, `electron/runtimeConfig.js`
- App music UI state: `CatalogProvider` in `App.tsx`
- Display normalisation WIP: `src/lib/catalogDisplayText.ts` (**untracked**)

## Complete

- Production host allowlists (packaged) — verify-production-config PASS
- Music pagination / load-more / stale+dedupe — verify-catalog-pagination PASS
- Per-family catalog APIs for radio/podcasts/tv/sports/audiobooks/motivationals/lectures
- Abort + generation guards on key search/browse hooks

## Risks

- Dual transports (Express music vs admin IPC) can confuse debugging
- Two runtime-config copies can drift
- Legacy full catalog localStorage cache still writable alongside bounded page cache
- Untracked `catalogDisplayText` required by dirty music/home/api paths
- Catalog empty states previously blocked some Home album runtime proofs

## Verdict

Catalog plumbing is one of the stronger systems functionally; packaging allowlists look solid. Display/encoding WIP and dual-host complexity remain.
