# Request Lifecycle

## Rules enforced after repair

1. Debounce: `SEARCH_BACKEND_DEBOUNCE_MS` (300ms).
2. Latest request id wins; cleanup aborts prior controller.
3. `softEmptyOnError: false` on main Search music requests.
4. AbortError does not set error or complete into `0 matches`.
5. Success and failure both set `backendSearchCompletedQuery` in the **same** state update as songs/error (no false empty window).
6. Failures are not written into `backendSearchCacheRef`.
7. Retry clears the cache key and re-submits the query.
8. Radio transport failures set `radioError` instead of empty success.
9. `shouldShowGenuineZeroMatches` requires no backend error, no radio error, not pending, not loading media, and zero total results.

## Debounce / cancellation

| Source | Debounce | Cancel |
| --- | --- | --- |
| Music backend | 300ms | AbortController + request id |
| External free music | 650ms | AbortController |
| Radio / Podcasts | 900ms defer | generation bump |
| TV | immediate when query ≥ 2 | AbortController |
