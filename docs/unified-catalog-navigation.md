# Unified Catalog Resolver + Instant Cache-First Navigation

## Overview

Hidden Tunes resolves genres, moods, and categories through one resolver and one catalog view loader. Views can paint instantly from memory, persisted storage, or hydrated catalog snapshots while API refresh runs quietly.

## Core modules

| Module | Role |
|--------|------|
| `utils/catalogResolver.ts` | Canonical genres, alias matching, targets, empty-state rules |
| `services/catalogViewPersistence.ts` | AsyncStorage view cache, compact songs, TTL, dev diagnostics |
| `services/unifiedCatalog.ts` | `loadCatalogView`, `getInstantCatalogView`, hydration |
| `utils/catalogNavigation.ts` | Prefetch + navigation (`openGenreCatalog`, `openMoodCatalog`, `openCategoryCatalog`) |

## Persistence contract

Each persisted view stores:

- `cacheKey`, `targetType`, `targetId`, `targetTitle`, `targetQuery`
- compact song objects (id, title, artist, stream URLs, artwork, genre/mood)
- `cachedAt`, `hasMore`, `fallbackUsed`, `matchedCount`, `source`

TTL:

- **Fresh** — ≤ 10 minutes (memory-first)
- **Stale** — ≤ 7 days (still paints instantly; refresh updates in background)
- **Expired** — removed from hydration

## Loading contract

1. Tab launch hydrates persisted views + catalog prewarm.
2. `getInstantCatalogView()` checks memory → persisted → catalog snapshot.
3. `loadCatalogView()` always runs resolver pipeline (cache hydrate, API, fallback scan).
4. Empty UI only when `resolveCatalogEmptyState()` says so after fallbacks complete.

## Dev logs

Filter Metro for `[HiddenTunes:catalogView]`:

- `persisted_hydrate_complete`
- `persisted_hit` / `persisted_miss`
- `refresh_complete` (with `matchedCount`, `refreshResultCount`)

## Rollback

Revert `catalogViewPersistence.ts` and the updated `unifiedCatalog.ts` / navigation / genre integration.
