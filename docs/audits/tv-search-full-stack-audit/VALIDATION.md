# Validation

## Focused test

```text
npx tsx scripts/test-tv-search-coverage.ts
→ test-tv-search-coverage: PASS
```

Covers: hyphen normalisation, country-name → ISO, production probes for `Al-Jazeera` / `South Africa` / `News` page 2.

## Typecheck

```text
npx tsc --noEmit
```

- Exit code: non-zero
- Pre-existing: many `scripts/*` lack `@types/node` (`node:assert/strict`)
- New script follows the same existing script pattern
- **No new errors** in `utils/tvSearchQuery.ts`, `services/tvCatalogApi.ts`, or `app/youtube-feed.tsx`

## Lint

```text
npm run lint
```

- Exit code: non-zero
- Aggregate: **261 problems (163 errors, 98 warnings)** — pre-existing project debt
- Scoped eslint on changed files: pre-existing `react-hooks/set-state-in-effect` / refs patterns in `youtube-feed.tsx`; no new dependency upgrades

## expo-doctor

Not required for this JS-only search contract repair; not run in this pass.

## Manual production API checks (read-only)

- `/api/tv/videos` pagination walk ≥1500 unique with hasMore still true
- `q=News` full walk = 438 unique
- Country name vs ISO proven
- Hyphen vs spaced title proven

## Remaining unresolved (needs approval)

- Backend/DB: missing eligible rows for NHK, Cartoon Network, DSTV, SuperSport, etc.
- Backend: align `/api/tv/search` field coverage with `/api/tv/videos?q=`
- Backend: country-name resolution server-side + honest totals
- Deploy required for any backend fix
