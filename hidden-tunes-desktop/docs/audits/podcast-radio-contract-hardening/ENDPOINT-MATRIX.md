# Podcast & Radio — Production Endpoint Matrix

Date: 2026-07-22  
Desktop workspace: `C:\Users\Wills\Desktop\HiddenTunes-desktop-integration`  
Branch: `desktop/integrate-home-music-split`  
Catalog base: `https://admin.hiddentunes.com`  
Music API base (unchanged): `https://hidden-tunes-api.onrender.com`

Probe script: `hidden-tunes-desktop/scripts/probe-podcast-radio-contracts.mjs` (24/24 expectations met).

## Podcast

| Concern | CLEAN mobile | Desktop (before) | Desktop (after) | Same contract? | Gap / notes |
| --- | --- | --- | ---: | --- | --- |
| Catalog host | `admin.hiddentunes.com` | same | same | Yes | — |
| Home | Local recently played + category chips; no global episode list | Called unscoped `GET /api/podcasts/episodes` | Categories + featured/fallback shows only | **Fixed** | Unscoped episodes **500** (statement timeout) |
| Featured shows | Featured endpoint / local seeds | `GET /api/podcasts/featured` | same | Yes | Production featured `total=0`; desktop falls back to shows |
| Show search | Local seed search + backend category | `GET /api/podcasts/shows?q=` | same | Mostly | Desktop uses backend `q=` |
| Episode by show | `show_id` required | show detail uses `show_id` | same | Yes | OK (~200ms) |
| Episode by category | `category=` | Was paired with `q=` on browse | Category-scoped only | **Fixed** | `q=`-only episodes **500** |
| Episode play | `GET /episodes/{id}/play` | same | same | Yes | Returns HTTPS audio URL |
| Abort / cancel | AbortError treated as cancel | Bridge labeled abort as timeout | External abort → AbortError; timeout → timeout message | **Fixed** | — |
| Progress / resume | Local | `ht-desktop:podcast-*` | unchanged | Yes | — |
| Favorites | Follows / saved episodes | None | None | No | P2 / Library task |

### Podcast probe samples

| Path | Status | Time | Notes |
| --- | ---: | ---: | --- |
| `/api/podcasts/categories` | 200 | ~0.5s | 10 categories |
| `/api/podcasts/featured?page=1&limit=12` | 200 | ~0.3s | total=0 |
| `/api/podcasts/shows?page=1&limit=24` | 200 | ~0.2s | total≈2367 |
| `/api/podcasts/shows?q=jazz` | 200 | ~0.2s | 3 shows |
| `/api/podcasts/episodes?page=1&limit=8` | **500** | ~8s | statement timeout — **do not call** |
| `/api/podcasts/episodes?q=jazz` | **500** | ~8s | statement timeout — **do not call** |
| `/api/podcasts/episodes?category=music` | 200 | ~0.5s | OK |
| `/api/podcasts/episodes?show_id=…` | 200 | ~0.2s | OK |
| `/api/podcasts/episodes/{id}/play` | 200 | ~0.2s | playable HTTPS |
| Invalid show UUID | 404 | — | OK |

## Radio

| Concern | CLEAN mobile | Desktop (before) | Desktop (after) | Same contract? | Gap / notes |
| --- | --- | ---: | ---: | --- | --- |
| Catalog host | `admin.hiddentunes.com` | same | same | Yes | — |
| Browse | Paginated stations, limit bounded | `limit≤32–40` page 1 | same | Yes | No UI load-more yet (P2) |
| Search | `q=` + `include_stream=1`; client mature filter | `q=` only | `q=` + client mature filter | Mostly | Desktop still resolves play via `/play` (correct) |
| Play | `/stations/{id}/play`; HTTPS only on mobile | Accepts any `http*` from `/play` | same | Yes | Relay returns **HTTPS** `/relay?token=` |
| Relay | Server-side in `/play` `delivery=relay` | Already accepted | Confirmed | Yes | Desktop does **not** pre-filter HTTP stations before `/play` |
| Mature params | **Must not** send `includeMature`+`age_confirmed` together | Did not send | Did not send | Yes | Client-side exclude `is_mature` |
| Mature UI / age gate | Settings + consent | None | Exclude from default browse/search | Partial | Full mature browse deferred |
| Favorites / history | Typed `radio_station` library | None visible | None | No | No dead favorite control to remove |
| Abort | AbortController on search | requestId only | AbortController + cancel ignore | **Fixed** | — |

### Radio probe samples

| Path | Status | Notes |
| --- | ---: | --- |
| `/api/radio/stations?page=1&limit=32` | 200 | total≈35077; page size 32 |
| `/api/radio/stations?page=2&limit=32` | 200 | pagination works |
| `/api/radio/stations?q=bbc` | 200 | 36 hits |
| `/api/radio/stations?q=Sex%20Sound%20Radio` | 200 | 1 hit, `is_mature=true`, `content_rating=adult` |
| `/api/radio/stations/{sexId}/play` | 200 | `delivery=direct`, HTTPS stream |
| Sample browse `/play` | 200 | `delivery=relay` → `https://admin.hiddentunes.com/.../relay?token=…` |
| Invalid station `/play` | 404 | OK |

## Sex Sound Radio (exact)

| Field | Value |
| --- | --- |
| Backend name | **Sex Sound Radio** (not “Sex Sounds”) |
| ID | `57dc7376-7cad-4c53-a272-951180a7615f` |
| Exists | Yes |
| `is_mature` | `true` |
| `content_rating` | `adult` |
| Categories | mature, adult, asmr, erotic, explicit |
| Verified / playable list fields | not populated on list payload |
| `/play` | 200, `delivery=direct`, `https://sexsoundradio.com:8000/radio.mp3` |
| General search (`q=sex`) | Appears in backend results among non-mature hits |
| Desktop default search | **Excluded** by client mature filter |
| Mobile default | Excluded unless mature settings enabled |

## Backend blockers (not fixable from desktop)

1. `GET /api/podcasts/episodes` without `show_id` or `category` → **500 statement timeout**
2. `GET /api/podcasts/episodes?q=…` → **500 statement timeout**
3. `GET /api/podcasts/featured` returns empty catalog (`total=0`)
4. `GET /api/radio/stations?featured=true` returns empty (`total=0`)
