# Test Results

## Commands run

| Command | Exit | Notes |
| --- | --- | --- |
| `npx tsx scripts/test-mobile-search-restoration.ts` | 0 | PASS |
| `npx tsx scripts/test-main-search-cold-start.ts` | 0 | PASS |
| `npx tsx scripts/test-search-keys-and-stale.mjs` | 0 | PASS |
| `npm run lint` | 1 | Pre-existing repo-wide (254 problems). Focused Search files retain prior `Date.now` / setState-in-effect warnings; Retry/count fix did not introduce new design-system violations. |
| `npx tsc --noEmit` | 2 | Pre-existing script `@types/node` gaps elsewhere. Filtered check: **no errors** in Search repair source files after `common.retry` fix. |
| `npx expo-doctor` | 1 | Pre-existing package minor mismatches (`react-native-screens`, `expo-web-browser`). |

## Live probes (post-repair)

| Target | Result |
| --- | --- |
| Music `hidden-tunes-api.onrender.com` Afrobeats | Still **503** |
| Radio `admin.hiddentunes.com` afrobeats | **200** |

## Coverage mapped to required cases

| # | Case | Status |
| --- | --- | --- |
| 1 | Afrobeats alias / trusted parsing | Covered via query + policy tests; live music API was 503 |
| 2 | Afrobeat ↔ Afrobeats | PASS |
| 3 | Hyphen/space | PASS (`Al-Jazeera`) |
| 4 | Country free-text preserved | PASS |
| 5–9 | Loading / empty / HTTP / timeout / abort policy | PASS via `shouldShowGenuineZeroMatches` |
| 10 | Newer query wins | Existing request-id + abort pattern retained |
| 11 | Empty failure not cached | PASS |
| 12 | Pagination retains query | Existing radio/TV paths unchanged |
| 13–14 | Stable-ID dedupe | PASS |
| 15–18 | Playback owners | No playback owner changes |
| 19–20 | Clear / retry | Retry added; clear retained |
