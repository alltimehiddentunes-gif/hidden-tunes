## SQL execution order

1. `01_artist_profile_infrastructure.sql` (same as `supabase/migrations/20260713150000_artist_profile_infrastructure.sql`)
2. `02_artist_verification.sql`
3. `03_artist_statistics_backfill.sql` (optional but recommended)
4. `04_artist_release_taxonomy.sql` (same as `supabase/migrations/20260717180000_artist_release_taxonomy.sql`)

See **`PHASE-8-PRODUCTION-READY.md`** for the full production apply / verify / smoke / PM2 sequence (do not run without credentials and approval).

## Apply from this repo

```bash
cd hidden-tunes-backend/hidden-tunes-admin
# Requires DATABASE_URL / SUPABASE_DB_URL, or SUPABASE_ACCESS_TOKEN + SUPABASE_URL
npm run artist:apply-migration
npm run artist:verify-schema
npm run artist:smoke-loaders
# Optional: only after infrastructure schema is applied. Safe no-op when rankings table is missing.
npm run artist:rankings:dry
npm run artist:rankings -- --resume --limit-artists=100
# Optional: Similar Artists writer. Safe no-op when artist_similar_scores is missing.
npm run artist:similar:dry
npm run artist:similar -- --resume --limit-artists=40
```

If credentials are unavailable, paste `01_artist_profile_infrastructure.sql` then `04_artist_release_taxonomy.sql` into the Supabase SQL Editor, then run verify/smoke.

Artist Profile pages do **not** require the ranking or similarity jobs. Without ranking rows or play signals, track sections stay labeled **Essential tracks**. Without similar rows, the Similar Artists section stays hidden/empty.

Artist Follow uses `artist_followers` (user_id + artist_id primary key). Authenticated `POST/DELETE /api/artists/:uuid/follow` are idempotent. Unauthenticated follow/unfollow returns **401**. If the follow table is absent, profile shell still loads and Follow controls degrade to unavailable (**503** on mutate).

## Schema snapshot

See `SCHEMA-SNAPSHOT-20260717.json` for the pre-repair production schema probe.

## VPS path

`/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin`

## PM2 process

`hidden-tunes-admin`

## Public API host

`https://admin.hiddentunes.com`
