# Deployment History

## Known from repository

- Blueprint: `hidden-tunes-backend/render.yaml` defines `hidden-tunes-api` as a Node web service (`npm install` / `npm start`, starter plan).
- Active production hostname: `https://hidden-tunes-api.onrender.com`.

## Unavailable without Render credentials

The following could **not** be read from this environment (no Render CLI / API token):

- last successful deployment SHA
- last failed deployment
- dashboard instance status beyond live HTTP probes
- memory metrics / event history

## Live observation (2026-07-30)

Production consistently returns Render suspend HTML with `x-render-routing: suspend` for health and songs search.

## Post-unsuspend checklist

1. Confirm `/health` → 200 JSON `{ status: "ok" }`
2. Confirm `/ready` → 200 JSON `{ status: "ready" }`
3. Confirm `/api/songs?q=afrobeats` → 200 array
4. Confirm mobile Search shows real results (not Retry-only)
