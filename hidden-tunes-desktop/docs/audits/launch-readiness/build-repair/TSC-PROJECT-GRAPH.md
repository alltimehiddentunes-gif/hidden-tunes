# TypeScript project graph

## Package owner

`D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop`

## Command chain: `npm run build`

1. `tsc -b` — solution-style build of referenced projects  
2. `vite build` — production bundle to `dist/` (`base: './'` for Electron `file://`)

## Command chain: `npm run dist`

1. `npm run build`  
2. `electron-builder` — Windows NSIS (`signAndEditExecutable: false`), output `release/`

## Projects

| Config | Include | Emit | Role |
|--------|---------|------|------|
| `tsconfig.json` | (empty files) | references only | Solution root |
| `tsconfig.app.json` | `src` | `noEmit: true` | Renderer typecheck |
| `tsconfig.node.json` | `vite.config.ts` | `noEmit: true` | Vite config typecheck |

## Electron / Vite

- Electron main/preload are plain JS (`electron/main.js`, `electron/preload.js`) — not in `tsc -b`.
- Renderer TS compiled by Vite (esbuild/rolldown), gated by `tsc -b` first.

## False green

`npx tsc --noEmit` at package root ≠ `tsc -b`. Always use `tsc -b` or `npm run build` as the authoritative TypeScript gate.
