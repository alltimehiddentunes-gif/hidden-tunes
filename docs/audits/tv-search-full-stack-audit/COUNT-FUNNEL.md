# Count Funnel

## Example A — `q=BBC` (title search)

| Stage | Count |
| --- | ---: |
| Database/API eligible matches (`/api/tv/videos?q=BBC`) | 20 |
| API payload `videos` | 20 |
| Parsed / normalised (id+title) | 20 |
| Mobile quality filter (`filterPublicTvCatalogVideos`) | 20 (0 dropped in simulation) |
| Deduplicated by id | 20 |
| Rendered (page 1, limit 24) | 20 |

## Example B — `q=South Africa` before repair

| Stage | Count |
| --- | ---: |
| Eligible ZA stations (`country=ZA`) | 19 |
| API `q=South Africa` | **0** |
| Mobile rendered | **0** |
| Loss layer | Backend stores ISO `region`; free-text name never matches |

## Example B — after mobile country-name repair

| Stage | Count |
| --- | ---: |
| Text `q=South Africa` | 0 |
| Country filter `country=ZA` | 19 |
| Merged unique | 19 |
| Rendered | 19 |

## Example C — `q=Al-Jazeera` before / after normalize

| Stage | Before | After normalize → `Al Jazeera` |
| --- | ---: | ---: |
| API matches | 0 | 10 |
| Rendered | 0 | ≤10 on page 1 |

## Example D — `q=News` pagination

| Stage | Count |
| --- | ---: |
| Page 1 payload | 40 |
| Misleading `pagination.total` field | 41 (sentinel, not true total) |
| All pages unique | **438** |
| Mobile if user never loads more | 24 (`TV_SEARCH_PAGE_LIMIT`) then grows via Load more / onEndReached |

## Example E — brands missing entirely from eligible API

`NHK`, `Cartoon Network`, `DSTV`, `SuperSport`, `Mzansi Magic`, `BBC One`, `CNN International`:

| Stage | Count |
| --- | ---: |
| API matches | 0 |
| Mobile rendered | 0 |
| Loss layer | Not returned by production public catalogue (import / health / eligibility) — **not a mobile parser drop** |
