# Potential Secrets Report

**Values were not printed.**

| Path | Name found | Sensitive? | Handling |
|------|------------|------------|----------|
| `electron/runtimeConfig.js` | `HT_SPORTS_PRIVATE_PILOT_TOKEN`, `VITE_SPORTS_PRIVATE_PILOT_TOKEN` | Env **names** only; reads `process.env` | Safe — no literal secrets |
| `src/lib/config/desktopRuntimeConfig.ts` | `service-role` rejection text; `HT_SPORTS_PRIVATE_PILOT_TOKEN` | Guard/comments | Safe — rejects service-role; does not embed tokens |
| Filenames | No `.env` / `.pem` / credential files in staged set | — | — |

**Verdict:** No real secrets found in proposed commit set. Local `.env` remains untracked/ignored.
