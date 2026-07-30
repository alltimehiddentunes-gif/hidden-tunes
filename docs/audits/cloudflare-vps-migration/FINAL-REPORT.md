# Cloudflare + VPS Songs API Migration — Final Report

**Date:** 2026-07-30  
**Public API:** `https://api.hiddentunes.com`  
**Mobile workspace:** `D:\HiddenTunes\Active\HiddenTunes-CLEAN-1.0.142`  
**Backend workspace:** `C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend`

## Verdict

Migration complete. Public songs API is live on the owned VPS behind Cloudflare Full (strict). Mobile Search now targets `https://api.hiddentunes.com` instead of suspended Render.

## Phase results

### DNS proxy fixes (pre-NS)

| Record | Proxy |
| --- | --- |
| `ftp`, `autoconfig`, `autodiscover`, DKIM a/b/c | DNS-only |
| `@`, `admin`, `api` | Proxied |
| `www` | Left Proxied (unchanged) |

Comparison vs inventory: **PASS** (`DNS-COMPARISON-POST-PROXY-FIX.md`).

### Nameservers

| Before | After |
| --- | --- |
| `lunar.dns-parking.com` / `solar.dns-parking.com` | `sneh.ns.cloudflare.com` / `wells.ns.cloudflare.com` |

Hostinger NS swap confirmed. Cloudflare zone status: **Active**.

### Origin TLS + Cloudflare SSL

| Item | Value |
| --- | --- |
| Origin cert | Let's Encrypt `api.hiddentunes.com` (expires 2026-10-28) |
| Nginx | `/etc/nginx/sites-available/api.hiddentunes.com` → `127.0.0.1:3100` |
| Cloudflare SSL/TLS | **Full (strict)** |
| Universal SSL pack | **Active** |
| Flexible SSL | Not used |

### Public verification matrix

| URL | HTTP | JSON | CF | Render | Challenge | Secrets |
| --- | --- | --- | --- | --- | --- | --- |
| `/health` | 200 | yes | yes | no | no | no |
| `/ready` | 200 | yes | yes | no | no | no |
| `/api/songs?q=Afrobeats&limit=3` | 200 | yes | yes | no | no | no |
| `/api/songs?q=Burna%20Boy&limit=3` | 200 | yes | yes | no | no | no |
| `/api/songs?q=Shatta%20Wale&limit=3` | 200 | yes | yes | no | no | no |
| `/api/songs?q=Black%20Sherif&limit=3` | 200 | yes | yes | no | no | no |

Redirects: 0 on `/health`. TLS valid via Cloudflare edge.

### Mobile cutover

| File | Change |
| --- | --- |
| `services/hiddenTunesApi.ts` | `HIDDEN_TUNES_API_BASE_URL` + lyrics base → `https://api.hiddentunes.com` |

No changes to playback, Search UI, pagination, caching, TV, Radio, Podcasts, Audiobooks, HiddenAudio, Queue, or PlayerContext.

### Validation (mobile)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | Pre-existing `@types/node` errors in unrelated `scripts/*` only; no `hiddenTunesApi.ts` errors |
| ESLint `services/hiddenTunesApi.ts` | 0 errors (1 pre-existing unused-var warning) |
| Metro / module path | `services/hiddenTunesApi.ts` resolves; endpoint string verified |
| `test-mobile-search-restoration.ts` | ok |
| `test-main-search-cold-start.ts` | ok |
| Live Search queries via new host | 200 + results for Afrobeats / Burna Boy / Shatta Wale / Black Sherif |

Phone tap-to-play / heat / data-usage: requires device session after Metro reload; API path and JSON catalogue responses are verified from this environment.

## Commits (staged exact files only)

1. **Backend** `eddf3cc` on `feature/radio-worldwide-40k` — `infra(api): route owned API domain through Cloudflare VPS` (pushed)
2. **Mobile** `5a41227` on `fix/library-content-type-safe` — `fix(search): migrate songs API to owned domain` (pushed)
