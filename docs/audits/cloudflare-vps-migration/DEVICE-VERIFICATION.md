# Device verification report — api.hiddentunes.com

**Date:** 2026-07-30  
**Workspace:** `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142`  
**Branch / HEAD:** `fix/library-content-type-safe` @ `6f6089c` (contains `5a41227`)  
**Phone:** iOS HiddenTunes/1.0.190 (Darwin) via Metro `:8081` on `172.20.10.6`

## Endpoint proof

| Check | Result |
| --- | --- |
| Source `HIDDEN_TUNES_API_BASE_URL` | `https://api.hiddentunes.com` |
| Metro iOS bundle | contains `api.hiddentunes.com`; **no** `hidden-tunes-api.onrender.com` |
| Runtime catalog log | `[HiddenTunes][catalog] loaded 101 songs from API (https://api.hiddentunes.com)` |
| Nginx UA | `HiddenTunes/1.0.190 CFNetwork/... Darwin/25.6.0` → `/api/songs` **200** only |

## Search matrix (physical phone)

| Query typed | Request URL (nginx) | HTTP | Backend count | Rendered songs | TTFV (ms) | Error | Retries |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Afrobeats | `/api/songs?page=1&limit=100&q=afrobeats` | 200 | 100 | 24 | 1025 / 782 | none | 0 |
| burna (~Burna Boy) | `/api/songs?...&q=burna` | 200 | 23 | 23 | 594 | none | 0 |
| shatta (~Shatta Wale) | `/api/songs?...&q=shatta` | 200 | 9 | 9 | 690 | none | 0 |
| black sherif | `/api/songs?...&q=black%20sherif` | 200 | 7 | 19* | 622 | none | 0 |

\*UI merge can include prior ranked rows; backend accepted count for `black sherif` is **7** (matches migration expectation).

First Afrobeats item family confirmed via catalogue (July 7 / Afrobeats genre rails). Exact first-row title strings were not separately scraped from FlatList.

## Tap-to-play

Proven from Search for **Black Sherif Popstar** (`afbf0bbe-…`):

- `tap_received` → player open → HiddenAudio load → `first_audio_playing` in **~172 ms**
- Metadata: title `Black Sherif Popstar`, artist `Hidden Tunes`
- Engine: `hidden_audio`; R2 MP3 URL loaded
- TV owner released when music claimed (`peer_owner_claim` / `tv_stop`)

Not separately logged for Afrobeats/Burna/Shatta taps in this session (one full song path proven).

## Stability snapshot

| Item | Observed |
| --- | --- |
| Backend search successes (session) | 17 |
| Search API errors | 0 |
| Phone `/api/songs` nginx statuses | **25 × 200**, **0 × 4xx/5xx** |
| PM2 `hidden-tunes-api` | online, 1 restart historically, ~110 MB |
| Host load | ~0.00; RAM available ~7.1 GB; disk 6% |
| Nginx error.log during device window | no new api songs errors (stale admin radio error from earlier) |
| Heat / battery / mobile-data | **Not claimed** — no instrumentation |

## Render

See `RENDER-RETIREMENT.md`. Dashboard suspend still **manual** (no API token).
