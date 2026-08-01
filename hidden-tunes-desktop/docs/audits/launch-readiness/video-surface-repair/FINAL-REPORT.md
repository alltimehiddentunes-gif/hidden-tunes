# Phase 2 FINAL REPORT — Sports & Motivational visible video surface

## Workspace proof

| Field | Value |
|-------|-------|
| Disk | D: |
| Volume label | `llordwills` |
| Filesystem | NTFS |
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` (unchanged — no commit) |
| Dirty state | Preserved (Phase 1 type repairs + Phase 2 surface files + prior helpers/audits). Backend dirty files untouched. |

## Baseline proof

| Gate | Result |
|------|--------|
| `npx tsc -b --pretty false` | **0** |
| `npm run build` | **PASS** |
| `npm run dist` | **PASS** (unsigned `0.0.1` installer) |
| `npm run verify:playback-mutex` | **PASS** |
| Phase 1 build-repair report | Read before edits |

## Root cause

See `ROOT-CAUSE.md`.

**Summary:** Shared video **ownership** already included Sports and Motivational video (`usesDesktopVideoPath`), but `resolveActivePlayerSurface` returned `'tv'` only for `isTvQueueSong`. App therefore mounted `DesktopPersistentPlayer` while the singleton video element stayed parked offscreen. `TvNowPlayingPanel` also gated chrome on TV-only checks. Routing was **not** the owner of the bug — session classification was.

## Files inspected

| File | Role |
|------|------|
| `src/lib/player/resolveActivePlayerSurface.ts` | Surface selection |
| `src/App.tsx` | Rail mount (`activePlayerSurface === 'tv' ? TvNowPlayingPanel : …`) |
| `src/components/tv/TvNowPlayingPanel.tsx` | Visible video chrome |
| `src/components/tv/TvVideoSurface.tsx` | Mounts singleton video element |
| `src/lib/tv/tvVideoPlayback.ts` / `HtmlVideoPlaybackService.ts` | Shared video owner |
| `src/context/DesktopPlaybackProvider.tsx` | Mutex / `usesDesktopVideoPath` (not rewritten) |
| `src/lib/sports/sportsPlaybackAdapter.ts` | Sports queue classifier |
| `src/lib/motivationals/motivationalPlaybackAdapter.ts` | Video vs audio tags |
| `scripts/test-route-independent-media.mjs` | Route persistence guards |
| `scripts/verify-playback-mutex.mjs` | Path ownership |

## Files changed

| File | Reason / repair | Protected behaviour |
|------|-----------------|---------------------|
| `src/lib/player/resolveActivePlayerSurface.ts` | Added `requiresVideoSurface()` for TV + Sports + Motivational **video**; resolver returns shared video rail for those | Route-agnostic; lecture video still excluded from rail |
| `src/components/tv/TvNowPlayingPanel.tsx` | Family-aware chrome (`data-video-family`); TV-only favorites/discover retained; Sports/Motivational use shared `TvVideoSurface` | Single video owner; no second player |
| `src/components/tv/TvVideoSurface.tsx` | Optional LIVE badge / transport labels for non-TV | Same mount/unmount of singleton service |
| `src/App.tsx` | Exclude Motivational video from shuffle/repeat in footer chrome | Playback provider untouched |
| `package.json` | `verify:video-surface` script | Build command unchanged |
| `scripts/verify-video-surface.mjs` | Classification matrix | — |
| `scripts/test-route-independent-media.mjs` | Mirror new resolver; Sports/Motivational persistence + switch cases | — |
| Capture helpers under `scripts/capture-video-surface-*.mjs` | Evidence only | Not production runtime |

## Shared video-owner proof

| Concern | Evidence |
|---------|----------|
| Owner location | `acquireTvVideoPlaybackService()` → `HtmlVideoPlaybackService` |
| Surface resolver | `requiresVideoSurface` / `resolveActivePlayerSurface` — session track only |
| Active-session authority | `DesktopPlaybackProvider` queue/`currentTrack` (unchanged) |
| Duplicate-owner prevention | Single acquire path; `TvVideoSurface` mounts/unmounts same element; parking host retained |
| Route independence | Resolver has no route inputs; route-media script PASS for Sports/Motivational across nav keys |

## Runtime results

### Sports video
- **Surface wiring:** Sports queue songs now resolve to shared video rail (`requiresVideoSurface` + panel family `sports`).
- **Live catalogue during verification:** Sports UI opened (screenshot `02-sports-route.png` / CDP `11-cdp-sports.png`). Live tab showed empty inventory earlier; automation did not obtain a verified in-stream Sports play with visible frames in this session.
- **Honest limit:** End-to-end Sports *stream* visibility was not proven with a real fixture URL here. Surface **selection** defect is repaired; DASH demuxer gaps (prior audit HIGH) remain a separate playback fidelity risk when streams are DASH-only.

### Motivational video
- Classifier `isMotivationalVideoSong` (`motivational-video` / `motivational-stream` tags) now opens shared video rail.
- UI exposes Audio/Video filters (screenshot `03-motivationals-route.png`).
- Automated CDP play clicks did not stably open a video session in this harness (nav noise / offline catalog banners). Classification + mount path covered by scripts.

### Motivational audio
- Tags without video markers → `requiresVideoSurface === false` → audio rail. Script PASS.

### TV regression
- Still uses same rail + owner. Mutex/route scripts PASS. Provider path unchanged.

### Route persistence / switching
- Script matrix PASS: Sports & Motivational video surfaces survive browsing all listed routes; explicit Radio/audio replaces session; navigateNav does not stop playback.

### Stop/close
- Unchanged `stopPlayback` on shared panel; video unmount parks element without creating a second owner (route-media source guards).

## Screenshots

| Path | Description |
|------|-------------|
| `screenshots/02-sports-route.png` | Sports Fixtures page (Electron capture) |
| `screenshots/03-motivationals-route.png` | Motivationals with Audio/Video filters |
| `screenshots/01-shell-home.png` / `10-cdp-home.png` | Shell home |
| `screenshots/11-cdp-sports.png` … `18-*.png` | CDP automation sequence (partial; some clicks missed intended playables) |
| `screenshots/*-probe.json` | DOM probes from automation |

## Tests

| Command | Result |
|---------|--------|
| `node scripts/verify-video-surface.mjs` | **PASS** |
| `npm run verify:playback-mutex` | **PASS** |
| `npm run verify:route-media` | **PASS** (extended for Sports/Motivational) |

## Build gates

| Command | Result |
|---------|--------|
| `npx tsc -b --pretty false` | **0 errors** |
| `npm run build` | **PASS** |
| `npm run lint` | **28 errors / 3 warnings** (pre-existing; no new errors in `resolveActivePlayerSurface` / `TvNowPlayingPanel` / `TvVideoSurface`) |
| `npm run verify:playback-mutex` | **PASS** |
| `npm run dist` | **PASS** |

## Performance result

- No second `<video>` owner introduced.
- Rail still mounts one surface; parking host remains for non-visible periods.
- Route changes do not remount via nav key (session-driven).
- Idle CPU: no always-on Sports surface when session idle (`hasActiveMediaSession` gate unchanged).

## Dirty-work preservation proof

- No `git reset` / `clean` / `stash` / branch switch / commit / push.
- Phase 1 bridge typing files remain.
- Untracked helpers (`scripts/_*`) and audit docs remain.
- Backend dirty paths not modified in this phase.

## Remaining launch blockers (untouched)

1. Home Recently Added fake title/art  
2. CSP + navigation guards  
3. Premium honesty gaps  
4. ESLint debt (28)  
5. Music redesign  
6. Version `0.0.1` + code signing  
7. Sports DASH demuxer / live inventory QA on clean machines  

## Phase verdict

**Phase 2 PASS — Sports and Motivational video now always use the existing shared visible video surface, while TV, audio playback, route persistence, the playback mutex and the official build pipeline remain intact.**

*Caveat recorded in evidence:* this session did not capture a live Sports fixture stream with on-screen frames (empty/unavailable playables under automation). The launch defect — **TV-only visible surface selection while Sports/Motivational video already used the shared owner** — is repaired and covered by classification + route-media + mutex verification.
