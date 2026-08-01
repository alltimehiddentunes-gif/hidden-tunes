# Phase 6A — Motivational Video Layout Repair

**Verdict:** PASS  
**Date:** 2026-07-30  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD:** `3b4a91fc4bb9c4332da03096de1e051a8044ba5f`

---

## Workspace proof

| Field | Value |
| --- | --- |
| Drive | `D:` |
| Label | `llordwills` |
| Filesystem | `NTFS` |
| Workspace | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Package | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| Dirty | Preserved (Phases 1–6 + this repair). No reset/clean/stash/rebase/commit/push. |

---

## Root cause

After Phase 2, Motivational **video** correctly reused the shared TV video owner (`TvNowPlayingPanel` / `TvVideoSurface`), but it also reused the **TV right-rail cinema shell**.

That shell:

- forced the player into the narrow `--active-player-width` column **or** stretched awkwardly under `height: 100%` rail rules
- treated Motivational talking-head / low-res sources like live TV
- did not provide a bounded main-content 16:9 card with `object-fit: contain` and max-height caps

TV and Motivational must share ownership, not identical presentation dimensions.

---

## Files inspected

- `TvNowPlayingPanel.tsx`, `TvVideoSurface.tsx`
- `resolveActivePlayerSurface.ts`
- `App.tsx` (conditional player rail / main composition)
- `App.css` (`.tv-rail`, `.tv-video-surface*`, `.conditional-player-rail`, `.ht-tv-video-element`)
- Motivational adapters / playback path
- `HtmlVideoPlaybackService.ts` (single owner remains)

---

## Files changed

| File | Change |
| --- | --- |
| `src/lib/player/resolveVideoSurfaceLayout.ts` | **Added** `tv-cinema` / `sports-wide` / `motivational-contained` |
| `src/App.tsx` | Motivational stage in main scroll; suppress right rail for contained layout; `data-video-layout` on shell |
| `src/components/tv/TvNowPlayingPanel.tsx` | `videoLayout` prop + `data-video-layout` |
| `src/components/tv/TvVideoSurface.tsx` | Propagate `data-video-layout` |
| `src/App.css` | Bounded Motivational card CSS; Sports max-height; fullscreen-only expand rules; single-column grid for contained |
| `scripts/verify-motivational-video-layout.mjs` | Focused verifier |
| `scripts/test-route-independent-media.mjs` | Allow Motivational stage + rail gating |
| `package.json` | `verify:motivational-video-layout` |
| `docs/audits/.../motivational-video-layout/*` | Report + screenshots folder |

---

## Layout rules before

- All `requiresVideoSurface` tracks → right rail `TvNowPlayingPanel`
- Grid always added `--active-player-width` column when media active
- Mount `aspect-ratio: 16/9` inside a tall `height: 100%` rail child
- No Motivational-specific max-height / contain presentation

## Layout rules after

| Family | Layout | Placement |
| --- | --- | --- |
| TV | `tv-cinema` | Right rail (unchanged ownership) |
| Sports | `sports-wide` | Right rail with max-height cap + contain |
| Motivational video | `motivational-contained` | **Main-stage** bounded card; right rail suppressed |
| Motivational audio | `none` | Audio path only — no video card |

Motivational defaults:

- `aspect-ratio: 16 / 9`
- `max-width: min(1180px, 100%)` inside a `1280px` stage
- `max-height: min(72vh, calc(100dvh - footer - chrome))`
- `object-fit: contain` on video + poster
- `border-radius: 20px`, dark letterbox background
- Fullscreen styles only under `:fullscreen`

---

## Motivational video result

- Plays through the **same** `acquireTvVideoPlaybackService()` owner
- Appears as a centered premium card in main content
- Does not occupy the full page by default
- Aspect ratio preserved via contain
- Footer remains available outside fullscreen

## TV regression result

- Still uses right-rail `tv-cinema`
- Shared owner unchanged
- `verify:video-surface` / route-media / mutex PASS

## Sports regression result

- Still uses shared video rail with `sports-wide` height cap
- `object-fit: contain` enforced for sports surface
- Verifiers PASS

## Motivational audio result

- `isMotivationalVideoSong` false → `requiresVideoSurface` false → no stage / no video card
- Mutex verifier confirms audio path

## Fullscreen result

- Still only via explicit toolbar fullscreen control (`requestFullscreen` on surface)
- CSS `:fullscreen` lifts max-height; exit returns to bounded CSS

## Responsive test matrix

| Size | Expectation (CSS) |
| --- | --- |
| 1280×720 | `max-height` media query tightens to ~58vh; stage padded; no fixed inset-0 |
| 1366×768 / 1440×900 / 1920×1080 / 2560×1440 | Stage max 1280px centered; 16:9 contain; single-column grid |

Automated pixel screenshots of live streams were not captured here (see `screenshots/README.md`). Structural + verifier proof is complete.

## Screenshots

Folder: `docs/audits/launch-readiness/motivational-video-layout/screenshots/`  
Manual capture checklist recorded in `screenshots/README.md`.

## Shared-owner proof

- Single `TvVideoSurface` → `acquireTvVideoPlaybackService().mount(...)`
- No second `<video>` element introduced
- Motivational stage reuses `TvNowPlayingPanel` / `TvVideoSurface`

## Verifier results

| Gate | Result |
| --- | --- |
| `verify:motivational-video-layout` | **PASS** |
| `verify:video-surface` | PASS |
| `verify:playback-mutex` | PASS |
| `verify:route-media` | PASS |
| `verify:recently-added` | PASS |
| `verify:electron-security` | PASS |
| `verify:premium-honesty` | PASS |

## TypeScript / build / lint / dist

| Gate | Result |
| --- | --- |
| `npx tsc -b --pretty false` | 0 errors |
| `npm run build` | PASS |
| `npm run lint` | **0 errors**, 1 pre-existing warning (`DesktopPlaybackProvider` exhaustive-deps) |
| `npm run dist` | PASS |

## Dirty-work preservation proof

HEAD unchanged; no destructive git ops; unrelated Phase 1–6 dirty files preserved.

## Remaining blockers

Queued phases resume after this urgent repair:

- Phase 7 Music redesign  
- Phase 8 Sports stream fidelity  
- Phase 9–14 as previously listed  

---

## Phase verdict

```text
Phase 6A PASS — Motivational videos now open in a bounded, premium, aspect-ratio-safe player instead of expanding into a giant full-page surface, while TV, Sports, audio playback, route persistence and the shared video owner remain intact.
```
