# Mobile Performance Audit & Fix Log

Scope: `hidden-tunes-app` only. No playback engine, CarPlay, Android Auto, or Desktop changes.

## Queue 1 — Heat causes

| Severity | Finding | Fix status |
|----------|---------|------------|
| **High** | `NeonEQ` layout animations (`useNativeDriver: false`) in list rows | **Fixed** — static bars when not playing |
| **High** | Overlapping catalog hydrate at launch (tab shell + home + explore + search) | **Partial** — search defers until tab focus; fresh-cache early return |
| **High** | Search triple pipeline (instant + fuzzy + network) | **Partial** — skip network when instant satisfies query |
| **Medium** | MiniPlayer YouTube poll every 9s | **Fixed** — poll only when `!currentSong` |
| **Medium** | Home hero auto-slide 7s interval | Already gated via `useFocusEffect` |
| **Medium** | Home hero glow loop | Already stops on tab blur via `useFocusEffect` |
| **Low** | Production `console.log` in API/smartQueue error paths | **Fixed** — `__DEV__` gated |
| **Skip** | PlayerContext status polling (1–2s) | Playback-critical — do not touch |

## Queue 2 — Scroll lag

| Severity | Finding | Fix status |
|----------|---------|------------|
| **High** | Home/Explore broad `usePlayerState()` re-renders | **Deferred** — needs selector split |
| **High** | Explore mega-header (no vertical virtualization) | **Deferred** — restructure scope |
| **High** | Nested horizontal FlatLists on Home | **Partial** — mood-rooms rail perf tuning |
| **Medium** | `NeonEQ` in rows while playing | **Fixed** — idle rows static |
| **Medium** | Favorites raw `Image` | **Fixed** — `HTImage` |
| **Low** | Other screens still on raw `Image` | **Deferred** |

## Queue 3 — Startup delay

| Severity | Finding | Fix status |
|----------|---------|------------|
| **High** | Search `loadCloudDiscovery` on mount duplicates Home work | **Fixed** — first focus only + fresh cache skip |
| **High** | Onboarding gate before tabs | **Deferred** — routing change |
| **Medium** | Tab shell + Home parallel catalog fetch | **Partial** — coordinated fetch dedupes API |
| **Skip** | RNTP prewarm on tab shell | Low risk to move; defer |

## Queue 4 — Search reliability

| Severity | Finding | Fix status |
|----------|---------|------------|
| **High** | Provider names in filter chips / row badges | **Fixed** — CATALOG/TV/MORE/VAULT; labels map to Hidden Tunes |
| **High** | `source=all` triple network fan-out | **Partial** — instant-hit skip; full waterfall deferred |
| **Medium** | 2-char query blank state (no empty message) | **Fixed** — empty when instant has no hits |
| **Medium** | Redundant catalog refetch after cache hydrate | **Fixed** — early return on fresh cache |

## Safe fixes applied

1. `NeonEQ` — static bars when not playing
2. Search — coordinated catalog; skip refetch on fresh cache
3. Search — skip debounced network when instant grouped results satisfy query (`all`/`hidden`)
4. Search — defer cloud discovery until Search tab first focus
5. Search — 2-char empty state; user-facing source labels (no provider names)
6. Home — horizontal list tuning on mood-rooms rail
7. `MiniPlayer` — YouTube poll only when no Hidden Tunes track active
8. Favorites — `HTImage` for cached artwork
9. `hiddenTunesApi` / `smartQueue` — dev-only error logging
10. `package.json` — `typecheck` script

## Deferred (higher scope / playback risk)

- Explore screen virtualization
- Narrow `usePlayerState` on Home/Explore
- Search filter chip debounce unification
- Thumbnail URL sizing for Audius 1000×1000 in rows
- Single catalog hydration owner across all tabs
