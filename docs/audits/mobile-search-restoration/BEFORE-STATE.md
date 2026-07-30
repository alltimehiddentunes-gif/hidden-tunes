# Before State

## Screenshot symptom (user-reported)

```text
Query: Afrobeats
Visible result: 0 matches
```

UI showed the Search page with the query `Afrobeats` and the result summary title rendered as `0 matches`.

## Why this was not accepted as an empty catalogue

1. Afrobeats is a trending chip on the same Search screen.
2. Production Radio search for `afrobeats` returned **63** stations from `admin.hiddentunes.com`.
3. Hidden Tunes previously shipped working Afrobeats catalogue search against `hidden-tunes-api.onrender.com`.
4. A transport or count bug can render `0 matches` without a genuine empty backend payload.

## Network probes during audit

### Music API (`hidden-tunes-api.onrender.com`)

| Query | Status | Notes |
| --- | --- | --- |
| Afrobeats | 503 | Persistent Server Unavailable |
| Afrobeat | 503 | Same host down |
| Subsequent queries | 429 / 503 | Rate limit after repeated probes |

Music catalogue search target used by mobile:

```text
GET https://hidden-tunes-api.onrender.com/api/songs?page=1&limit=100&q=<query>
```

No auth headers.

### Admin API (`admin.hiddentunes.com`)

| Endpoint | Query | Status | Count |
| --- | --- | --- | --- |
| `/api/radio/stations` | afrobeats | 200 | 63 total |
| `/api/tv/videos` | News | 200 | 1374 total |
| `/api/tv/videos` | Al Jazeera | 200 | 29 total |
| `/api/tv/videos` | Al-Jazeera | 200 | 29 total |
| `/api/tv/videos` | South Africa | 200 | 44 total |
| `/api/tv/videos?country=ZA` | — | 200 | 19 total |
| `/api/songs` | Afrobeats | 404 | Not hosted here |

## Mobile UI implication before repair

Even when Radio returned stations for Afrobeats, the header could still show `0 matches` because `apkResultCount` lacked `+` operators (ASI → songs-only count).
