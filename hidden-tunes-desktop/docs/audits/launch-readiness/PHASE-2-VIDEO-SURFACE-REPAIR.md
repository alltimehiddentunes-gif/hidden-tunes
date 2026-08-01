# PHASE-2-VIDEO-SURFACE-REPAIR.md

**Date:** 2026-07-30  
**Package:** `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop`  
**Branch:** `desktop/integrate-home-music-split` · HEAD `3b4a91fc…`

---

## Workspace proof

| Field | Value |
| ----- | ----- |
| Disk | SanDisk Extreme Pro 55AF · D: · `llordwills` |
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| Dirty | Phase 1 + Phase 2 desktop edits; Sports Phase 3 + helper untracked preserved |

No branch switch / reset / clean / stash / commit / push / deploy.

---

## Confirmed root cause

Playback ownership already routed Sports and Motivational **video** through the shared `HtmlVideoPlaybackService` (`usesDesktopVideoPath` in `DesktopPlaybackProvider`).

The **visible** right-rail surface did not:

1. `resolveActivePlayerSurface()` returned `'tv'` only for `isTvQueueSong` — Sports / Motivational video fell through to `'audio'`.
2. `App.tsx` mounts `TvNowPlayingPanel` (which hosts `TvVideoSurface` / `mount()`) only when `activePlayerSurface === 'tv'`.
3. `TvNowPlayingPanel` further gated the playing UI on `isTvQueueSong`, so even a forced rail would show TV “Discover” chrome instead of a video mount.

Result: video could decode/play on the shared element while parked off-screen — invisible Sports/Motivational video.

Lecture video remains intentionally page-local (`LectureSeriesPage` mounts the shared element) and is excluded from the rail to avoid double-mount fights.

---

## Architecture

| Concern | Owner |
| ------- | ----- |
| Playback owner | `DesktopPlaybackProvider` (unchanged) |
| Single video element | `HtmlVideoPlaybackService` via `mountTvVideo` / `TvVideoSurface` |
| Surface resolver | `resolveActivePlayerSurface` + new `requiresVideoSurface` |
| Session classification | Adapter helpers (`isTvQueueSong`, `isSportsQueueSong`, `isMotivationalVideoSong`) |
| Route independence | Resolver takes **track only** — no nav key |
| Mutex | Unchanged `usesDesktopVideoPath` / stopInactiveMedia |

---

## Files changed

| File | Change | Behaviour |
| ---- | ------ | --------- |
| `src/lib/player/resolveActivePlayerSurface.ts` | `requiresVideoSurface()`; rail for TV + Sports + Motivational video | Shared video rail mounts for those sessions |
| `src/components/tv/TvNowPlayingPanel.tsx` | Family-aware now-playing; mounts video for all three; TV-only favorites/discover/LIVE channel chrome | Visible surface for Sports/Motivational |
| `src/components/tv/TvVideoSurface.tsx` | Optional `showLiveBadge` + generic labels | No fake LIVE on Motivational; TV LIVE preserved |
| `scripts/verify-video-surface.mjs` | Classification suite | Guards regression |
| `package.json` | `verify:video-surface` script | Test entrypoint |

Protected: DesktopPlaybackProvider logic, audio owner, queue, mutex, preload/IPC, backend — untouched.

---

## Tests

```text
npm run verify:playback-mutex  → PASS (8)
npm run verify:video-surface   → PASS (22 assertions)
npx tsx import of requiresVideoSurface / resolveActivePlayerSurface → PASS
```

Classification covered: TV / Sports / Motivational video / Motivational audio / Radio / Podcast / null / lecture-rail exclusion.

---

## Runtime evidence

| Scenario | Result |
| -------- | ------ |
| Sports video visible surface (code path) | **Fixed** — `requiresVideoSurface(sports-*) === true` → shared rail + `TvVideoSurface` mount |
| Sports live stream smoke | **Blocked environmentally** — public Sports API remains `enabled:false`; no verified playable fixture to start without fabricating streams |
| Motivational video surface (code path) | **Fixed** — motivational-video tags require rail |
| Motivational audio | Remains `audio` rail (`requiresVideoSurface` false) |
| TV regression | Packaged exe launch alive (4 processes); TV panel path unchanged for `tv-*` |
| Navigation persistence | Resolver still track-based (route-agnostic); mutex script unchanged |
| Screenshots of live Sports/Motivational frames | **Not captured** — no verified playable Sports/Motivational video inventory in this workspace without fabricating streams. Evidence is classification + panel mount wiring + TV packaged smoke. |

---

## Build verification

| Command | Result |
| ------- | ------ |
| `npx tsc -b --pretty false` | **0 errors** |
| `npm run build` | **PASS** |
| `npm run lint` (repo) | 31 problems (28 errors, 3 warnings) — pre-existing |
| ESLint touched Phase 2 files | **0 errors** |
| `npm run verify:playback-mutex` | **PASS** |
| `npm run verify:video-surface` | **PASS** |
| `npm run dist` | **PASS** (win-unpacked + Setup 0.0.1.exe) |

---

## Dirty-work preservation

Unrelated `_*.mjs` helpers, sidebar bak dirs, Sports fixtureProviders Phase 3, launch-readiness docs — preserved. No git mutate commands.

---

## Remaining launch blockers (not this phase)

- Fake Home Recently Added
- CSP / navigation guards
- Unsigned `0.0.1` identity
- Music redesign
- Existing ESLint debt
- Public Sports still disabled (fixture/provider enablement)

---

## Phase verdict

`Phase 2 PASS — Sports and Motivational video now always use the existing shared visible video surface, while TV, audio playback, navigation persistence and the playback mutex remain intact.`

Caveat recorded: end-to-end pixel proof of Sports/Motivational *frames* awaits a verified playable item once Sports (or Motivational video) inventory is lawfully available; the invisible-surface defect class is closed in routing/UI.
