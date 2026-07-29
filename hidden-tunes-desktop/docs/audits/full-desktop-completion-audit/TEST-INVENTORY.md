# Test Inventory

## Ran in this audit

### Contract / static (via `node`) — all PASS

| Script | Class | Result | Proves real behaviour? | Blind spots |
|--------|-------|--------|------------------------|-------------|
| `verify-playback-mutex.mjs` | unit/contract | PASS | Helpers only | Provider races |
| `verify-queue-contract.mjs` | contract | PASS | Source/contracts | No media |
| `verify-production-config.mjs` | contract/static | PASS | Config/preload strings | No packaged run |
| `verify-catalog-pagination.mjs` | contract/static | PASS | Source invariants | Live API |
| `verify-home-mobile-parity.mjs` | static | PASS | Markers/order | Visual quality |
| `test-route-independent-media.mjs` | contract/static | PASS | Ownership rules | Live UI |
| `verify-sports-contract.mjs` | contract | PASS | Types/policy | Live streams |
| `verify-global-search-contract.mjs` | contract | PASS | Wiring | Latency |
| `verify-typed-library-contract.mjs` | contract | PASS | Typed library | UI |
| `verify-playlists-contract.mjs` | contract | PASS | Playlist ops | UI |
| `verify-downloads-contract.mjs` | contract | PASS | Safety/policy | Real disk edge cases |
| `verify-history-contract.mjs` | contract | PASS | History rules | UI |
| `verify-tv-transport-sync.mjs` | contract/static | PASS | Sync rules | Live TV |
| `verify-dev-audio-harness-exclusion.mjs` | static | PASS | Exclusion | Future regressions |

### Runtime smoke

| Script | Runner | Result | Notes |
|--------|--------|--------|-------|
| `smoke-catalog-runtime.mjs` | **electron** | PASS (~150s) | Must not use plain `node` (ESM/CJS import failure) |
| `smoke-music-page-layout.mjs` | electron | Pending/partial in batch | Prior failures were wrong runner |
| Other home/music smokes | electron | See `smoke-run-results.json` when batch completes | Selector-based; not premium visual proof |

**Important:** Running Electron smokes with `node` fails on Electron named exports under Node 24. Use `electron` binary.

## Existing but not all executed

Dozens of `validate-*-runtime.mjs`, `capture-*.mjs`, `smoke-home-*.mjs`, Playwright player-transition, probes. Mostly informal; only 4 verify scripts in `package.json`.

## Blind spots (global)

1. Static selector checks ≠ premium visual quality
2. No unified CI test runner
3. No automated a11y suite
4. Runtime smokes catalog-dependent / flaky when empty
5. Dirty uncommitted source means PASS scripts validate WIP tree, not clean HEAD alone
6. Manual multi-width playback matrix not fully instrumented in this audit beyond live app launch + catalog smoke

## TypeScript / ESLint

- `npm run build` = `tsc -b && vite build` (not executed in this audit to avoid dist writes beyond audit scope; packaging readiness inferred from config)
- `npm run lint` available; not treated as release gate evidence here
