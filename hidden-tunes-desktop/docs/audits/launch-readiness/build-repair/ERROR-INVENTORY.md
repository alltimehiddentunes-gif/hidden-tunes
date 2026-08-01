# Error inventory (prior 72 → 0)

Source: prior-audit `tsc-b` log at HEAD `3b4a91f` before working-tree repairs.

## Root-cause clusters

| Group | Description | Errors caused | Authoritative owner | Safest repair | Runtime area | Risk |
|-------|-------------|--------------:|---------------------|---------------|--------------|------|
| A | Duplicate / conflicting `Window.hiddenTunesDesktop` ambient declarations (`catalog?: unknown` vs typed downloads) | ~10+ | Single bridge ambient | One `desktopBridgeTypes.ts` declaration; remove duplicates | Electron preload bridge | Low if API surface unchanged |
| B | `emptyFamily()` without type param → `unknown[]` → GlobalSearchSections property errors | ~50+ | `useGlobalDesktopSearch` | `emptyFamily<T>()` for idle views | Search | Low |
| C | `ApiSong.album` is `string`; consumers passed `string \| null` | 2 | `ApiSong` in `api.ts` | `?? ''` at boundary | Downloads / Playlists playback mapping | Low |
| D | Unused locals (`MusicNoteIcon`, unused page components, unused props) with `noUnusedLocals` | ~5 | `App.tsx` | Remove dead icon; export retained pages; void unused props | Shell | Low |
| E | `(navKey: NavKey) => void` not assignable to `(navKey: string) => void` | 1 | `NavKey` + `GlobalSearchSections` | Guarded narrow via `isNavKey` | Search navigation | Low |

## Category table (summary)

| Category | Files | Count (approx) |
|----------|-------|---------------:|
| incorrect callback signature | App.tsx | 1 |
| optional/undefined / nullability | dispatch*Playback | 2 |
| duplicate type / Window clash | catalog + downloads + runtime config | ~10 |
| unknown cascade | GlobalSearchSections via search hook | ~50 |
| unused locals | App.tsx | ~5 |
| IPC/preload typing | bridge modules | (subset of clash) |

Full line-level prior log: `baseline-from-prior-audit-tsc-b.txt`.
