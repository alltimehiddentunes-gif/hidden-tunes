# Test Results

## Validation reporting (separated)

### Search-specific checks — PASS

| Command | Exit | Verdict |
| --- | --- | --- |
| `npx tsx scripts/test-mobile-search-restoration.ts` | 0 | **PASS** |
| `npx tsx scripts/test-main-search-cold-start.ts` | 0 | **PASS** |
| `npx tsx scripts/test-search-keys-and-stale.mjs` | 0 | **PASS** |

Focused coverage includes: Afrobeat↔Afrobeats aliases, hyphen normalisation, genuine empty vs HTTP/timeout/radio-error, ASI count bug proof, stable-id dedupe, failure non-caching.

### Repository-wide `tsc --noEmit` — BASELINE FAIL

| Command | Exit | Verdict |
| --- | --- | --- |
| `npx tsc --noEmit` | 2 | **BASELINE FAIL** — known pre-existing script-side `@types/node` / `node:*` import gaps |

Delayed-job evidence also recorded a transient Search typing miss (`errors.retry`) that was **already repaired** to `common.retry` in commit **`5f8771e`**. Confirmed present on current HEAD:

```text
retryLabel: t("common.retry"),
```

Do not reopen the retry translation issue.

### New TypeScript regressions in changed application files — NONE

Filtered check against Search repair sources (`app/search.tsx`, `utils/globalSearchQuery.ts`, `services/universalSearchService.ts`, `utils/searchColdStartPolicy.ts`, `hooks/useDeferredSearchMediaSections.ts`) after the `common.retry` fix: **no Search-implementation type errors**.

Do **not** claim the Search repair introduced the script Node-typing failures. Do **not** install/alter Node typings blindly without auditing script tsconfig boundaries.

### Other repo checks

| Command | Exit | Notes |
| --- | --- | --- |
| `npm run lint` | 1 | Pre-existing repo-wide |
| `npx expo-doctor` | 1 | Pre-existing package minor mismatches |

## Live Render matrix (post delayed jobs)

| Query | HTTP | Raw count | Parsed mobile count | Extra filtering applied? |
| --- | --- | --- | --- | --- |
| Afrobeats | 503 | n/a | n/a | No payload |
| Afrobeat | 503 | n/a | n/a | No payload |
| Burna Boy | 503 | n/a | n/a | No payload |
| Shatta Wale | 503 | n/a | n/a | No payload |
| Black Sherif | 503 | n/a | n/a | No payload |

## Retry translation

| Item | Status |
| --- | --- |
| Earlier `errors.retry` defect | Resolved |
| Correct key | `common.retry` |
| Commit | `5f8771e` |
| Reopen? | **No** |

## Final wording anchors

- The earlier Search retry typing defect is resolved.
- Public music Search remains owned by the Render songs API.
- Anonymous Supabase REST probing is not a valid catalogue-availability test.
- Repository-wide TypeScript remains blocked only by documented pre-existing script Node-typing gaps, unless new evidence proves otherwise.
