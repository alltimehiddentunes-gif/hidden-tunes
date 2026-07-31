# Mobile TV Search Path

## Owner map

| Concern | File | Symbol |
| --- | --- | --- |
| TV screen | `app/youtube-feed.tsx` | default export |
| Search input | `app/youtube-feed.tsx` | `query` / `setQuery` |
| Debounce | `app/youtube-feed.tsx` | 320ms timeout |
| Search API | `services/tvCatalogApi.ts` | `fetchTvSearchPage` |
| Browse/search HTTP | `services/tvCatalogApi.ts` | `fetchTvCatalog` → `/api/tv/videos` |
| Normaliser | `services/tvCatalogApi.ts` | `normalizeTvCatalogVideo` |
| Eligibility filter | `utils/tvPlayabilityGate.ts` → `utils/tvCatalogQuality.ts` | `filterPublicTvCatalogVideos` |
| Dedup | id-based in filter + load-more merge | `video.id` |
| Memory cache | `services/tvCatalogApi.ts` | `tvSearchMemoryCache` (non-empty only) |
| Playback | `services/videos/openVideoItem.ts` + `context/TvPlaybackContext.tsx` | existing TV owner |
| Discover global TV slice | `app/search.tsx` | `SEARCH_TV_LIMIT = 8` |

## Flow

```text
TV search input (youtube-feed)
→ trim length >= 2
→ debounce 320ms + AbortController + request id
→ fetchTvSearchPage(query)
   → normalizeTvSearchQuery (hyphen/underscore → space)
   → optional resolveTvSearchCountryCode (exact country name → ISO)
   → GET /api/tv/videos?q=…&page&limit&platform
   → optional GET /api/tv/videos?country=ISO&page&limit&platform
   → merge by canonical id
→ filterPublicTvCatalogVideos (playable gate; production rows already public-eligible)
→ setSearchResults / hasMore
→ virtualized grid rows (all loaded results, not 8-preview lane cap)
→ onEndReached / Load more → page+1 same query
→ card press → openVideoItemWithAlert → TvPlaybackContext
```

## Important facts

- Mobile does **not** search only locally loaded cards.
- Mobile does **not** call `/api/tv/search`; it uses the broader `/api/tv/videos?q=` contract.
- Page size: `TV_SEARCH_PAGE_LIMIT = 24` (clamped ≤ 40).
- Discover (`app/search.tsx`) intentionally caps TV hits at **8** — separate from TV destination search.
