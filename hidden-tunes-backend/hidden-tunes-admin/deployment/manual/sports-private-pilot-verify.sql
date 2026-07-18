-- Verify Sports private pilot schema after migration.
-- Run with: psql "$DATABASE_URL" -f deployment/manual/sports-private-pilot-verify.sql

select
  to_regclass('public.sports') as sports,
  to_regclass('public.sports_fixtures') as sports_fixtures,
  to_regclass('public.sports_broadcasts') as sports_broadcasts,
  to_regclass('public.sports_playback_validations') as sports_playback_validations,
  to_regclass('public.sports_playback_sessions') as sports_playback_sessions,
  to_regclass('public.sports_playback_metrics') as sports_playback_metrics,
  to_regclass('public.sports_provider_health') as sports_provider_health;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'sports_broadcasts'
  and column_name in (
    'validation_status','health_score','playback_kind','provider_asset_id',
    'validation_expires_at','mobile_supported'
  )
order by 1;

select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'sports_fixtures'
  and column_name in ('availability_state','playable','visible','playability_updated_at')
order by 1;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname like 'sports_%'
order by 1
limit 40;
