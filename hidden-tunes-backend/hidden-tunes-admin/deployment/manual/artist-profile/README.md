# Artist Profile Production Deployment

## SQL execution order

1. `01_artist_profile_infrastructure.sql`
2. `02_artist_verification.sql`
3. `03_artist_statistics_backfill.sql` (optional but recommended)

## VPS path

`/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin`

## PM2 process

`hidden-tunes-admin`

## Public API host

`https://admin.hiddentunes.com`
