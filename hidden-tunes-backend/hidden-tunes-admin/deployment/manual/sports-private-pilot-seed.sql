-- Sports private pilot seed — 15 fixtures, idempotent, removable.
-- Does NOT set playable=true or availability_state=live_in_app.
-- Fixture rows tagged metadata.source = sports_private_pilot_2026_07_18

begin;

insert into public.sports (slug, name, status, sort_order)
values
  ('football', 'Football', 'active', 1),
  ('basketball', 'Basketball', 'active', 2),
  ('tennis', 'Tennis', 'active', 3),
  ('cricket', 'Cricket', 'active', 4),
  ('athletics', 'Athletics', 'active', 5)
on conflict (slug) do update set name = excluded.name, updated_at = now();

insert into public.sports_countries (code, name, status)
values
  ('GB', 'United Kingdom', 'active'),
  ('US', 'United States', 'active'),
  ('DE', 'Germany', 'active'),
  ('FR', 'France', 'active'),
  ('IN', 'India', 'active'),
  ('AU', 'Australia', 'active'),
  ('BR', 'Brazil', 'active'),
  ('ZZ', 'Unknown / fallback', 'active')
on conflict (code) do update set name = excluded.name, updated_at = now();

insert into public.sports_providers (slug, name, provider_type, official_domain, kill_switch, is_enabled, health_status, notes)
values (
  'scorebat',
  'ScoreBat',
  'official_embed',
  'scorebat.com',
  true,
  false,
  'disabled',
  'Private pilot — highlights only; live entitlement not confirmed; kill_switch on'
)
on conflict (slug) do update set
  notes = excluded.notes,
  kill_switch = true,
  is_enabled = false,
  health_status = 'disabled',
  updated_at = now();

insert into public.sports_competitions (sport_id, name, slug, country_code, competition_type, status)
select s.id, v.name, v.slug, v.country_code, v.competition_type, 'verified'
from public.sports s
join (
  values
    ('football', 'Pilot Premier League', 'pilot-premier-league', 'GB', 'league'),
    ('football', 'Pilot Bundesliga', 'pilot-bundesliga', 'DE', 'league'),
    ('basketball', 'Pilot NBA', 'pilot-nba', 'US', 'league'),
    ('tennis', 'Pilot Grand Slam', 'pilot-grand-slam', 'FR', 'tournament'),
    ('cricket', 'Pilot International', 'pilot-cricket-intl', 'IN', 'series'),
    ('athletics', 'Pilot Track Series', 'pilot-track-series', 'AU', 'series')
) as v(sport_slug, name, slug, country_code, competition_type)
  on s.slug = v.sport_slug
on conflict (slug) do update set
  name = excluded.name,
  status = excluded.status,
  updated_at = now();

delete from public.sports_fixtures
where metadata->>'source' = 'sports_private_pilot_2026_07_18';

with comp_map as (
  select slug, id, sport_id, country_code from public.sports_competitions
  where slug like 'pilot-%'
)
insert into public.sports_fixtures (
  sport_id, competition_id, title, starts_at, ends_at, status,
  country_code, availability_state, playable, visible, metadata
)
select
  c.sport_id,
  c.id,
  f.title,
  f.starts_at,
  f.ends_at,
  f.status,
  f.country_code,
  f.availability_state,
  false,
  true,
  jsonb_build_object(
    'pilot', true,
    'source', 'sports_private_pilot_2026_07_18',
    'pilot_kind', f.pilot_kind
  )
from (
  values
    ('pilot-premier-league', 'Pilot: Arsenal vs Chelsea', now() + interval '2 days', null::timestamptz, 'scheduled', 'GB', 'upcoming', 'metadata_upcoming'),
    ('pilot-bundesliga', 'Pilot: Bayern vs Dortmund', now() + interval '1 day', null, 'scheduled', 'DE', 'upcoming', 'metadata_upcoming'),
    ('pilot-nba', 'Pilot: Lakers vs Celtics', now() + interval '3 days', null, 'scheduled', 'US', 'upcoming', 'metadata_upcoming'),
    ('pilot-grand-slam', 'Pilot: Finals R1', now() + interval '12 hours', null, 'scheduled', 'FR', 'upcoming', 'metadata_upcoming'),
    ('pilot-cricket-intl', 'Pilot: India vs Australia', now() + interval '4 days', null, 'scheduled', 'IN', 'upcoming', 'metadata_upcoming'),
    ('pilot-premier-league', 'Pilot LIVE score: Spurs vs Villa', now() - interval '30 minutes', now() + interval '90 minutes', 'live', 'GB', 'live_unavailable', 'live_score_only'),
    ('pilot-nba', 'Pilot LIVE score: Heat vs Knicks', now() - interval '20 minutes', now() + interval '2 hours', 'live', 'US', 'live_unavailable', 'live_score_only'),
    ('pilot-track-series', 'Pilot LIVE score: 100m Final', now() - interval '10 minutes', now() + interval '1 hour', 'live', 'AU', 'live_unavailable', 'live_score_only'),
    ('pilot-premier-league', 'Pilot finished: Liverpool vs City', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'completed', 'GB', 'finished', 'finished'),
    ('pilot-bundesliga', 'Pilot finished: Leipzig vs Leverkusen', now() - interval '3 days', now() - interval '3 days' + interval '2 hours', 'completed', 'DE', 'finished', 'finished'),
    ('pilot-cricket-intl', 'Pilot finished: England vs SA', now() - interval '5 days', now() - interval '4 days', 'completed', 'GB', 'finished', 'finished'),
    ('pilot-nba', 'Pilot external: Warriors vs Suns', now() - interval '15 minutes', now() + interval '2 hours', 'live', 'US', 'live_external', 'external_official'),
    ('pilot-grand-slam', 'Pilot external: SF Match', now() + interval '6 hours', null, 'scheduled', 'FR', 'upcoming', 'external_official'),
    ('pilot-premier-league', 'Pilot highlights candidate: Newcastle vs Brighton', now() - interval '1 day', now() - interval '1 day' + interval '2 hours', 'completed', 'GB', 'finished', 'highlights_candidate'),
    ('pilot-bundesliga', 'Pilot highlights candidate: Frankfurt vs Wolfsburg', now() - interval '2 days', now() - interval '2 days' + interval '2 hours', 'completed', 'DE', 'finished', 'highlights_candidate')
) as f(comp_slug, title, starts_at, ends_at, status, country_code, availability_state, pilot_kind)
join comp_map c on c.slug = f.comp_slug;

insert into public.sports_feature_flags (key, enabled, description)
values
  ('sports_enabled', false, 'Master Sports API flag — private pilot keeps off for public'),
  ('sports_admin_enabled', true, 'Admin sports ops'),
  ('sports_native_playback_enabled', false, 'Native playback off'),
  ('sports_embedded_playback_enabled', false, 'Embedded playback off until private validation'),
  ('sports_external_watch_enabled', false, 'External watch off for public'),
  ('sports_live_scores_enabled', false, 'Live scores off'),
  ('sports_notifications_enabled', false, 'Notifications off'),
  ('sports_provider_imports_enabled', false, 'Imports off'),
  ('sports_home_ia_enabled', false, 'Home IA off'),
  ('sports_mobile_pilot_enabled', false, 'Mobile pilot flag off until operator enables privately'),
  ('sports_personalization_enabled', false, 'Personalization off'),
  ('sports_scorebat_enabled', false, 'ScoreBat off'),
  ('sports_scorebat_discovery_enabled', false, 'ScoreBat discovery off'),
  ('sports_scorebat_playback_enabled', false, 'ScoreBat playback off')
on conflict (key) do update set
  enabled = excluded.enabled,
  description = excluded.description,
  updated_at = now();

commit;

select count(*) as pilot_fixtures
from public.sports_fixtures
where metadata->>'source' = 'sports_private_pilot_2026_07_18';

select availability_state, count(*)
from public.sports_fixtures
where metadata->>'source' = 'sports_private_pilot_2026_07_18'
group by 1
order by 1;
