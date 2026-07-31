-- Sports fixtures pilot — capability flags (NOT APPLIED / NOT ENABLED)
-- Additive only. All new keys default to false.
-- Do not flip sports_enabled / sports_fixtures_enabled until clean import gates pass.
-- sports_streams_enabled must remain false for the fixtures-only pilot.

insert into public.sports_feature_flags (key, enabled, description) values
  ('sports_fixtures_enabled', false, 'Fixture browse / schedules / results (no streams)'),
  ('sports_streams_enabled', false, 'Verified legal Sports streams only'),
  ('sports_live_scores_enabled', false, 'Live scores surface — enable only after trusted feed verification'),
  ('sports_notifications_enabled', false, 'Sports notifications')
on conflict (key) do update
  set description = excluded.description
  -- never auto-enable on conflict
  ;

-- Recommended private-pilot target AFTER clean 1k–5k import + validation:
--   sports_enabled = true
--   sports_fixtures_enabled = true
--   sports_mobile_pilot_enabled = true  (existing)
--   sports_full_ui_enabled = true       (existing, mobile)
--   sports_live_scores_enabled = false until score feed passes
--   sports_streams_enabled = false
--   sports_notifications_enabled = false

-- Grant missing on Phase 1 provider-id map (observed 403 for service_role)
grant select, insert, update, delete on public.sports_fixture_provider_ids to service_role;
grant select on public.sports_fixture_provider_ids to anon, authenticated;
