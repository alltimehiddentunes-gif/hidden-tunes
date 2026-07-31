# Search Unification

## Authoritative path (intended)

```text
All clients
→ admin.hiddentunes.com
→ /api/tv/videos or /api/tv/channels (same handler)
→ applyTvPublicCatalogFilters on tv_videos
→ shared text search fields
→ paginated eligible results
→ existing /play owner
```

## Local state after this phase

| Layer | Unification status |
| --- | --- |
| Production DB | Already one table |
| Laptop admin code | videos+search share `tvPublicSearchQuery` (undeployed) |
| SSD admin code | Still old narrow `/api/tv/search` implementation |
| Mobile client | Uses `/api/tv/videos?q=` + hyphen/country helpers |
| Desktop client | **Now** uses `/api/tv/channels?q=` + same helpers (was `/api/tv/search`) |

## Still fragmented until

1. Deploy laptop admin search parity to production.
2. Approved health revalidation for playable-but-stale rows (or explicit policy change — not done).
3. Optional: sync SSD admin copy to laptop TV search files (do not wholesale overwrite trees).
