# ELECTRON Audit

| Check | Result |
|-------|--------|
| Electron version | 42.2.0 |
| Resolves from SSD | Yes — `...\HiddenTunes-Desktop\hidden-tunes-desktop\node_modules\electron` |
| node_modules junction? | **No** — real Directory |
| Main | `electron/main.js` |
| Preload | `electron/preload.js` → `hiddenTunesDesktop` |
| Dev renderer | `http://localhost:5173` |
| contextIsolation / sandbox / nodeIntegration | true / true / false |
| Single-instance lock | **Missing** |
| CSP | **Missing** |
| will-navigate / setWindowOpenHandler | **Missing** |
| DevTools in unpackaged | Opens |

Runtime this audit: Vite ready; Electron launched from SSD (GPU cache Access Denied warnings observed — environment noise, not architecture proof failure).
