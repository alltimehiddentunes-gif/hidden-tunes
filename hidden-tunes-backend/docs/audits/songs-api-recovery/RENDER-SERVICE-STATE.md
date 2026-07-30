# Render Service State

## Classification (proven)

**Category 11 — service intentionally suspended**

HTTP evidence against production:

```text
STATUS=503 Service Unavailable
Header: x-render-routing=suspend
Body: <title>Service Suspended</title> … This service has been suspended.
Content-Type: text/html; charset=utf-8
Server: cloudflare
```

This is a **Render platform suspend response**, not an application-generated JSON 503.

## Configuration from repo (`render.yaml`)

| Field | Value |
| --- | --- |
| Service name | `hidden-tunes-api` |
| Type | web |
| Runtime | node |
| Build | `npm install` |
| Start | `npm start` |
| Plan (blueprint) | `starter` |
| Env keys (names only) | `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_*` |

## Probe matrix (production)

| Endpoint | Status | Notes |
| --- | --- | --- |
| `/` | 503 | suspend HTML |
| `/health` | 503 | suspend HTML (`x-render-routing=suspend`) |
| `/ready` | 429 / 503 | platform gate while suspended |
| `/api/songs?q=afrobeats` | 503 | suspend HTML — no app payload |

## What was ruled out by evidence

| Hypothesis | Why ruled out |
| --- | --- |
| App crash at startup | Local start succeeds; suspend body is platform HTML |
| Wrong port binding | Code uses `process.env.PORT`; local bind works; suspend never reaches app |
| Missing env only | Would produce app crash/500 after wake — never reaches Node while suspended |
| Cold-start sleep | Wake attempt 90s still returns suspend HTML, not spinning-up behaviour |
| Admin mis-routing | Host is `hidden-tunes-api.onrender.com`; routing header confirms suspend |

## Operator action required

No `RENDER_API_KEY` / `RENDER_API_TOKEN` is available in this environment.

**Resume the `hidden-tunes-api` service in the Render dashboard** (or provide a Render API token) to clear the suspend gate. Code push alone cannot unsuspend a suspended service.
