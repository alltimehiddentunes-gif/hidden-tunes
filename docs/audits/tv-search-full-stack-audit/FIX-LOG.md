# Fix Log

## Scope decision

- Repaired **mobile only** in the protected workspace.
- Did **not** modify backend, desktop, production data, or deploy.
- Backend/DB gaps that omit brands from the eligible API remain unresolved pending approval.

## Files changed

| File | Change |
| --- | --- |
| `utils/tvSearchQuery.ts` | **New** — `normalizeTvSearchQuery`, `resolveTvSearchCountryCode` |
| `services/tvCatalogApi.ts` | Search uses normalised query; optional country filter merge; surfaces `error` instead of fake empty success; cache key includes country code |
| `app/youtube-feed.tsx` | Truthful search error + Retry; empty copy uses “No TV channels match …” |
| `scripts/test-tv-search-coverage.ts` | **New** focused contract + production probes |
| `docs/audits/tv-search-full-stack-audit/*` | Audit evidence pack |

## Intentionally untouched

- `context/TvPlaybackContext.tsx` / HiddenAudio / PlayerContext / Queue (except pre-existing dirty work preserved)
- Desktop SSD TV UI
- Backend routes on laptop or SSD
- Discover `SEARCH_TV_LIMIT=8` preview cap
- Radio / Podcasts / Music / Sports / Library / Downloads

## Safety

No `git reset/clean/stash/rebase/commit/push`, no branch switch, no deploy, no DB mutation.
