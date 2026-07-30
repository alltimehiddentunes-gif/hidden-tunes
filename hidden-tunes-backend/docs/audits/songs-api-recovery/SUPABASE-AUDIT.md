# Supabase Audit

## Intended authentication

| Item | Value |
| --- | --- |
| Client | `@supabase/supabase-js` createClient |
| File | `services/supabase.js` |
| URL env | `SUPABASE_URL` |
| Key env | `SUPABASE_SERVICE_ROLE_KEY` |
| Session | `persistSession: false`, `autoRefreshToken: false` |

## Local `.env` (names only)

Both variables are **present** in `hidden-tunes-backend/.env` (values not logged).

## Behaviour

- Missing either variable → process throws at import (does not silently serve empty catalogue).
- Search uses service-role server-side only.
- Mobile does **not** receive the service-role key.

## Probes

| Probe | Result | Meaning |
| --- | --- | --- |
| Local `/ready` | 200 | Supabase reachable with local credentials |
| Local Afrobeats search | 200, count 20 | `songs` table readable |
| Anonymous public REST | 401 (prior audit) | Expected without key — not catalogue-empty proof |

## Safety

- RLS not weakened
- Service-role key not exposed to mobile
- Secrets not written into docs
