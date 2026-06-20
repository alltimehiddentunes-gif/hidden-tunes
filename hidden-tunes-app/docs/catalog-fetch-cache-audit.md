# Catalog Fetch + Cache Audit

**Scope:** Mobile catalog/network/cache only. No playback, queue, UI redesign, Desktop, CarPlay, or Android Auto changes.

**Goal:** Reduce repeated network work and make Home, Search, Explore, and Library feel instant via stale-while-revalidate caching.

---

## Findings

### Fetch entry points

| Surface | Primary calls | Issue |
|---------|---------------|-------|
| `app/_layout.tsx` | `hydrateHiddenTunesCatalogCache` on startup | Canonical hydrate — screens duplicated it |
| Home | `fetchCoordinatedCatalogFirstPage`, storage hydrate | Redundant storage hydrate after memory warm |
| Explore | hydrate + API + secondary sections | Double hydrate when memory snapshot exists |
| Search | hydrate + coordinated fetch + albums/artists/playlists | Always awaited storage even when memory ready |
| Playlists | `getHiddenTunesSongs()` **every focus** | Full catalog refetch on tab return |
| Playlist detail | `getHiddenTunesSongs()` **every focus** | Same for smart playlists |
| Artist/Album detail | Always paginated API after cache shown | Blocks warm path even when catalog fresh |

### Existing cache (kept)

- Songs memory + AsyncStorage v5 (5 min TTL)
- `catalogStorageHydratePromise` — concurrent storage dedup
- `coordinatedCatalogFirstPagePromise` / `songsFetchPromise`
- Unified catalog view cache (`unifiedCatalog.ts`, 10 min / 7d)
- Search query cache (30 min)
- Detail snapshots (7d)

### Gaps fixed

| Gap | Fix |
|-----|-----|
| No in-flight dedup for filtered `getHiddenTunesSongsPage` | URL-keyed `songsPageInflight` Map |
| Albums/playlists re-derived on every call | Memory derived cache keyed by `songsMemoryCacheTime` |
| Explore + Search parallel secondary fetches | `getHiddenTunesSecondaryCatalogSections()` coalesces in-flight work |
| Redundant hydrates on Home/Explore/Search | Skip storage hydrate when memory snapshot exists |
| Library focus refetch | Reuse `getHiddenTunesCatalogSnapshot()`; refresh user playlists only |
| Artist/album detail always awaits API | Defer API to idle when cache shown and catalog is fresh |

---

## TTL reference

| Layer | TTL |
|-------|-----|
| Global songs memory/storage | 5 min (`CACHE_MAX_AGE_MS`) |
| Background catalog refresh | 15 min minimum interval |
| Catalog view memory | 10 min fresh / 7d stale |
| Search results | 30 min |
| Artist/album snapshots | 7 days |

---

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

Manual: Home/Search/Explore first paint, Library playlists, tap-to-play, background playback, lock-screen, auto-next.
