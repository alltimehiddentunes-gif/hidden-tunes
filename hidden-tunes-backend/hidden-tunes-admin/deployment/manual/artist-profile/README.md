## SQL execution order

1. `01_artist_profile_infrastructure.sql` (same as `supabase/migrations/20260713150000_artist_profile_infrastructure.sql`)
2. `02_artist_verification.sql`
3. `03_artist_statistics_backfill.sql` (optional but recommended)

## Apply from this repo

```bash
cd hidden-tunes-backend/hidden-tunes-admin
# Requires DATABASE_URL / SUPABASE_DB_URL, or SUPABASE_ACCESS_TOKEN + SUPABASE_URL
npm run artist:apply-migration
npm run artist:verify-schema
npm run artist:smoke-loaders
```

If credentials are unavailable, paste `01_artist_profile_infrastructure.sql` into the Supabase SQL Editor, then run verify/smoke.

## Schema snapshot

See `SCHEMA-SNAPSHOT-20260717.json` for the pre-repair production schema probe.

## VPS path

`/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin`

## PM2 process

`hidden-tunes-admin`

## Public API host

`https://admin.hiddentunes.com`
