# SECURITY Audit

| Finding | Severity |
|---------|----------|
| contextIsolation + sandbox + no nodeIntegration | Good |
| Preload allowlist | Good |
| Catalog IPC path/method gates + host allowlists | Good |
| Missing CSP | **High** |
| Missing single-instance lock | **High** |
| Missing will-navigate / setWindowOpenHandler | **High** |
| `ht-download` bypassCSP for scheme | Medium (expected; needs containment) |
| Unsigned installer | **High** for public |
| Secrets in renderer | Config verify claims omitted — keep monitoring |

Do not weaken security during remediation — add guards.
