# P1-1 — Production Catalog Clearance

Date: 2026-08-07

## Root cause

The Desktop product was healthy. Two legacy audit scripts still targeted the retired hostname `hidden-tunes-api.onrender.com`.

| Field | Failed legacy request | Authoritative production request |
|---|---|---|
| Endpoints | `/health`, `/api/artists`, `/api/albums` | same |
| Method | GET | GET |
| Status | 503 | 200 |
| Content-Type | `text/html; charset=utf-8` | `application/json; charset=utf-8` |
| Body type | Cloudflare HTML error | structured JSON |
| Deployment host | `hidden-tunes-api.onrender.com` | `api.hiddentunes.com` |
| Runtime owner | retired/stale Render hostname behind Cloudflare | Express catalog service behind Cloudflare |
| Deployment SHA | not exposed by health response | not exposed by health response |
| Upstream | unavailable retired service | Supabase-backed Express catalog |
| Failure stage | edge/upstream availability before application route | none |

`admin.hiddentunes.com` was also probed and returned HTML 404 for these list routes; it is the admin/multi-family host, not the Express music-list owner.

## Smallest repair

- Updated only stale audit defaults and stale documentation to `https://api.hiddentunes.com`.
- Corrected the renderer diagnostic warning that still named Render.
- Did not modify Artist UI, Album UI, Express routes, protected upload routing, R2, or production metadata.

## Production proof

Evidence: `docs/audits/production-music-relationships.json`

- Health: 200 JSON.
- Artists: 40 fetched; first 20 audited.
- Albums: 40 fetched; first 20 audited.
- Songs: 2,732 fetched; 2,732 playable.
- False-zero Artists: 0.
- False-zero Albums: 0.
- HTML API responses on authoritative host: 0.
- Five media byte probes: 5/5 returned HTTP 206 `audio/mpeg`.

## Verdict

P1-1 CLEAR.
