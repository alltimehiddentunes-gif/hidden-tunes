# Backend Evidence

## Authoritative mobile music target

```text
https://hidden-tunes-api.onrender.com/api/songs?page=1&limit=<n>&q=<lowercase query>
```

Hardcoded in `services/hiddenTunesApi.ts` as `HIDDEN_TUNES_API_BASE_URL`.

## Production probes (audit window)

| Host | Path | Result |
| --- | --- | --- |
| hidden-tunes-api.onrender.com | `/api/songs?q=afrobeats` | **503** Server Unavailable |
| hidden-tunes-api.onrender.com | `/health`, `/`, HEAD | **503** |
| hidden-tunes-backend.onrender.com | health / songs | **503** |
| admin.hiddentunes.com | `/api/radio/stations?q=afrobeats` | **200**, total **63** |
| admin.hiddentunes.com | `/api/tv/videos?q=News` | **200**, total **1374** |
| admin.hiddentunes.com | `/api/songs` | **404** (not the music host) |

## Schema expectation (when healthy)

Mobile accepts any of:

- raw array
- `{ songs: [] }`
- `{ data: [] }`
- `{ tracks: [] }`
- `{ items: [] }`

via `normalizeRawSongArray`.

## Local vs production

| Concern | Finding |
| --- | --- |
| Mobile parser vs admin | Music is not on admin; mobile correctly targets Render |
| Catalogue empty? | **Not proven** — music host was unavailable (503), Radio still had Afrobeats |
| Regression class | Mobile count/error handling + backend unavailability |

## Mutation

No production data was mutated.
