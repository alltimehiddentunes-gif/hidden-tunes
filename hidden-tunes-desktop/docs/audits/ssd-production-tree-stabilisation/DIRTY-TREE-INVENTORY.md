# Dirty Tree Inventory (Stabilisation)

**Date:** 2026-07-29  
**Starting HEAD:** `1114cf2`  
**Workspace:** `D:\HiddenTunes\Active\HiddenTunes-Desktop`  
**Volume:** D: / llordwills / SanDisk Extreme Pro

## Counts at Phase 1

| Metric | Value |
|--------|------:|
| Total dirty | 265 |
| Staged | 264 |
| Unstaged | 0 |
| Untracked | 1 (`full-launch-readiness-audit/`) |

## Classification summary

| Class | Count | Action |
|-------|------:|--------|
| Documentation and audit files | 162 | Commit in docs commit (exclude `_bak`) |
| Application assets (home-reference) | 31 | Commit with runtime |
| Application source | 29 | Commit with runtime |
| Tests and verifiers | 24 | Commit in tests commit |
| Generated / temp patch helpers (`scripts/_*`) | 17 | **Exclude** (keep local, unstaged) |
| Build/tooling (`package.json`, `electron/runtimeConfig.js`) | 2 | Commit with runtime |

Machine-readable: `DIRTY-TREE-INVENTORY.json`
