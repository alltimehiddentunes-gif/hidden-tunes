# Artist Profile — Phase 8 production readiness

Prepare and run these steps only with explicit credentials and approval.
Do **not** apply migrations or restart PM2 blindly.

Workspace on VPS (typical):

```text
/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin
```

Public API host: `https://admin.hiddentunes.com`  
PM2 process: `hidden-tunes-admin`

## Migration order (idempotent SQL)

1. `01_artist_profile_infrastructure.sql`  
   (`supabase/migrations/20260713150000_artist_profile_infrastructure.sql`)
2. `02_artist_verification.sql` (optional)
3. `03_artist_statistics_backfill.sql` (optional)
4. `04_artist_release_taxonomy.sql`  
   (`supabase/migrations/20260717180000_artist_release_taxonomy.sql`)

Infrastructure **must** run before taxonomy. Re-running both files is safe when scripts are written idempotently (`IF NOT EXISTS` / additive columns).

## Exact command sequence

```bash
cd /var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin

# 1–2. Apply + verify schema (requires DATABASE_URL / SUPABASE_DB_URL
#      or SUPABASE_ACCESS_TOKEN + SUPABASE_URL — do not paste secrets into chat)
npm run artist:apply-migration
npm run artist:verify-schema

# 3. Loader smoke (shell / top-songs / releases / similar / about)
npm run artist:smoke-loaders

# 4. Admin build
npm run build

# 5. PM2 reload (only after build succeeds and approval)
pm2 restart hidden-tunes-admin --update-env
pm2 save

# 6. Profile route smoke (public)
npm run test:artist-profile

# 7. Rankings dry / optional write (safe no-op if table missing)
npm run artist:rankings:dry
# npm run artist:rankings -- --resume --limit-artists=100

# 8. Similar Artists dry / optional write
npm run artist:similar:dry
# npm run artist:similar -- --resume --limit-artists=40

# 9. Follow unit/integration script
npm run test:artist-follow

# 10. Authenticated Follow (manual): sign in on mobile/desktop,
#     open /artist/{uuid}, Follow → Following → Unfollow.
#     Desktop needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at build time.
```

If DB credentials are unavailable: paste `01_…` then `04_…` into the Supabase SQL Editor, then run `artist:verify-schema` and smokes locally against production API.

## API expectations (post-migration)

| Case | Expected |
|---|---|
| Valid artist shell | `200` |
| Missing artist | `404` |
| Invalid reference | `400` |
| Merged artist | Canonical UUID resolution |
| Top tracks / releases / similar | `200` + pagination |
| Follow GET | `200` when available |
| Follow POST/DELETE | Idempotent; `401` unsigned; `503` if schema absent |
| Browse `/api/artists` | No stream URLs in embedded track previews; bounded limits |

## Client performance notes (Phase 8)

- Mobile profile: shell → first songs page (20) + releases → deferred similar; follow from shell (no duplicate GET).
- Express `/api/artists`: default limit 48 / max 100; max 8 metadata tracks per artist; no `url`/`streamUrl` in browse embeds.
- Legacy `/artist?artist=name`: resolvable unambiguous catalog name → `replace` to `/artist/{uuid}`; otherwise YouTube legacy retained. `/youtube-player` kept.

## Do not run without approval

- Production SQL apply
- PM2 restart
- Live rankings/similar writers at full catalog scale
