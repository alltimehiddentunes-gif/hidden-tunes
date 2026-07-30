# Startup Audit

## Trace

```text
node server.js
→ dotenv.config()
→ import routers (includes services/supabase.js)
→ createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)  [throws if missing]
→ express app wiring
→ GET / and GET /health (lightweight)
→ GET /ready (added: lightweight songs id probe)
→ app.listen(PORT, "0.0.0.0")
```

## Findings

| Check | Result |
| --- | --- |
| Uses `process.env.PORT` | Yes (`PORT \|\| 4000`) |
| Listens on all interfaces | Yes after repair (`0.0.0.0`) |
| Full catalogue preload at startup | No |
| Health depends on catalogue | No (`/health` is process-only) |
| Missing env behaviour | Throws at import if Supabase vars absent (fail-fast) |
| Synchronous unbounded startup query | No |

## Local startup

- Startup: success in ~1–3s
- Working set ≈ 80 MB after searches
- `/health` 200, `/ready` 200 (~371ms), Afrobeats search 200

## Production

Process never starts while Render leaves the service **suspended**.
