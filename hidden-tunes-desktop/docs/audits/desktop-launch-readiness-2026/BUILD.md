# Build Audit

**Package:** `hidden-tunes-desktop` @ `0.0.1`  
**Package manager:** npm  
**Date:** 2026-08-01

---

## Commands run this audit

| Check | Result | Notes |
|-------|--------|-------|
| `npx tsc -b` | **PASS** (exit 0) | No TypeScript errors |
| `npx eslint .` | **PASS** (exit 0) | MODULE_TYPELESS_PACKAGE_JSON warning only |
| `npm run build` (`tsc -b && vite build`) | **PASS** (exit 0) | Chunk size warning |
| `node scripts/verify-electron-security.mjs` | **PASS** | 58 assertions |
| `node scripts/verify-premium-honesty.mjs` | **PASS** | Honesty contract |
| `node scripts/verify-playback-mutex.mjs` | **PASS** | |
| `node scripts/verify-recently-added-truthfulness.mjs` | **PASS** | |
| `node scripts/test-route-independent-media.mjs` | **PASS** | |
| `npm install` | Not re-run | `node_modules` already present; lockfile exists |
| `npm run dist` / electron-builder | Not re-run | Prior artifact present (2026-07-30) |
| Electron smoke (full UI) | Not re-run | Avoid launching long-lived Electron in audit-only pass |

---

## Failure classification

| Item | Class |
|------|-------|
| Vite chunk &gt;500 KB warning | **Pre-existing / known** — not a build failure |
| ESLint package.json module-type warning | **Pre-existing** — noise, exit 0 |
| TypeScript errors | **None** (new or old) this pass |
| ESLint errors | **None** this pass |
| Missing auto-update | **Product gap**, not a compile failure |
| Version `0.0.1` | **Release process gap** |
| Dirty worktree (81 paths) | **Process blocker** for shipping — not a compiler failure |
| Stale Home screenshots with fake titles | **False positive vs current source** — verifier proves strings removed |

---

## Dist / package artifacts

| Artifact | Status |
|----------|--------|
| `dist/` | Present; rebuilt successfully this audit (~7.5 MB) |
| `release/Hidden Tunes Desktop Setup 0.0.1.exe` | Present (~107.5 MB), dated 2026-07-30 |
| `release/win-unpacked/` | Present |
| Code signing | `signAndEditExecutable: false` |
| Publish / update feed | Absent |

---

## Build score: **88 / 100**

Toolchain is healthy. Remaining gaps are release engineering (version, sign, update), not greenfield compile breakage.
