-- Idempotent rename of private-pilot competition / fixture display labels.
-- Only touches rows tagged sports_private_pilot_2026_07_18 (or pilot-* competition slugs).
-- Preserves ids, slugs, and source identifiers.

begin;

update public.sports_competitions
set
  name = case slug
    when 'pilot-premier-league' then 'Premier League (Test)'
    when 'pilot-bundesliga' then 'Bundesliga (Test)'
    when 'pilot-nba' then 'NBA (Test)'
    when 'pilot-grand-slam' then 'Grand Slam (Test)'
    when 'pilot-cricket-intl' then 'International Cricket (Test)'
    when 'pilot-track-series' then 'Track Series (Test)'
    else name
  end,
  updated_at = now()
where slug in (
  'pilot-premier-league',
  'pilot-bundesliga',
  'pilot-nba',
  'pilot-grand-slam',
  'pilot-cricket-intl',
  'pilot-track-series'
);

update public.sports_fixtures
set
  title = regexp_replace(
    regexp_replace(
      regexp_replace(title, '^Pilot LIVE score:\s*', '', 'i'),
      '^Pilot finished:\s*',
      '',
      'i'
    ),
    '^Pilot( highlights candidate)?:\s*',
    '',
    'i'
  ),
  updated_at = now()
where metadata->>'source' = 'sports_private_pilot_2026_07_18'
  and title ~* '^Pilot';

-- Ensure remaining Pilot: prefixes are stripped.
update public.sports_fixtures
set
  title = regexp_replace(title, '^Pilot:\s*', '', 'i'),
  updated_at = now()
where metadata->>'source' = 'sports_private_pilot_2026_07_18'
  and title ~* '^Pilot:';

update public.sports_fixtures
set
  title = regexp_replace(title, '^Pilot external:\s*', '', 'i'),
  updated_at = now()
where metadata->>'source' = 'sports_private_pilot_2026_07_18'
  and title ~* '^Pilot external:';

commit;

select slug, name from public.sports_competitions where slug like 'pilot-%' order by slug;
select title from public.sports_fixtures
where metadata->>'source' = 'sports_private_pilot_2026_07_18'
order by starts_at
limit 20;
