-- Rollback for Sports private pilot migrations ONLY.
-- Safe to run if Sports pilot must be removed. Does NOT touch non-Sports catalog tables.
-- Order: drop dependents first.

begin;

drop table if exists public.sports_playback_metrics cascade;
drop table if exists public.sports_playback_sessions cascade;
drop table if exists public.sports_playback_validations cascade;

-- Playback validation columns on broadcasts / fixtures (additive phase 2)
alter table if exists public.sports_broadcasts
  drop column if exists provider_asset_id,
  drop column if exists playback_kind,
  drop column if exists publisher_name,
  drop column if exists publisher_domain,
  drop column if exists is_official,
  drop column if exists is_embeddable,
  drop column if exists is_free,
  drop column if exists requires_login,
  drop column if exists requires_subscription,
  drop column if exists mobile_supported,
  drop column if exists web_supported,
  drop column if exists country_allowlist,
  drop column if exists country_blocklist,
  drop column if exists validation_status,
  drop column if exists health_score,
  drop column if exists last_validated_at,
  drop column if exists validation_expires_at,
  drop column if exists failure_count,
  drop column if exists priority;

alter table if exists public.sports_provider_health
  drop column if exists success_rate,
  drop column if exists validation_success_rate,
  drop column if exists average_latency_ms,
  drop column if exists paused_until;

alter table if exists public.sports_fixtures
  drop column if exists availability_state,
  drop column if exists playable,
  drop column if exists playability_updated_at,
  drop column if exists visible;

-- Full foundation rollback (only if completely removing Sports schema)
-- WARNING: destructive for Sports pilot data only.
drop table if exists public.sports_play_failures cascade;
drop table if exists public.sports_play_attempts cascade;
drop table if exists public.sports_quarantine_events cascade;
drop table if exists public.sports_rights_incidents cascade;
drop table if exists public.sports_stream_incidents cascade;
drop table if exists public.sports_stream_checks cascade;
drop table if exists public.sports_stream_health cascade;
drop table if exists public.sports_provider_health cascade;
drop table if exists public.sports_worker_checkpoints cascade;
drop table if exists public.sports_feature_flags cascade;
drop table if exists public.sports_video_sources cascade;
drop table if exists public.sports_videos cascade;
drop table if exists public.sports_channel_streams cascade;
drop table if exists public.sports_stream_variants cascade;
drop table if exists public.sports_stream_sources cascade;
drop table if exists public.sports_broadcasts cascade;
drop table if exists public.sports_channels cascade;
drop table if exists public.sports_fixture_scores cascade;
drop table if exists public.sports_fixture_events cascade;
drop table if exists public.sports_fixture_participants cascade;
drop table if exists public.sports_fixtures cascade;
drop table if exists public.sports_standings cascade;
drop table if exists public.sports_athletes cascade;
drop table if exists public.sports_team_aliases cascade;
drop table if exists public.sports_teams cascade;
drop table if exists public.sports_venues cascade;
drop table if exists public.sports_competition_seasons cascade;
drop table if exists public.sports_competitions cascade;
drop table if exists public.sports_rights_territories cascade;
drop table if exists public.sports_rights_grants cascade;
drop table if exists public.sports_rights_holders cascade;
drop table if exists public.sports_providers cascade;
drop table if exists public.sports_countries cascade;
drop table if exists public.sport_categories cascade;
drop table if exists public.sports cascade;

drop function if exists public.sports_touch_updated_at() cascade;

commit;
