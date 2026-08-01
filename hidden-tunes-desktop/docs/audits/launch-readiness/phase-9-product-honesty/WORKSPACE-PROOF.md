# Phase 9 Workspace Proof

| Field | Value |
|-------|-------|
| Path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Desktop package | `hidden-tunes-desktop` |
| Branch | `desktop/integrate-home-music-split` |
| Starting HEAD | `0d991ac75961d7d2f1f6f5f127ddaaf5b5c4eaf7` |
| Remote at start | `origin/desktop/integrate-home-music-split` @ same SHA |
| Mobile reference | `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142` (read-only) |

**Incident:** During Phase 9 an external checkout moved HEAD to `fix/library-content-type-safe` and stashed WIP. Recovered by returning to `desktop/integrate-home-music-split` and applying `stash@{0}`. Backend files from the stash were restored to HEAD (untouched). Phase 8 helpers/`_bak` remain excluded.

**Expected local exclusions:** `scripts/_*.mjs`, `docs/audits/player-sidebar/_bak*`.
