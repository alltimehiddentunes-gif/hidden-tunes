-- Run after 01_artist_profile_infrastructure.sql
-- Safe verification queries for Artist Profile rollout

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'artists'
  and column_name in ('status', 'is_verified', 'merged_into_artist_id', 'featured_release_id')
order by column_name;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name like 'artist_%'
order by table_name;

select count(*) as artist_count from public.artists;
select count(*) as artist_statistics_count from public.artist_statistics;
select count(*) as artist_followers_count from public.artist_followers;

-- RLS should be enabled on artist_followers
select relrowsecurity
from pg_class
where relname = 'artist_followers';
