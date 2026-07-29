# Release Readiness

| Item | Classification |
|------|----------------|
| package scripts | ready for dev; incomplete for release ops |
| Vite config | ready |
| electron-builder Windows NSIS | configured but untested as signed release |
| appId `com.hiddentunes.desktop` | ready |
| productName Hidden Tunes Desktop | ready |
| icons (win) | configured |
| version `0.0.1` | blocked (pre-release) |
| signing | missing / disabled |
| Windows installer QA | missing |
| macOS packaging | not required for first Windows release / missing |
| Linux packaging | not required for first Windows release / missing |
| auto-update | missing |
| crash reporting | missing / not evidenced |
| analytics | missing / not evidenced |
| privacy disclosures | incomplete |
| production env allowlists | ready (config verified) |
| API availability | external dependency; catalog smoke PASS this session |
| feature flags (Sports) | ready pattern |
| legal pages / support | incomplete |
| release notes | missing |
| clean-machine test | missing |
| Git clean production tree | **blocked** (dirty + untracked production modules) |
| Account/Premium commerce | missing / placeholder |
| Single-instance + nav guards | missing |

## First-release minimum gaps

1. Commit or deliberately revert WIP production modules
2. Music visual acceptance
3. Favorites IA honesty
4. Settings dead-control cleanup
5. Electron single-instance + navigation hardening
6. Version bump + unsigned-or-signed installer QA
7. Legal/support/privacy links
8. Manual playback matrix sign-off across families

## Verdict

**Not ready to ship to real users.**
