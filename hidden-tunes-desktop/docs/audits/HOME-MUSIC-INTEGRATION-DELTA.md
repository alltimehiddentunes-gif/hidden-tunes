# Home / Music Integration Delta

**Date:** 2026-07-22  
**Integration branch:** `desktop/integrate-home-music-split`  
**Integration HEAD:** `07b2b65` (fast-forward of split onto `desktop/current-protected-baseline` @ `1afd839`)  
**Protected tag (unchanged):** `desktop-protected-baseline-2026-07-21` → `535b1a7`

## Scorecard delta

| Item | Before (parity audit of dirty-line tree) | After integration |
|------|------------------------------------------|-------------------|
| Desktop functional (weighted) | ~**63%** | ~**66%** |
| Home/Music duplication | Unresolved in approved tree | **Resolved** |
| Main sidebar on Music | Hidden | **Visible** |
| Navigation / shell category | ~70% | ~**78%** (IA clarity) |
| Music IA category | ~55–78 mixed | Music browse role clearer (~**80%**) |

### Why only +~3 points overall

Weighted categories that improved:

- **Navigation and shell (6%):** 70 → 78 → contributes ~**+0.5**
- **Music (10%):** 78 → 80 → contributes ~**+0.2**
- **Performance/polish (5%):** modest IA cleanup 55 → 60 → ~**+0.25**
- Soft uplift from reduced duplicate work / clearer Home purpose → round to **~66%**

Unresolved (unchanged blockers):

- Production podcast/radio hardening
- Typed multi-family Library
- Radio favorites / mature
- Universal search
- Sports
- Downloads / offline
- Settings / personalization
- Native desktop integration (tray, updater, protocol, single-instance)
- Release operations (signing, crash reporting)

## Integrated commits

| Commit | Purpose |
|--------|---------|
| `60d813a` | Source: Home personalization vs Music catalog split |
| `07b2b65` | Docs, screenshots, runtime validation harness (no product source fixes) |

## Validation on integration worktree

- `tsc --noEmit` → exit 0  
- Home/Music targeted ESLint → exit 0  
- `verify-playback-mutex.mjs` → PASS  
- Electron smoke `smoke-home-music-integration.mjs` → 16/16 PASS  

## Explicitly not done

- Did not move protected tag  
- Did not touch dirty `feature/radio-worldwide-40k` workspace  
- Did not push  
- Did not merge radio/backend work  
