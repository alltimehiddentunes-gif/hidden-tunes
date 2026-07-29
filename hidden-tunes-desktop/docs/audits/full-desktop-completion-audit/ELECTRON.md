# Electron & Desktop Platform Audit

## Proven runtime ownership (this audit)

| Check | Result |
|-------|--------|
| Electron resolves from SSD workspace | Yes — `...\HiddenTunes-Desktop\hidden-tunes-desktop\node_modules\electron\dist\electron.exe` |
| `node_modules` junction? | **No** — real directory |
| Vite port | **5173** listening; Electron attached |
| Running app from SSD? | **Yes** (`--app-path` points at SSD desktop) |
| Version | Electron 42.2.0; app `0.0.1` |

## Security present

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Preload allowlist via `contextBridge`
- Catalog IPC path/method/host gates
- Downloads path containment + `ht-download://`
- Packaged production host allowlists (`verify-production-config` PASS)

## Security / platform gaps

| Item | Status |
|------|--------|
| `requestSingleInstanceLock` | **Missing** |
| `will-navigate` / `setWindowOpenHandler` | **Missing** |
| CSP | Missing in `index.html` |
| Code signing | `signAndEditExecutable: false` |
| Auto-update | Missing |
| macOS / Linux packaging | Missing (Windows NSIS only) |
| App version | Still `0.0.1` |
| Icons | `build/icon.ico` + png present; no mac icns |

## Build / scripts

- `dev` / `build` / `dist` present
- Only 4 verify scripts wired in npm; dozens of informal scripts exist
- README still stock Vite template

## Before production installer

1. Stabilize & commit dirty/untracked production tree
2. Bump version + release notes
3. Enable signing (or document unsigned internal-only)
4. Add single-instance + navigation guards + CSP
5. Clean-machine installer QA
6. Decide auto-update strategy
7. Account/legal/support completeness for store/public distribution

## Verdict

Dev Electron platform from SSD is real and reasonably hardened at preload/IPC layer, but **installer/release packaging is not ready**.
