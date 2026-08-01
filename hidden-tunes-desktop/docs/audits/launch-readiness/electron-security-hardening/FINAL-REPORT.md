# Phase 4 — Electron CSP and Navigation Guard Hardening

**Verdict:** PASS  
**Date:** 2026-07-30  
**Branch:** `desktop/integrate-home-music-split`  
**HEAD:** `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` (unchanged; no commit/push)

---

## Workspace proof

| Field | Value |
| --- | --- |
| Physical drive | `D:` |
| Volume label | `llordwills` |
| Filesystem | `NTFS` |
| Workspace path | `D:\HiddenTunes\Active\HiddenTunes-Desktop` |
| Desktop package | `D:\HiddenTunes\Active\HiddenTunes-Desktop\hidden-tunes-desktop` |
| Git root | `D:/HiddenTunes/Active/HiddenTunes-Desktop` |
| Branch | `desktop/integrate-home-music-split` |
| HEAD | `3b4a91f` / `3b4a91fc4bb9c4332da03096de1e051a8044ba5f` |
| Dirty state | Preserved (~50 porcelain lines). Phase 4 adds/edits only Electron security files + verifier/report. Unrelated Phase 1–3 / helper / audit dirt left intact. |

---

## Baseline

Pre-edit baseline (preserved through Phase 4):

| Gate | Result |
| --- | --- |
| `npx tsc -b --pretty false` | 0 errors |
| `npm run build` | PASS |
| `npm run dist` | PASS → `release/Hidden Tunes Desktop Setup 0.0.1.exe` (~107 MB, unsigned) |
| `npm run verify:playback-mutex` | PASS |
| `npm run verify:route-media` | PASS |
| `npm run verify:video-surface` | PASS |
| `npm run verify:recently-added` | PASS |

---

## Security audit findings (pre-repair)

| Area | Pre-repair state |
| --- | --- |
| `contextIsolation` | `true` |
| `nodeIntegration` | `false` |
| `sandbox` | `true` (already enabled; compatible with current preload) |
| `webSecurity` | Implicit default (not explicit) |
| `allowRunningInsecureContent` | Implicit default (not explicit) |
| `preload` | `electron/preload.js` (typed catalog/downloads/runtime only) |
| `devTools` | Open in development only |
| Remote content in main window | Dev: Vite `http://localhost:5173`. Packaged: local `file:` `dist/index.html` |
| WebView | Not enabled |
| Renderer navigation | **Unrestricted** — no `will-navigate` guard |
| Popup creation | **Unrestricted** — no `setWindowOpenHandler` |
| CSP development | **None** |
| CSP packaged production | **None** |
| CSP delivery | N/A |
| External links | No validated `shell.openExternal` path |
| Fallback errors | Loaded via `data:text/html` (conflicts with denying `data:` navigation) |
| Preload exposure | Narrow; no raw `ipcRenderer`; no open-external channel |

---

## Origin inventory

| Category | Origins / notes |
| --- | --- |
| Internal development | Exact `http://localhost:5173` only (not all localhost ports) |
| Packaged origin | `file:` under `dist/` and `electron/fallback.html` (path-root checked) |
| API origins | `https://api.hiddentunes.com`, `https://hidden-tunes-api.onrender.com`, `https://admin.hiddentunes.com` |
| Supabase (optional) | `https://*.supabase.co` / `wss://*.supabase.co` when configured |
| Image origins | Catalogue CDNs vary → `img-src … https:` |
| Media origins | Backend-resolved stream/CDN hosts + optional HTTP radio + `ht-download:` + `blob:` |
| Permitted external protocols (OS browser) | `https:` only (`mailto:` intentionally disabled) |
| Frame origins | None — `frame-src 'none'` |
| Connect for HLS | HLS.js XHR-fetches manifests/segments → `connect-src` includes `https:` (documented; not script/nav privilege) |

---

## Policy implemented

### Navigation decision model

`classifyDesktopNavigationTarget(rawUrl, context)` in `electron/navigationPolicy.js`:

- Parse with `new URL()`; fail closed
- `allow-internal`: exact Vite origin (dev) or `file:` under app roots (packaged)
- `open-external`: `https:` only
- `deny`: `javascript:`, `data:`, `vbscript:`, bare `http:` external, arbitrary `file:`, unknown schemes, `ht-download:` as main-window nav

### Window-open policy

`setWindowOpenHandler` **always** returns `{ action: 'deny' }`.  
If classified `open-external`, also calls validated `shell.openExternal`.

### External browser policy

`shell.openExternal` only after classifier returns `open-external`.  
Typed IPC: `ht-shell-open-external` → `hiddenTunesDesktop.shell.openExternalUrl(url)`.

### CSP

Session `onHeadersReceived` stamps CSP **only on app HTML documents** (not remote media/API). Attached once per session (`sessionSecurityAttached`).

### Development vs production

| | Development | Production |
| --- | --- | --- |
| Internal nav | Exact `localhost:5173` | Packaged `file:` under app roots |
| `script-src` | `'self' 'unsafe-eval' 'unsafe-inline'` (Vite HMR) | `'self'` only |
| `connect-src` | + `http://localhost:5173` `ws://localhost:5173` | `'self' https: wss://*.supabase.co` |

### Fallback behaviour

Error pages use `electron/fallback.html` via `loadFile` (no `data:` navigation).

---

## Files inspected

- `electron/main.js`, `electron/preload.js`, `electron/runtimeConfig.js`, `electron/catalogBridge.js`
- `electron/downloads/*` (protocol `ht-download`, `bypassCSP` for local media — preserved)
- `index.html`, Vite build output
- `src/lib/desktopCatalogBridge.ts`, `src/lib/config/desktopRuntimeConfig.ts`
- `src/lib/tv/HtmlVideoPlaybackService.ts` (HLS.js connect-src impact)
- Renderer search: no `window.open` / `target=_blank` / `mailto:` usage found

---

## Files changed

| File | Reason | Security improvement | Behaviour preserved |
| --- | --- | --- | --- |
| `electron/navigationPolicy.js` | **Added** central classifier + CSP builders | Single fail-closed policy authority | N/A (new) |
| `electron/main.js` | Wire CSP, will-navigate, window-open, openExternal IPC; explicit webSecurity; file fallback | Closes nav/popup/CSP gaps | Bootstrap, downloads, catalog IPC, window lifecycle |
| `electron/preload.js` | Typed `shell.openExternalUrl` | Validated external-open bridge | Existing runtime/catalog/downloads bridge |
| `electron/fallback.html` | **Added** static fallback | Avoids `data:` navigation | Error UX retained (generic copy) |
| `src/lib/desktopBridgeTypes.ts` | `DesktopShellBridgeApi` | Types match preload | Existing bridge types |
| `package.json` | `verify:electron-security` script | Automated gate | Other scripts unchanged |
| `scripts/verify-electron-security.mjs` | **Added** policy/CSP/wiring tests | Regression lock | N/A |
| `scripts/smoke-electron-security.mjs` | **Added** packaged Electron smoke | Runtime proof | N/A |
| `docs/audits/.../FINAL-REPORT.md` | This report | Audit trail | N/A |

---

## CSP proof

### Production

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: wss://*.supabase.co; media-src 'self' blob: https: http: ht-download:; worker-src 'self' blob:; form-action 'self'
```

### Development

```text
default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http://localhost:5173; font-src 'self' data:; connect-src 'self' https: http://localhost:5173 ws://localhost:5173 wss://*.supabase.co; media-src 'self' blob: https: http: ht-download:; worker-src 'self' blob:; form-action 'self'
```

### Broad directives explained

| Directive | Why |
| --- | --- |
| `style-src 'unsafe-inline'` | React / component inline styles |
| `img-src https:` | Catalogue artwork CDN hosts not enumerable |
| `media-src https: http:` | Resolved stream hosts + legacy HTTP radio sources without weakening `webSecurity` / `allowRunningInsecureContent` |
| `connect-src https:` | HLS.js XHR to backend-resolved CDN hosts; does not widen `script-src` or navigation |
| `script-src 'unsafe-eval'` | **Development only** for Vite HMR |
| `ht-download:` in `media-src` | Existing privileged download playback protocol |

No `script-src *`, `default-src *`, or production `unsafe-eval`.

---

## Navigation proof

| Case | Decision |
| --- | --- |
| `http://localhost:5173/` (dev) | allow-internal |
| `http://localhost:5174/` (dev) | deny |
| Packaged `dist/index.html` | allow-internal |
| `https://example.com/help` | open-external |
| `http://example.com/help` | deny |
| `javascript:alert(1)` | deny |
| `data:text/html,…` | deny |
| Arbitrary `file:` | deny |
| Malformed URL | deny |
| Hostname-prefix / credentialed URLs | Parsed via `URL()` (no substring trust) |

Smoke: assigning `https://example.com/evil` from packaged renderer left main window on `file:…/dist/index.html` (`navigationsBlocked=1`).

---

## Popup proof

`setWindowOpenHandler` always denies Electron windows. Smoke: `window.open('https://example.com/popup')` → `windowOpenDenied=1`, `BrowserWindow.getAllWindows().length === 1`.

---

## Preload/IPC proof

- Bridge remains `contextBridge` + typed namespaces
- New channel `ht-shell-open-external` accepts string only; main validates
- Smoke: `window.ipcRenderer` / `window.require` are `undefined`; `shell.openExternalUrl` present

---

## Runtime verification

### Packaged smoke (`electron scripts/smoke-electron-security.mjs`)

- Packaged index loaded
- Remote navigation blocked
- Popup denied
- Production CSP applied (no `unsafe-eval`)
- Preload bridge intact

### Development / full UI

Full interactive Home/Radio/TV/Podcasts playthrough was not re-run in this agent session after hardening. Automated policy + packaged smoke + prior media verifiers + successful `dist` provide the security and regression gate. Recommend a short human pass on `npm run dev` and the new Setup exe for CSP console noise.

Downloads path unchanged (`ht-download` + existing manager). Media CSP deliberately allows stream hosts.

---

## Build and verifier results

| Command | Result |
| --- | --- |
| `npm run verify:electron-security` | **PASS** |
| `electron scripts/smoke-electron-security.mjs` | **PASS** |
| `npm run verify:playback-mutex` | PASS |
| `npm run verify:route-media` | PASS |
| `npm run verify:video-surface` | PASS |
| `npm run verify:recently-added` | PASS |
| `npx tsc -b --pretty false` | 0 errors |
| `npm run build` | PASS |
| `npm run lint` | 28 errors / 3 warnings — **pre-existing**; touched `desktopBridgeTypes.ts` eslint exit 0; electron JS not in eslint file set |
| `npm run dist` | PASS → `release/Hidden Tunes Desktop Setup 0.0.1.exe` (~112,715,398 bytes) |

---

## Dirty-work preservation

- No reset / clean / stash / rebase / branch switch / commit / push
- HEAD remains `3b4a91f`
- Unrelated dirty files (backend admin package.json, prior phase sources, helper scripts, other audits) untouched by this phase’s intent

---

## Remaining security limitations

1. **`connect-src https:` / `img-src https:` / `media-src https:`** — unavoidable breadth for backend-resolved CDN/stream hosts; does not grant script or main-window navigation.
2. **`media-src http:`** — some radio upstreams may still be HTTP; `webSecurity` stays true; `allowRunningInsecureContent` stays false.
3. **`ht-download` protocol uses `bypassCSP: true`** (pre-existing downloads design) — local downloaded media playback; not redesigned.
4. **Sandbox remains `true`** — confirmed compatible; no change required.
5. **No mailto** — not used by app.
6. **Auth** — no Electron OAuth callback navigation flow identified; left untouched.

---

## Remaining launch blockers (untouched)

- Premium honesty
- Existing ESLint debt (~28 errors)
- Music redesign
- Version `0.0.1` + code signing + clean-machine QA
- Sports DASH fidelity / live inventory QA

---

## Phase verdict

```text
Phase 4 PASS — Hidden Tunes Desktop now enforces a production CSP, denies untrusted navigation and popup creation, opens validated external links only through the system browser, and preserves all existing renderer, playback, media, download and build behaviour.
```
