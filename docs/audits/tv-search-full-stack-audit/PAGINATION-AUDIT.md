# Pagination Audit

## Backend

| Item | Finding |
| --- | --- |
| Default page size | 20 (API), mobile search uses 24 |
| Max page size | 50 (API); mobile clamps ≤40 |
| Exact total | **Not computed** — uses `limit+1` hasMore sentinel |
| `pagination.total` | Synthetic lower bound, easy to misread as catalogue size |
| Query retained across pages | Yes — `q` / `country` / filters re-sent each page |
| Overlap across MTV pages | **0** id overlap (healthy) |
| News full walk | 438 unique; hasMore becomes false on final page |

## Mobile

| Item | Finding |
| --- | --- |
| Resets to page 1 on query change | Yes |
| Load more uses `searchPage + 1` + same query | Yes |
| Appends + id dedupe | Yes |
| Stops when `!hasMore` | Yes |
| Transient load-more failure sets `hasMore=false` | Yes — can strand pagination until new query (pre-existing) |
| Search UI shows all loaded rows | Yes — virtualized grid, not 8-card lane preview |
| Infinite scroll | `onEndReached` + explicit “Load more stations” |

## Required behaviour status

| Requirement | Status |
| --- | --- |
| Search hits production backend | Pass |
| Not local-only card filter | Pass |
| Later pages reachable | Pass when `hasMore` true |
| Dedup by canonical id | Pass |
| Query change clears old pages | Pass |
| Truthful totals | **Fail / misleading** on backend `total` field (not used as hard stop on mobile) |
