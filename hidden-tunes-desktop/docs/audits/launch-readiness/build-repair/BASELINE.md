# Baseline — Phase 1 build repair

**Date:** 2026-07-30  
**Workspace:** `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop`  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD (unchanged):** `3b4a91fc4bb9c4332da03096de1e051a8044ba5f`  
**SSD:** D: · `llordwills` · NTFS · ~1.81 TiB free  

## Official build command

Owner package: `hidden-tunes-desktop/package.json`

```text
"build": "tsc -b && vite build"
"dist": "npm run build && electron-builder"
```

## Why root `tsc --noEmit` was a false green

Root `tsconfig.json` has `"files": []` and only project references. Running `npx tsc --noEmit` at the package root typechecks almost nothing. The real gate is `tsc -b`, which builds:

1. `tsconfig.app.json` — `include: ["src"]` (renderer)
2. `tsconfig.node.json` — `include: ["vite.config.ts"]`

## Prior audit baseline (committed HEAD, before working-tree repair)

From `docs/audits/launch-readiness/tsc-b-output.txt` (copied as `baseline-from-prior-audit-tsc-b.txt`):

| Metric | Value |
|--------|------:|
| `tsc -b` errors | **72** |
| Distinct files | 6 |
| `npm run build` | FAIL |

### Error-code distribution (prior)

| Code | Meaning | Approx count |
|------|---------|-------------:|
| TS18046 | `unknown` property access | majority (GlobalSearchSections cascade) |
| TS6133 | declared but never used | several (App.tsx) |
| TS2717 | subsequent Window property clash | bridge modules |
| TS2339 | property does not exist on `{}` | bridge |
| TS2322 | type not assignable | NavKey callback, album nullability |
| TS2571 | object is `unknown` | bridge |
| TS2740 | missing DownloadsBridge props | bridge |

### Files (prior)

- `src/App.tsx`
- `src/components/search/GlobalSearchSections.tsx` (cascade from search hook)
- `src/lib/desktopCatalogBridge.ts`
- `src/lib/downloads/bridge.ts`
- `src/lib/downloads/dispatchDownloadPlayback.ts`
- `src/lib/playlists/dispatchPlaylistPlayback.ts`

## Phase start working tree

When this phase began, the SSD already contained uncommitted type repairs for those root causes (plus new `desktopBridgeTypes.ts`). First `tsc -b` in this phase exited **0**. Work then:

1. Verified repairs were root-cause based (not suppressions)
2. Strengthened NavKey handling with `isNavKey` guard
3. Ensured downloads bridge imports canonical ambient types
4. Ran official `npm run build` and `npm run dist`
5. Ran mutex / route-media verifies, lint boundary, Electron smoke

No commit / push / reset / clean / stash.
