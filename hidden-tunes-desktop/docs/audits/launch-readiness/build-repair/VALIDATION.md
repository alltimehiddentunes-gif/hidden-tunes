# Validation

## Official commands

| Command | Exit | Notes |
|---------|-----:|-------|
| `npx tsc -b --pretty false` | **0** | Zero errors |
| `npm run build` | **0** | `tsc -b` + Vite; `dist/` produced |
| `npm run dist` | **0** | NSIS installer built |
| `npm run lint` | **1** | **28 errors, 3 warnings** (was 33 errors) — pre-existing; not introduced as new gate failure for this phase |
| `node scripts/verify-playback-mutex.mjs` | **0** | PASS |
| `node scripts/test-route-independent-media.mjs` | **0** | PASS |

## Distribution artifact

| Field | Value |
|-------|-------|
| Path | `release/Hidden Tunes Desktop Setup 0.0.1.exe` |
| Size | ~112,714,483 bytes (~107.5 MB) |
| Target | Windows NSIS x64 |
| Version | `0.0.1` |
| Signing | `signAndEditExecutable: false` (unsigned release posture unchanged) |
| Unpacked | `release/win-unpacked/` |

Also: `.blockmap`, `builder-debug.yml`

## Electron regression (dev smoke)

| Check | Result |
|-------|--------|
| Launch (`npm run dev`) | Vite 5173 + Electron processes running |
| Home / shell | App responsive (HMR + client activity observed) |
| TV playback path | Client logged honest stream-unavailable error (video path active) |
| White screen | Not observed |
| Mutex scripts | PASS (static) |
| Route-independent media | PASS (static) |

Manual deep route clicks (Radio/Podcasts/etc.) were not automated beyond smoke; no type repair targeted those modules' runtime logic.

## Type safety confirmations

- No broad `any` added
- No `@ts-ignore` / blanket `@ts-expect-error`
- Strictness options unchanged
- No production source trees excluded from `tsconfig.app.json`
- Narrow boundary cast: downloads ambient → `DownloadsBridge` after runtime presence check
- `isNavKey` guard instead of blind assertion

## Lint boundary

Remaining 28 ESLint errors are predominantly pre-existing `react-hooks/set-state-in-effect` / refs issues in unchanged feature hooks. Carry forward as next technical cleanup — not a TypeScript build blocker.
