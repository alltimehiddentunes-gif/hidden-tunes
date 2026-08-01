# Security Audit

**Scope:** Electron main, preload, navigation policy, CSP, downloads protocol, IPC surface.  
**Script:** `scripts/verify-electron-security.mjs` → **PASS**.

---

## Hardening checklist

| Control | Status | Evidence |
|---------|--------|----------|
| contextIsolation | PASS | `main.js` webPreferences |
| nodeIntegration false | PASS | same |
| sandbox true | PASS | same |
| webSecurity true | PASS | same |
| allowRunningInsecureContent false | PASS | same |
| Preload bridge only | PASS | `preload.js` exposes `hiddenTunesDesktop` |
| No raw ipcRenderer export | PASS | verifier |
| IPC allowlist | PASS | runtime / shell / catalog / downloads only |
| Catalog path must start `/api/` | PASS | main handlers |
| Catalog methods GET/POST only | PASS | main handlers |
| External open validated | PASS | `openValidatedExternalUrl` + classifier |
| will-navigate guard | PASS | `attachWindowSecurity` |
| setWindowOpenHandler deny default | PASS | always deny; HTTPS may open external |
| javascript:/data:/vbscript: blocked | PASS | navigationPolicy |
| HTTP external blocked | PASS | |
| ht-download not main-window navigable | PASS | scheme for media only |
| Production CSP script-src self | PASS | no unsafe-eval in prod |
| object-src none / frame-ancestors none | PASS | |
| CSP stamped on app documents only | PASS | not on remote API responses |
| Downloads path safety | PASS (by design) | downloads module pathSafety |
| Download size / concurrency limits | PASS | max concurrent 2, ~400MB/item, free-space reserve |
| Fallback page | PASS | `loadFile(fallback.html)` + meta CSP — not data: HTML |
| Secrets in preload | PASS | runtime diagnostics claim no secrets |

---

## Residual risks (not regressions)

| Risk | Severity | Notes |
|------|----------|-------|
| No auto-update authenticity chain | Major for production ops | Unsigned 0.0.1 installer; no update signature story |
| `signAndEditExecutable: false` | Major for store/public distribute | Windows SmartScreen friction |
| Dev CSP allows unsafe-eval | Acceptable for Vite HMR | Prod excludes it |
| Large dirty tree including security files | Process | main/preload/navigationPolicy uncommitted — freeze before release |
| Renderer still talks to HTTPS catalog/media | Expected | connect-src https + supabase wss |

---

## Security score: **91 / 100**

Electron app-security baseline is strong and verified. Remaining deductions are release signing / update authenticity, not missing contextIsolation.
