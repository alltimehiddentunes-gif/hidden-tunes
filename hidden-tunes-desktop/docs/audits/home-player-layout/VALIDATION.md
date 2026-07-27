# Validation

## Commands

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS (exit 0) |
| ESLint `DesktopPersistentPlayer.tsx`, `GlobalTopNav.tsx`, `MusicHomePage.tsx` | PASS (exit 0) |
| ESLint `App.tsx` | Pre-existing errors only (setState-in-effect / unused legacy pages) — not introduced by Home/player isolation |
| `node scripts/verify-playback-mutex.mjs` | PASS |
| `node scripts/verify-queue-contract.mjs` | PASS (85/85) |
| `npx electron scripts/smoke-home-player-layout.mjs` | PASS (52/52) |

## Electron

- Vite on `5173` from `hidden-tunes-desktop`
- Electron resolved from local `node_modules/electron`
- One smoke instance with isolated userData
- Renderer: `http://localhost:5173`

## Runtime highlights

- All listed nav pages opened with content
- Duplicate top routes: 0
- Empty player: “Nothing Playing”
- No question-mark placeholder
- Active play showed metadata; single audio
- 1024 / 1280 / 1440 / 1720: no overflow; player visible

See `runtime-results.json`.
