# Hidden Tunes Render songs API — retirement

**Date:** 2026-07-30  
**Production songs API:** `https://api.hiddentunes.com` (VPS + Cloudflare Full strict)  
**Retired hostname:** `https://hidden-tunes-api.onrender.com`

## Code status

| Client | Status |
| --- | --- |
| Mobile `services/hiddenTunesApi.ts` | Points at `api.hiddentunes.com` (`5a41227`) |
| Desktop `hidden-tunes-desktop/src/lib/api.ts` | Points at `api.hiddentunes.com` |
| Backend `render.yaml` `hidden-tunes-api` | Marked **RETIRED** — do not redeploy |

## Manual Render dashboard action still required

No Render API token is available in this environment. Operator must:

1. Sign in at https://dashboard.render.com/
2. Open service **`hidden-tunes-api`** (songs/catalog Node service only)
3. Suspend or delete **that service only**
4. Do **not** delete `hidden-tunes-audio-worker` or any unrelated Render service
5. Do **not** delete Supabase / R2 credentials from password managers or VPS `.env`
6. Leave git history and this document for rollback

## Rollback (emergency)

1. Re-point `HIDDEN_TUNES_API_BASE_URL` / desktop `API_BASE_URL` to a live host only if VPS is down  
2. Preferred rollback is restore VPS/PM2/nginx/Cloudflare — not Render  
3. If Render must be temporarily revived: unsuspend `hidden-tunes-api`, redeploy from historical `render.yaml`, then reverse client URLs — last resort only

## Unrelated Render references (do not touch)

- `app/admin/upload.tsx` → `hidden-tunes-backend.onrender.com` (different service)
- Third-party stream URLs in admin TV/radio audit JSON (`livehub-voidnet.onrender.com`, etc.)
- Historical audit docs under `docs/audits/mobile-search-restoration/`
- Probe scripts under `scripts/probe-*` and `scripts/test-home-mood-room-artwork.mjs` (fixtures; optional follow-up)
