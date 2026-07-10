-- Hidden Tunes Radio Phase A normalization and idempotency foundation.
-- Additive and idempotent: preserves existing radio_stations data and public state.

alter table if exists public.radio_stations
  add column if not exists reliability_score numeric not null default 0,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_health_checked_at timestamptz,
  add column if not exists last_health_error text,
  add column if not exists quarantined_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists quarantine_reason text,
  add column if not exists health_status text not null default 'unchecked',
  add column if not exists source_name text,
  add column if not exists source_uuid text,
  add column if not exists source_station_id text,
  add column if not exists source_server text,
  add column if not exists source_stream_url text,
  add column if not exists normalized_name text,
  add column if not exists normalized_stream_url text,
  add column if not exists homepage_url text,
  add column if not exists normalized_homepage_host text,
  add column if not exists state text,
  add column if not exists source_payload_hash text,
  add column if not exists source_last_seen_at timestamptz,
  add column if not exists station_fingerprint text,
  add column if not exists fingerprint_version integer not null default 1,
  add column if not exists imported_at timestamptz not null default now(),
  add column if not exists metadata_locked boolean not null default false,
  add column if not exists manual_override boolean not null default false,
  add column if not exists is_curated boolean not null default false;

update public.radio_stations
set
  reliability_score = greatest(0, least(100, coalesce(reliability_score, quality_score, 0))),
  consecutive_failures = greatest(0, coalesce(consecutive_failures, 0)),
  health_status = coalesce(nullif(health_status, ''), 'unchecked'),
  source_name = coalesce(nullif(source_name, ''), nullif(source_type, ''), 'radio_browser'),
  source_uuid = coalesce(nullif(source_uuid, ''), nullif(source_station_uuid, '')),
  source_station_id = coalesce(nullif(source_station_id, ''), nullif(source_station_uuid, '')),
  source_stream_url = coalesce(nullif(source_stream_url, ''), nullif(stream_url, '')),
  normalized_name = coalesce(
    nullif(normalized_name, ''),
    lower(regexp_replace(trim(coalesce(name, '')), '\s+', ' ', 'g'))
  ),
  normalized_stream_url = coalesce(
    nullif(normalized_stream_url, ''),
    lower(trim(coalesce(stream_url, '')))
  ),
  source_last_seen_at = coalesce(source_last_seen_at, last_checked_at, updated_at, created_at, now()),
  imported_at = coalesce(imported_at, created_at, now()),
  fingerprint_version = coalesce(fingerprint_version, 1),
  metadata_locked = coalesce(metadata_locked, false),
  manual_override = coalesce(manual_override, false),
  is_curated = coalesce(is_curated, false)
where reliability_score is null
   or reliability_score < 0
   or reliability_score > 100
   or consecutive_failures is null
   or consecutive_failures < 0
   or health_status is null
   or health_status = ''
   or source_name is null
   or source_name = ''
   or source_uuid is null
   or source_uuid = ''
   or source_station_id is null
   or source_station_id = ''
   or source_stream_url is null
   or source_stream_url = ''
   or normalized_name is null
   or normalized_name = ''
   or normalized_stream_url is null
   or normalized_stream_url = ''
   or source_last_seen_at is null
   or imported_at is null
   or fingerprint_version is null
   or metadata_locked is null
   or manual_override is null
   or is_curated is null;

update public.radio_stations
set station_fingerprint = concat(
  'radio:1:',
  md5(concat_ws('|',
    'v1',
    coalesce(normalized_stream_url, ''),
    coalesce(normalized_name, ''),
    coalesce(country_code, ''),
    coalesce(normalized_homepage_host, '')
  ))
)
where station_fingerprint is null
   or station_fingerprint = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'radio_stations_reliability_score_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_reliability_score_check
      check (reliability_score >= 0 and reliability_score <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'radio_stations_consecutive_failures_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_consecutive_failures_check
      check (consecutive_failures >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'radio_stations_health_status_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_health_status_check
      check (health_status in ('unchecked', 'playable', 'failed', 'blocked', 'quarantined'));
  end if;
end $$;

create table if not exists public.radio_station_sources (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.radio_stations(id) on delete cascade,
  source_name text not null,
  source_station_id text not null,
  source_uuid text,
  source_server text,
  source_payload_hash text,
  source_first_seen_at timestamptz not null default now(),
  source_last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_name, source_station_id)
);

insert into public.radio_station_sources (
  station_id,
  source_name,
  source_station_id,
  source_uuid,
  source_payload_hash,
  source_first_seen_at,
  source_last_seen_at
)
select
  id,
  coalesce(nullif(source_name, ''), 'radio_browser'),
  coalesce(nullif(source_station_id, ''), nullif(source_station_uuid, '')),
  coalesce(nullif(source_uuid, ''), nullif(source_station_uuid, '')),
  source_payload_hash,
  coalesce(imported_at, created_at, now()),
  coalesce(source_last_seen_at, updated_at, now())
from public.radio_stations
where coalesce(nullif(source_station_id, ''), nullif(source_station_uuid, '')) is not null
on conflict (source_name, source_station_id) do update
set
  station_id = excluded.station_id,
  source_uuid = excluded.source_uuid,
  source_payload_hash = excluded.source_payload_hash,
  source_last_seen_at = greatest(
    public.radio_station_sources.source_last_seen_at,
    excluded.source_last_seen_at
  ),
  updated_at = now();

create table if not exists public.radio_import_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  source_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  records_received integer not null default 0,
  records_normalized integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_unchanged integer not null default 0,
  duplicate_source_count integer not null default 0,
  duplicate_canonical_count integer not null default 0,
  conflict_count integer not null default 0,
  invalid_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists radio_station_sources_station_idx
  on public.radio_station_sources (station_id);

create index if not exists radio_station_sources_last_seen_idx
  on public.radio_station_sources (source_last_seen_at desc);

create index if not exists radio_import_runs_source_status_idx
  on public.radio_import_runs (source_name, status, started_at desc);

create index if not exists radio_stations_source_identity_idx
  on public.radio_stations (source_name, source_station_id);

create index if not exists radio_stations_normalized_stream_url_idx
  on public.radio_stations (normalized_stream_url)
  where normalized_stream_url is not null and normalized_stream_url <> '';

create index if not exists radio_stations_fingerprint_idx
  on public.radio_stations (station_fingerprint)
  where station_fingerprint is not null and station_fingerprint <> '';

create index if not exists radio_stations_normalized_name_country_idx
  on public.radio_stations (normalized_name, country_code, normalized_homepage_host);

create index if not exists radio_stations_source_last_seen_idx
  on public.radio_stations (source_last_seen_at desc);

create index if not exists radio_stations_public_browse_idx
  on public.radio_stations (
    status,
    is_active,
    is_verified,
    playback_status,
    reliability_score desc,
    created_at desc,
    id
  )
  where quarantined_at is null
    and disabled_at is null;

create index if not exists radio_stations_public_category_idx
  on public.radio_stations (category_slug, reliability_score desc, created_at desc, id)
  where status = 'approved'
    and is_active = true
    and is_verified = true
    and playback_status = 'playable'
    and quarantined_at is null
    and disabled_at is null;

create index if not exists radio_stations_public_country_idx
  on public.radio_stations (country_code, reliability_score desc, created_at desc, id)
  where status = 'approved'
    and is_active = true
    and is_verified = true
    and playback_status = 'playable'
    and quarantined_at is null
    and disabled_at is null;

create index if not exists radio_stations_public_language_idx
  on public.radio_stations (language, reliability_score desc, created_at desc, id)
  where status = 'approved'
    and is_active = true
    and is_verified = true
    and playback_status = 'playable'
    and quarantined_at is null
    and disabled_at is null;

create index if not exists radio_stations_tags_gin_idx
  on public.radio_stations using gin (tags);

create index if not exists radio_stations_categories_gin_idx
  on public.radio_stations using gin (categories);

create or replace view public.radio_public_categories as
with public_rows as (
  select category_slug, categories, tags
  from public.radio_stations
  where status = 'approved'
    and is_active = true
    and is_verified = true
    and playback_status = 'playable'
    and is_mature = false
    and quarantined_at is null
    and disabled_at is null
    and reliability_score >= 60
),
category_values as (
  select lower(nullif(trim(category_slug), '')) as id
  from public_rows
  union all
  select lower(nullif(trim(category), '')) as id
  from public_rows, unnest(coalesce(categories, array[]::text[])) as category
  union all
  select lower(nullif(trim(tag), '')) as id
  from public_rows, unnest(coalesce(tags, array[]::text[])) as tag
)
select
  id,
  initcap(replace(replace(id, '-', ' '), '_', ' ')) as name,
  count(*)::integer as count
from category_values
where id is not null
group by id
order by count desc, id asc;

create or replace view public.radio_public_countries as
select
  coalesce(nullif(trim(country_code), ''), nullif(trim(country), '')) as id,
  max(nullif(trim(country), '')) as name,
  nullif(trim(country_code), '') as code,
  count(*)::integer as count
from public.radio_stations
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and is_mature = false
  and quarantined_at is null
  and disabled_at is null
  and reliability_score >= 60
  and coalesce(nullif(trim(country_code), ''), nullif(trim(country), '')) is not null
group by coalesce(nullif(trim(country_code), ''), nullif(trim(country), '')), nullif(trim(country_code), '')
order by count desc, id asc;

create or replace view public.radio_public_languages as
select
  lower(nullif(trim(language), '')) as name,
  count(*)::integer as count
from public.radio_stations
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and is_mature = false
  and quarantined_at is null
  and disabled_at is null
  and reliability_score >= 60
  and nullif(trim(language), '') is not null
group by lower(nullif(trim(language), ''))
order by count desc, name asc;

notify pgrst, 'reload schema';
