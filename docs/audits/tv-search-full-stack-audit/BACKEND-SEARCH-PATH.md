# Backend TV Search Path

## Endpoints

| Path | Role | Search fields |
| --- | --- | --- |
| `GET /api/tv/videos` (+ `/channels`, `/stations` aliases) | Browse + free-text `q` | `title`, `channel_name`, `category`, `genre`, `mood`, `format`, `language`, `region`, `tags` |
| `GET /api/tv/search` | Dedicated search | **`title`, `channel_name` only** |
| `GET /api/tv/categories` | Category list | n/a |
| `GET /api/tv/videos/{id}/play` | Stream resolve | n/a |

## Eligibility (server)

`applyTvPublicCatalogFilters` requires:

- `status = approved`
- `is_active = true`
- `playback_status = playable`
- `reliability_score >= threshold`
- `disabled_at` / `quarantined_at` null
- `last_health_checked_at` within 7 days
- platform playable + `stream_is_https`
- optional mature isolation when enabled

## Pagination contract (production-proven)

Browse/search list uses **limit+1 sentinel**, not exact SQL count:

```text
total ≈ from + pageRows + (hasMore ? 1 : 0)
```

So page-1 `total: 41` with `limit: 40` means “at least one more page”, **not** “41 channels in the catalogue”.

Walking `/api/tv/videos` without filters produced **≥1500** unique eligible ids across 30 pages with `hasMore` still true.

Walking `q=News` produced **438** unique ids across 11 pages.

## Country storage

Public rows expose `country` as **ISO codes** (e.g. `ZA`, `VE`, `US`).  
`country=` filter ILIKEs `region`.  
Free-text `q=South Africa` therefore returns **0** while `country=ZA` returns the ZA set.

## Source files (laptop + SSD copies)

- `hidden-tunes-admin/app/api/tv/videos/route.ts`
- `hidden-tunes-admin/lib/tvSearch.ts`
- `hidden-tunes-admin/lib/tvPlatformPolicy.ts`
- `hidden-tunes-admin/lib/tvCatalog.ts`
