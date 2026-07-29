# TEST INVENTORY

## Ran this audit

| Command / script | Class | Result | Proves | Blind spots |
|------------------|-------|--------|--------|-------------|
| `npx tsc --noEmit` | build | **PASS (exit 0)** on dirty tree | Types compile now | Packaged build / clean HEAD may differ |
| `verify-playback-mutex.mjs` | contract | PASS | Mutex helpers | Live races |
| `verify-production-config.mjs` | contract | PASS | Allowlists/preload | Packaged run |
| `verify-queue-contract.mjs` | contract | PASS | Queue contracts | UI |
| `verify-home-genres.mjs` | contract+runtime API | PASS | 12 genres | UI lag |
| `verify-catalog-pagination.mjs` | static | PASS | Pagination markers | Live |
| `test-route-independent-media.mjs` | contract | PASS | Ownership rules | Live UI |
| `verify-conditional-player-shell.mjs` | contract | PASS | Shell markers | Visual |
| Full ESLint | lint | **FAIL** (33 errors, 3 warnings) | Hook/style gates | Many may be pre-existing; still a release quality gate |

## Blind spots

- Static ≠ visual premium
- Smokes often need Electron runner (not plain node)
- Idle-player assumptions in older tests may be obsolete
- Dirty tree PASSes ≠ clean HEAD PASSes
