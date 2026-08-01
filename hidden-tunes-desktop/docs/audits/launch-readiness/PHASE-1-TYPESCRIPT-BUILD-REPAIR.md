# PHASE-1-TYPESCRIPT-BUILD-REPAIR.md

**Date:** 2026-07-30  
**Package dir:** `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop`  
**Official command:** `npm run build` → `tsc -b && vite build`

---

## Workspace proof

| Field | Value |
| ----- | ----- |
| Disk | SanDisk Extreme Pro 55AF |
| Drive / label | D: / `llordwills` / NTFS |
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Desktop app | `...\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| Dirty-state | Prior Sports Phase 3 + audit untracked preserved; Phase 1 touched only desktop TS sources |

Gate: **PASS** — no branch switch / reset / clean / stash / commit / push / deploy.

---

## Baseline

| Metric | Value |
| ------ | ----: |
| Initial `npx tsc -b --pretty false` errors | **72** |
| Official `npm run build` | Failed at `tsc -b` (exit 2) |
| Affected project | Desktop app (`tsc -b` / Vite client) |

### Error inventory (baseline)

| Category | Error codes | Files | Count | Proposed minimal repair |
| -------- | ----------: | ----: | ----: | ----------------------- |
| Search idle `unknown` widening | TS18046 | `GlobalSearchSections.tsx` (via hook) | 56 | Type each `emptyFamily<T>()` idle in `useGlobalDesktopSearch` |
| Conflicting `Window.hiddenTunesDesktop` | TS2717, TS2339, TS2571, TS2740 | `desktopRuntimeConfig`, `desktopCatalogBridge`, `downloads/bridge` | 10 | Single ambient bridge types module |
| Unused locals | TS6133 | `App.tsx` | 5 | Remove unused icon; export retained pages; void unused props |
| NavKey contravariance | TS2322 | `App.tsx` → `GlobalSearchSections` | 1 | Narrow adapter at call site |
| `ApiSong.album` null | TS2322 | download/playlist dispatch | 2 | Use `?? ''` (album is required `string`) |

---

## Root causes fixed

1. **`emptyFamily()` without type args** → `GlobalSearchFamilyState<unknown>` collapsed search item types to `unknown` (56 errors).
2. **Triple `declare global` for `Window.hiddenTunesDesktop`** with incompatible shapes (`unknown` / partial / typed) → merge into `desktopBridgeTypes.ts`.
3. **Dead / unused App symbols** and prop destructures under `noUnusedLocals`.
4. **Function parameter contravariance** between `NavKey` and `string`.
5. **`ApiSong.album: string`** rejecting `string | null` from optional metadata.

---

## Files changed

| File | Why | Runtime preserved? |
| ---- | --- | ------------------ |
| `src/lib/search/useGlobalDesktopSearch.ts` | Typed idle families | Yes — same empty arrays |
| `src/lib/desktopBridgeTypes.ts` | **New** canonical Window bridge types | Types only |
| `src/lib/desktopCatalogBridge.ts` | Drop duplicate Window declare; safe catalog access | Yes — same bridge calls after guards |
| `src/lib/downloads/bridge.ts` | Drop duplicate Window declare; cast after runtime check | Yes |
| `src/lib/config/desktopRuntimeConfig.ts` | Drop duplicate Window declare; import types module | Yes |
| `src/lib/downloads/dispatchDownloadPlayback.ts` | `album: metaString(...) ?? ''` | Yes — empty string when missing, not invented title |
| `src/lib/playlists/dispatchPlaylistPlayback.ts` | `album: item.album ?? ''` | Yes |
| `src/App.tsx` | Remove unused `MusicNoteIcon`; export legacy pages; void unused playlist props; NavKey adapter | Yes — no playback/nav behaviour change |

**Not changed:** build script, tsconfig strictness, project references, playback owners, Electron security, dependencies.

---

## Safety proof

| Action | Done? |
| ------ | ----- |
| Branch change | No |
| reset / clean / stash | No |
| commit / push / deploy | No |
| Unrelated helper scripts / bak dirs | Preserved |
| Sports Phase 3 untracked work | Preserved |

---

## Verification

| Command | Result |
| ------- | ------ |
| `npx tsc -b --pretty false` (forced clean) | **0 errors**, exit 0 |
| `npm run build` | **PASS** — `tsc -b` + Vite production bundle |
| `npm run lint` | **31 problems (28 errors, 3 warnings)** — pre-existing; **0 hits** in Phase-1-only new modules / bridge/search/dispatch files; MusicNoteIcon unused lint removed |
| `npm run dist` | **PASS** — electron-builder packaged `release\win-unpacked` + NSIS `Hidden Tunes Desktop Setup 0.0.1.exe` |

Progress:

| Pass | Errors before | Errors after | Root cause fixed |
| ---- | ------------: | -----------: | ---------------- |
| Baseline | 72 | 72 | — |
| After search+bridge+App+album | 72 | 1 (stale unused alias) | Primary roots |
| After force clean rebuild | 1 | **0** | Stale incremental cleared |

---

## Runtime smoke

| Check | Result |
| ----- | ------ |
| Packaged exe exists | `release\win-unpacked\Hidden Tunes Desktop.exe` |
| Launch stays alive ~8s | **PASS** (PID + 3 child processes) |
| Clean stop | **PASS** |
| `npm run verify:playback-mutex` | **PASS** (8 routing assertions) |
| Interactive Home / Music / Radio / TV click-through | **Not automated** this phase — packaged shell + mutex routing verified; full UI media smoke remains a manual/follow-up check |

---

## Remaining launch blockers (out of Phase 1 scope)

- Pre-existing ESLint ~28 errors (React hooks setState-in-effect, etc.)
- Sports watch surface / fake Recently Added / CSP (later phases)
- Unsigned / `0.0.1` packaging identity (dist succeeded; signing policy unchanged)
- Large JS chunk warning (>500 kB)

---

## Phase verdict

`Phase 1 PASS — all official tsc -b errors are cleared and npm run build now succeeds without weakening the build or changing protected runtime behaviour.`
