begin;

-- Metadata-only provider registry. No content is assigned and no policy is
-- activated by this seed.
insert into public.rights_providers (slug, name, provider_type, external_account_id, owner_name, metadata)
values
  ('mureka', 'Mureka', 'music', '118869219999745', 'Lotsu Emmanuel', '{"phase":"4A","policy":"none"}'::jsonb),
  ('djcity', 'DJcity', 'music', null, null, '{"phase":"4A","policy":"none"}'::jsonb),
  ('librivox', 'LibriVox', 'audiobook', null, null, '{"phase":"4A","policy":"none"}'::jsonb),
  ('internet-archive', 'Internet Archive', 'archive', null, null, '{"phase":"4A","policy":"none"}'::jsonb),
  ('iptv-org', 'IPTV-org', 'tv', null, null, '{"phase":"4A","policy":"none"}'::jsonb),
  ('radio-browser', 'Radio Browser', 'radio', null, null, '{"phase":"4A","policy":"none"}'::jsonb),
  ('podcast-index', 'Podcast Index', 'podcast', null, null, '{"phase":"4A","policy":"none"}'::jsonb)
on conflict (slug) do nothing;

commit;

