# RUNTIME CONFIG Audit

| Owner | Path |
|-------|------|
| Renderer | `src/lib/config/desktopRuntimeConfig.ts` (**dirty**) |
| Main | `electron/runtimeConfig.js` (**dirty**) |

- Production Express + admin allowlists present
- Packaged host protection verified by `verify-production-config` **PASS**
- Sports pilot token main-only pattern
- Dual copies can drift — both currently dirty together

**Launch:** Config direction is sound; must commit intentional pair and re-verify packaged mode.
