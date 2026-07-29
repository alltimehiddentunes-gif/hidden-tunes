# Launch Roadmap

## Must complete before launch

### Phase 1 — Stabilize & commit SSD production tree
- **Scope:** Intentional commit (or revert) of all required staged/modified production modules + home-reference assets; HEAD must run the app
- **Why first:** Highest dependency — nothing else is releasable while runtime ≠ Git
- **Protected:** Playback mutex, IPC allowlists, typed library
- **Tests:** tsc, production-config, genres, mutex, route-media, Home/Music smokes
- **Acceptance:** Clean intentional tree; `npm run dev` from that commit; no required untracked src
- **Complexity:** High · **Blocking:** Yes

### Phase 2 — Visible media surfaces (Sports / Motivationals)
- Mount video for sports/video motivationals OR disable watch UI truthfully
- **Complexity:** High · **Blocking:** Yes

### Phase 3 — Product honesty (Settings / Premium / Favorites / Downloads stubs)
- Remove dead controls or hide; Favorites IA; Downloads messaging
- **Complexity:** Medium · **Blocking:** Yes

### Phase 4 — Music visual redesign (primary destination)
- **Complexity:** Very High · **Blocking:** Yes (or demote Music prominence — not recommended)

### Phase 5 — Electron hardening
- Single-instance, CSP, navigation/window-open guards
- **Complexity:** Medium · **Blocking:** Yes

### Phase 6 — Windows packaging & clean-machine QA
- Version bump, signing decision, NSIS install/uninstall, packaged catalog/playback
- Legal/support links minimum
- **Complexity:** High · **Blocking:** Yes

## Should complete before launch

### Phase 7 — Performance baseline + a11y core  
### Phase 8 — Home residual (Worlds chip) + search polish  

## Post-launch

- Account/Profile/Premium commerce  
- Full Sports streaming product  
- macOS/Linux  
- Auto-update / crash reporting  

## Immediate next phase (one only)

**Phase 1 — Stabilize & commit SSD production tree**

Why: Live app cannot be reproduced from HEAD; installer/build from Git is impossible; every other fix is non-deterministic until the tree is intentional.
