# Roadmap — Desktop full completion (refreshed 2026-07-29)

Mobile Sports / CarPlay work is a **separate track** and must not block or redefine these desktop phases.

## Must complete before release

### Phase 1 — Stabilize SSD production tree
- **Systems:** Git tree, untracked modules (`smartContinuation`, `resolveActivePlayerSurface`, `catalogDisplayText`, global background, TV transport)
- **Why next:** Live app ≠ clean HEAD; every fix is non-deterministic until intentional
- **Protected:** Playback mutex, allowlists, typed library
- **Tests:** mutex, queue, route-media, production-config, catalog pagination
- **Acceptance:** Releasable committed tree or explicit revert; app boots from that tree
- **Complexity:** High · **Blocker:** Yes

### Phase 2 — Playback & visible media surfaces
- **Systems:** Sports + Motivational video mount; finish surface resolver; family-switch races
- **Why next:** Playback correctness beats visual polish; Sports can “play” with no picture
- **Protected:** HtmlAudio/HtmlVideo singletons; TV PiP/FS
- **Tests:** playback-mutex, route-media, sports contract, manual Sports/Motivational watch
- **Acceptance:** No silent invisible video; Sports never fakes playability
- **Complexity:** High · **Blocker:** Yes

### Phase 3 — Music product redesign
- **Systems:** Music workspace layout, width, chrome, artwork density, downloads stub removal
- **Why next:** Primary destination classified **requires product redesign**
- **Protected:** Catalog pagination; play stays on Music
- **Tests:** Electron music smokes + human visual acceptance at 1024/1280/1440/large
- **Acceptance:** Design sign-off Music is not transitional/admin chrome
- **Complexity:** Very High · **Blocker:** Yes

### Phase 4 — Library IA + Settings honesty
- Favorites label vs music Liked; Downloads messaging; hide dead Settings/Premium CTAs
- **Complexity:** Medium · **Blocker:** Yes

### Phase 5 — Electron installer hardening
- Single-instance, nav guards, CSP, version, signing decision, clean-machine NSIS QA
- **Complexity:** Medium · **Blocker:** Yes

## Should complete before release

### Phase 6 — Home residual + Search polish
Worlds chip query; empty-catalog resilience; podcast episode search depth  
**Blocker:** No

### Phase 7 — Performance baseline  
**Blocker:** No (unless severe)

### Phase 8 — Accessibility core pass  
**Blocker:** Conditional

## Post-release polish

- Desktop Sports full streaming product + favorites  
- Profile/account/premium commerce  
- Family visual Home-parity (Radio/TV/etc.)  
- macOS/Linux, auto-update, crash reporting  

## Immediate next phase (one only)

**Phase 1 — Stabilize SSD production tree**

Music redesign is the largest *visual* unfinished area, but it must not start on an unstable dirty tree. Stabilize first, then Phase 2 (invisible Sports/Motivational video), then Phase 3 (Music redesign).
