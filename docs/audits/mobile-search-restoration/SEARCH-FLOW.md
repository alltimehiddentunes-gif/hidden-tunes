# Search Flow

```text
Search input (DebouncedSearchInput)
→ local query state (searchQuery)
→ debounce → submittedSearchQuery
→ resolveGlobalSearchBackendQuery (aliases / hyphen normalisation)
→ AbortController + request id (latest query wins)
→ searchHiddenTunesSongs → GET hidden-tunes-api.onrender.com/api/songs?q=
→ normalizeRawSongArray → HiddenTunesNormalizedSong[]
→ buildTrustedBackendSongHits (must retain API hits)
→ merge with local catalog (runUniversalCatalogSearch)
→ TV fetchTvSearchVideos (admin)
→ deferred Radio loadRadioSearchPage (admin)
→ deferred Podcasts searchPodcasts (local/service)
→ apkResultCount (all groups summed)
→ cards + Play / navigation via existing owners
```

## Files involved

| Layer | File |
| --- | --- |
| Route / UI | `app/search.tsx` |
| Input debounce | `components/search/DebouncedSearchInput.tsx` |
| Query boundary | `utils/globalSearchQuery.ts` |
| Music API | `services/hiddenTunesApi.ts` |
| Local / trusted merge | `services/universalSearchService.ts` |
| Cold-start / empty policy | `utils/searchColdStartPolicy.ts` |
| Radio defer | `hooks/useDeferredSearchMediaSections.ts` |
| Podcasts defer | `hooks/useDeferredSearchPodcastSections.ts` |
| TV | `services/tvCatalogApi.ts` |
| Ranking | `utils/searchRanking.ts`, `utils/catalogSongRanking.ts`, `utils/searchApkParity.ts` |

## Endpoint model

- **Music**: one global backend endpoint (`/api/songs?q=`) plus local cached catalogue filter.
- **TV / Radio**: separate admin endpoints.
- **Podcasts**: deferred local/service search.
- **Not** Supabase-direct from the Search screen.
- Auth: unauthenticated public JSON fetch for music search.
