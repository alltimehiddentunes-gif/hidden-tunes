# Root Cause

## Exact cause

```text
Render service `hidden-tunes-api` is SUSPENDED
```

Proven by production HTTP response:

- Status: **503**
- Header: **`x-render-routing: suspend`**
- Body: HTML **“This service has been suspended.”**

No Node process, health handler, or songs route executes while suspended.

## Not the cause

- Empty Afrobeats catalogue (local search returns 20 hits)
- Mobile Search logic (already repaired; never receives a payload)
- Missing admin `/api/songs` routes
- Anonymous Supabase 401
- Ordinary free-tier cold start (90s wake still suspend HTML)

## Required recovery step

**Unsuspend / resume `hidden-tunes-api` in Render.**

Code hardening shipped locally (`/ready`, `0.0.0.0` bind, structured dependency 503s) improves post-resume behaviour but cannot override a platform suspend.
