# Search Audit

## Owners

- Global: `src/lib/search/useGlobalDesktopSearch.ts` + `DiscoverPage` in `App.tsx`
- Music page search: catalog `searchMusicSongsPage` / section content
- Family pages: per-destination hooks (radio/tv/podcasts/etc.)

## Complete

- Global debounce ~250ms
- Per-family AbortController + request generation stale guards
- Grouped multi-family Discover sections
- `verify-global-search-contract.mjs` — PASS

## Partial / needs work

- Podcasts in global search are shows-oriented (episodes weaker)
- Lectures path partially separate (`useDiscoverLectureSearch`)
- Parallel family fan-out can spike latency
- Music Discover vs global Discover are different UX surfaces

## Family search readiness

| Area | Status |
|------|--------|
| Global Discover | Mostly complete |
| Music | Mostly complete |
| Radio | Mostly complete (280ms debounce) |
| TV | Mostly complete |
| Podcasts | Mostly complete browse search |
| Sports | Present in global + page filters |
| Library/Playlists/Downloads | Included in global |

## Verdict

Search is functionally one of the more complete systems. Performance under large catalogues and episode-level podcast search remain polish/risk items, not total gaps.
