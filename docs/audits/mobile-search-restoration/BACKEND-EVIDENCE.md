# Backend Evidence

## Authority matrix (corrected)

| Domain | Authoritative host | Notes |
| --- | --- | --- |
| **Music / songs search** | `https://hidden-tunes-api.onrender.com` | Hardcoded in `services/hiddenTunesApi.ts` as `HIDDEN_TUNES_API_BASE_URL` |
| **TV catalogue** | `https://admin.hiddentunes.com` | `TV_CATALOG_BASE_URL` → `/api/tv/videos` (probed **200**) |
| **Radio catalogue** | `https://admin.hiddentunes.com` | `RADIO_CATALOG_BASE_URL` → `/api/radio/stations` (probed **200**) |
| **Supabase** | `kojcyswxfuikxmqntwye` | Datastore / authenticated service — **not** an anonymous public songs API |

### Explicit non-authority claims

- Public song/music search is **not** served by `https://admin.hiddentunes.com`.
- The admin backend currently exposes internal song-admin and lyrics-related routes only.
- Missing admin `/api/songs?q=` routes are **not** the root cause of mobile music Search failure.
- Mobile song search must **not** be redirected to the admin backend.

## Delayed-job evidence (songs API source / Supabase)

| Probe | Result | Interpretation |
| --- | --- | --- |
| Admin `app/api` song routes | Internal admin/lyrics/emotional-analysis routes only | Confirms admin ≠ public music search |
| Supabase REST `https://kojcyswxfuikxmqntwye.supabase.co/rest/v1/` without key | **HTTP 401 Unauthorized** | Unauthenticated probe only — **not** proof that song rows are absent |
| Privileged Supabase key in mobile | Not used / must not be exposed | Correct |

## Authoritative mobile music URL

```text
GET https://hidden-tunes-api.onrender.com/api/songs?page=1&limit=<n>&q=<urlencoded lowercase query>
```

Built in `searchHiddenTunesSongs` (`services/hiddenTunesApi.ts`):

```text
HIDDEN_TUNES_API_BASE_URL + "/api/songs?page=1&limit=" + limit + "&q=" + encodeURIComponent(cleanQuery)
```

Main Search calls this with:

- `softEmptyOnError: false`
- `limit: 100` (`SEARCH_BACKEND_RESULT_LIMIT`)
- cold-start timeouts: 12s then 28s
- `bypassCooldown: true` when not soft-empty

## Direct Render probes (required query matrix)

Audit window re-probe after delayed jobs. All used `page=1&limit=20` and lowercase `q` (matches mobile `trim().toLowerCase()` + `encodeURIComponent`).

| Query | Exact URL | Status | MS | Raw count | Sample titles | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Afrobeats | `.../api/songs?page=1&limit=20&q=afrobeats` | **503** | 529 | n/a | n/a | Server Unavailable — no body to parse |
| Afrobeat | `.../api/songs?page=1&limit=20&q=afrobeat` | **503** | 163 | n/a | n/a | Same |
| Burna Boy | `.../api/songs?page=1&limit=20&q=burna%20boy` | **503** | 149 | n/a | n/a | Same |
| Shatta Wale | `.../api/songs?page=1&limit=20&q=shatta%20wale` | **503** | 151 | n/a | n/a | Same |
| Black Sherif | `.../api/songs?page=1&limit=20&q=black%20sherif` | **503** | 149 | n/a | n/a | Same |
| Afrobeats (90s wake) | same as first | **503** | 279 | n/a | n/a | Not a cold-wake delay; hard unavailable |

### Parsed mobile count / additional filtering

While Render returns **503**, there is **no successful payload** to parse. When healthy, mobile applies:

1. `normalizeRawSongArray` — accepts array / `songs` / `data` / `tracks` / `items`
2. `normalizeHiddenTunesSong` + artwork fallbacks
3. `buildTrustedBackendSongHits` — ranks locally but **retains** API rows even if local scorer is stricter (repair in `5f8771e`)
4. Merge with local catalogue / radio / TV / podcasts for the visible match count

Transport failures are **not** cached as `[]` (`shouldCacheBackendSearchResult(true) === false`; Search uses `softEmptyOnError: false`).

## Schema expectation (when healthy)

Mobile accepts any of:

- raw array
- `{ songs: [] }`
- `{ data: [] }`
- `{ tracks: [] }`
- `{ items: [] }`

## Mutation / secrets

- No production data mutated.
- No Supabase key weakened or shipped in mobile.
- No redirect of public music search to admin.
