# Files Changed

| File | Why |
| --- | --- |
| `hidden-tunes-backend/server.js` | Add lightweight `GET /ready`; bind listen to `0.0.0.0`; keep `/health` catalogue-free |
| `hidden-tunes-backend/routes/songs.js` | Map retryable Supabase/transport failures to structured `503 service_unavailable` (not empty `[]`) |
| `hidden-tunes-backend/docs/audits/songs-api-recovery/*` | Audit evidence |

## Not changed

- Mobile Search (`HiddenTunes-CLEAN-1.0.142`) — preserved
- Admin backend as music fallback — not used
- Supabase RLS / service-role exposure — unchanged
- Unrelated monorepo dirty files — not staged
