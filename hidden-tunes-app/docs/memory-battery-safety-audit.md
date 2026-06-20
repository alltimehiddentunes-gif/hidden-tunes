# Memory + Battery Safety Audit

**Scope:** Mobile memory pressure, battery drain, and heat reduction only. No new features, UI redesign, playback logic, queue behavior, Desktop, CarPlay, or Android Auto changes.

**Goal:** Reduce memory pressure, battery drain, and heat while preserving everything working.

---

## Findings

| Area | Issue | Severity |
|------|-------|----------|
| Home `featuredSongs` | Grew unbounded via pagination into React state | High |
| Explore `cloudSongs` | Same unbounded pagination pattern | High |
| Search | `fullCatalogSongs` duplicated global catalog snapshot in state | High |
| Search async loaders | `loadCloudDiscovery` / secondary fetches set state after unmount | High |
| Search fuzzy path | `InteractionManager.runAfterInteractions` not cancelled on unmount | Medium |
| Search history | AsyncStorage write on every network search | Medium |
| Search results cache | Immediate AsyncStorage write per successful waterfall | Medium |
| Image preloader | Session `loadedImages` Set unbounded | Medium |
| Unified catalog | In-memory `viewCache` Map unbounded | Medium |
| Home / Explore API refresh | Async refresh could set state after leaving screen | Medium |

### Deferred (out of scope — playback / large refactors)

- `PlayerContext` HiddenAudio poll, RNTP intervals, queue persist semantics
- Home/Explore nested horizontal lists virtualization (artwork audit scope)
- Explore full header virtualization (structural refactor)

### Already addressed (prior queues)

- PlayerContext position/queue persist debounce (heat audit)
- Catalog fetch dedup + snapshot reuse (catalog cache audit)
- HTImage slot sizing + fast-scroll deferral (artwork audit)

---

## Fixes applied

| File | Change |
|------|--------|
| `utils/screenCatalogLimits.ts` | `MAX_SCREEN_CATALOG_SONGS` (240) cap helper for screen-local arrays |
| `app/(tabs)/index.tsx` | Cap `featuredSongs`; mounted guard on async hydrate/API/pagination |
| `app/(tabs)/explore.tsx` | Cap `cloudSongs`; mounted guard on load/secondary sections/pagination |
| `app/(tabs)/search.tsx` | Drop `fullCatalogSongs` state (read snapshot in memo); mounted guards; debounced search history writes; cancel fuzzy InteractionManager; clear deferred fuzzy on blur; slice catalog for album/artist derivation |
| `utils/imagePreloader.ts` | Cap session prefetch URL set at 512 (FIFO eviction) |
| `utils/searchQueryCache.ts` | Debounce AsyncStorage writes (1.5s) — memory cache still immediate |
| `services/unifiedCatalog.ts` | Trim in-memory view cache to 28 entries |

---

## Validation

```bash
npm run lint
npm run typecheck
npx expo config --type introspect --json
```

**Manual:** Home/Search/Library work; tap-to-play, MiniPlayer, background playback, lockscreen, auto-next unchanged; less heat during browsing.
