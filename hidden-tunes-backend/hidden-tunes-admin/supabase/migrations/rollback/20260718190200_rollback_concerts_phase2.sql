-- ROLLBACK: Verified Live Concerts Phase 2 database foundation + Phase 3 registry columns.
-- REVIEW BEFORE RUNNING. Destructive. Drops only concert_* / concerts user tables.
-- Does not touch TV, Sports, Motivation, Lectures, Radio, Podcast, or music tables.
-- Prefer applying via: node scripts/rollback-concerts-migration.mjs --dry-run
-- Never run against production without an explicit operator decision.

begin;

drop table if exists public.concert_playback_sessions cascade;
drop table if exists public.concert_worker_checkpoints cascade;
drop table if exists public.concert_validation_runs cascade;
drop table if exists public.followed_concert_artists cascade;
drop table if exists public.recently_watched_concerts cascade;
drop table if exists public.concert_reminders cascade;
drop table if exists public.saved_concerts cascade;
drop table if exists public.concert_item_categories cascade;
drop table if exists public.concert_item_artists cascade;
drop table if exists public.concert_streams cascade;
drop table if exists public.concert_items cascade;
drop table if exists public.concert_categories cascade;
drop table if exists public.concert_artists cascade;
drop table if exists public.concert_sources cascade;

drop function if exists public.concerts_touch_updated_at() cascade;

notify pgrst, 'reload schema';

commit;
