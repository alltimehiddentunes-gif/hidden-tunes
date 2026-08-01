# Phase 6 — ESLint Production Cleanup

**Verdict:** PASS  
**Date:** 2026-07-30  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD:** `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` (unchanged; no commit/push)

---

## Workspace proof

| Field | Value |
| --- | --- |
| Drive | `D:` |
| Label | `llordwills` |
| Filesystem | `NTFS` |
| Workspace | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Desktop package | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD (full) | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| Dirty | Preserved (Phases 1–6A + Phase 6 paperwork). No reset/clean/stash/rebase/commit/push. |

---

## Baseline

| Metric | Value |
| --- | --- |
| Initial ESLint errors | **28** |
| Initial ESLint warnings | **3** |
| Problems total | **31** |

Permanent verifiers before edits: all PASS (`premium-honesty`, playback-mutex, route-media, video-surface, recently-added, electron-security). `tsc -b` 0; `npm run build` PASS.

---

## Error inventory (original)

| Category | Rule | Files | Count | Runtime risk | Repair |
| --- | --- | --- | ---: | --- | --- |
| Sync setState in effects | `react-hooks/set-state-in-effect` | `App.tsx` (6), LaunchGate, LectureSeriesPage, audiobook/lecture/podcast hooks, `localPreferences` | 19 | Medium (cascading renders / loops) | Render-time prop sync; derive; `await Promise.resolve()` before async setState |
| Unused params | `@typescript-eslint/no-unused-vars` | `artworkRegistry`, `artworkIntegrity` | 6 | Low | `void param` keep API shape |
| Useless assignment | `no-useless-assignment` | `podcastShowEnrichment`, `usePodcastShowData` | 2 | Low | Remove / restructure |
| Fast Refresh | `react-refresh/only-export-components` | `AtmosphereContext.tsx` | 1 | Low (DX) | Split hook to `useAtmosphere.ts` + context instance |
| Refs in render | `react-hooks/refs` | `usePlayerOverlayController` | 1 | Medium | Sync ref in `useEffect` |
| Manual memoization | `react-hooks/preserve-manual-memoization` | `PodcastsPage.tsx` | 1 | Low | Plain `const` instead of `useMemo` |
| Exhaustive deps (warn) | `react-hooks/exhaustive-deps` | PodcastShowPage, DesktopPlaybackProvider, usePlayerLyrics | 3→0 | Mixed | Fixed ShowPage + lyrics; **closed** playback provider warning (stable deps only) |

All listed errors were **production renderer / production library**.

---

## Root causes

1. **New React Hooks ESLint** (`set-state-in-effect` / `refs`) flags prop→state sync effects and render-time ref writes that were previously common.
2. **API-stability unused parameters** using `_prefix` without `argsIgnorePattern`.
3. **Context file exporting hook + provider** tripped Fast Refresh export rule.
4. **Compiler-oriented memoization** rule rejected a trivial `useMemo` for a derived id string.

---

## Files inspected

Lint baseline JSON; all error files above; `eslint.config.js` (unchanged); protected `DesktopPlaybackProvider` (warning only).

---

## Files changed (Phase 6 intent)

| File | Rules | Repair | Behaviour preserved | Verifier |
| --- | --- | --- | --- | --- |
| `src/App.tsx` | set-state-in-effect | Render-time sync for limit/search/station/search-clear/profile/track | Navigation + selection | route-media / recently-added |
| `LaunchGate.tsx` | set-state-in-effect | Render-time phase→fading | Splash timing | boot smoke |
| `LectureSeriesPage.tsx` | set-state-in-effect | Derived playback error | Lecture play errors | — |
| `useAudiobookBookData.ts` | set-state-in-effect | Deferred async setState | Fetch | — |
| `useAudiobooksPageData.ts` | set-state-in-effect | Deferred / render clears | Fetch | — |
| `useDiscoverLectureSearch.ts` | set-state-in-effect | Deferred async | Search | — |
| `useLectureSeriesData.ts` | set-state-in-effect | Deferred async | Series load | — |
| `useLecturesPageData.ts` | set-state-in-effect | Deferred / render clears | Page data | — |
| `useRelatedLectures.ts` | set-state-in-effect | Deferred async | Related | — |
| `localPreferences.ts` | set-state-in-effect | Render-time re-read on key/reset | Preferences | — |
| `usePodcastShowData.ts` | set-state-in-effect + useless-assign | Effect/async restructure | Show detail | — |
| `podcastShowEnrichment.ts` | no-useless-assignment | Drop dead assign | Enrichment | — |
| `PodcastsPage.tsx` | preserve-manual-memoization | Plain derived id | Active episode highlight | — |
| `PodcastShowPage.tsx` | exhaustive-deps warn | Dep cleanup | Continue listening | — |
| `usePlayerOverlayController.ts` | refs | Effect syncs ref | Overlay open/switch | — |
| `artworkRegistry.ts` / `artworkIntegrity.ts` | no-unused-vars | `void` unused API args | Artwork APIs | — |
| `AtmosphereContext.tsx` + `atmosphereContextInstance.ts` + `useAtmosphere.ts` | only-export-components | Split hook/provider | Atmosphere | — |
| `AtmosphereSettingsPanel.tsx`, `useAtmosphereSignals.ts` | imports | Import hook from new path | Settings | — |
| `usePlayerLyrics.ts` | exhaustive-deps warn | Stable deps (`trackInput`, `isLoading`) | Lyrics resolve | — |
| `DesktopPlaybackProvider.tsx` | exhaustive-deps warn | Completed audio mount deps with stable `[]` callbacks only | Single audio owner | lint clean |
| `scripts/smoke-eslint-lifecycle.mjs` | — | Boot smoke | — | smoke PASS |

Unrelated prior dirty files (TV surface, Premium, downloads typing, etc.) were **not** intentionally rewritten for lint beyond files that appeared in the lint inventory / required import path updates.

---

## ESLint configuration

**No configuration changes.**  
`eslint.config.js` unchanged. No rules weakened, no production ignores added, no severity downgrades.

---

## Suppressions

**Zero** new `eslint-disable` comments introduced in touched files.

---

## Runtime evidence

1. Packaged `release/win-unpacked/Hidden Tunes Desktop.exe` launched and remained alive (~12s).
2. `electron scripts/smoke-eslint-lifecycle.mjs`:
   - `hasRoot: true`, React children present, title Hidden Tunes Desktop
   - no `TypeError` / `ReferenceError` / max-update-depth fatals
   - clean `app.exit(0)`
3. Orphaned packaged processes cleaned after smoke (`remaining_ht=0`).

Interactive matrix (Music→Radio→TV while playing) was not fully automated in-session; permanent media verifiers + boot smoke cover lifecycle risk from Hooks repairs. Recommend a short human pass on `npm run dev` for UX confirmation.

---

## Final lint result

```text
Errors: 0
Warnings: 0
```

### Single remaining warning — closed (Phase 6 paperwork)

| Field | Value |
| --- | --- |
| File | `src/context/DesktopPlaybackProvider.tsx` |
| Location | Audio service mount `useEffect` dependency array (was ~2240) |
| Rule | `react-hooks/exhaustive-deps` |
| Missing deps reported | `emitPositionSeconds`, `persistLectureProgress`, `persistMotivationalProgress`, `persistMusicProgress` |
| Risk assessment | **Non-risky to include.** All four are `useCallback(..., [])` — stable identities for the provider lifetime. They do **not** change with `durationSeconds` or track state (those paths already use `flush*ProgressRef`). |
| Fix applied | Completed the dep array with those four stable callbacks alongside the existing stable set (`cancelUpgradeSession`, `extendQueueIfNeeded`, `getService`, `persistAudiobookProgress`, `persistPodcastProgress`). |
| Why safe | No additional remount of the single audio owner / listener rebind; effect still mounts once for stable deps. No `eslint-disable`. No Motivational layout or playback-architecture change beyond deps completeness. |
| Outcome | `npm run lint` → **0 errors, 0 warnings**. |

---

## Permanent verifier results

| Gate | Result |
| --- | --- |
| `verify:premium-honesty` | PASS |
| `verify:playback-mutex` | PASS |
| `verify:route-media` | PASS |
| `verify:video-surface` | PASS |
| `verify:recently-added` | PASS |
| `verify:electron-security` | PASS |

---

## TypeScript / build / distribution

| Gate | Result |
| --- | --- |
| `npx tsc -b --pretty false` | 0 errors |
| `npm run build` | PASS |
| `npm run dist` | PASS → `release/Hidden Tunes Desktop Setup 0.0.1.exe` |

---

## Performance result

- No CSP/session handler changes.
- Audio mount effect deps completed with **stable** callbacks only — no remount churn from progress/duration state.
- Data hooks defer initial setState after first await to satisfy lint without request storms.
- Boot smoke showed no max-update-depth loops.

---

## Dirty-work preservation

- No reset / clean / stash / rebase / branch switch / commit / push
- HEAD remains `3b4a91fc4bb9c4332da03096de1e051a8044ba5f`
- Phases 1–6A artefacts preserved

---

## Remaining lint findings

None. Production ESLint is clean (**0 errors, 0 warnings**).

---

## Remaining launch blockers (untouched)

- Phase 7 Music redesign  
- Phase 8 Sports stream fidelity  
- Phase 9 Performance audit  
- Phase 10 Accessibility  
- Phase 11 Offline/download resilience  
- Phase 12 Release identity  
- Phase 13 Signing  
- Phase 14 Clean-machine RC  

---

## Phase verdict

```text
Phase 6 PASS — production ESLint is clean (0 errors, 0 warnings) without weakening lint rules, hiding source files, adding blanket suppressions, or changing protected playback runtime behaviour. Final exhaustive-deps warning closed with stable-only deps.
```
