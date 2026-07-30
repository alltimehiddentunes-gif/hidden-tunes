# Files Changed

| File | Why |
| --- | --- |
| `app/search.tsx` | Fix match-count sum; include radio/podcasts; canonical backend query; error+Retry; complete error/success atomically |
| `services/universalSearchService.ts` | Trust backend song hits even when local scorer is stricter |
| `utils/searchColdStartPolicy.ts` | Treat `radioError` as non-empty |
| `utils/globalSearchQuery.ts` | New search-boundary normalisation / aliases |
| `hooks/useDeferredSearchMediaSections.ts` | Stop converting radio failures into empty success |
| `scripts/test-mobile-search-restoration.ts` | Focused restoration tests |
| `scripts/test-main-search-cold-start.ts` | Cover radioError empty-policy |
| `docs/audits/mobile-search-restoration/*` | Audit evidence |

## Explicitly not changed

Unrelated dirty worktree items (TV playability, iOS interruption, sports audits, PlayerContext, etc.) were left untouched.
