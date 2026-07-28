-- Hidden Tunes podcast scale expansion (additive only).
-- Supports 500k+ shows and 50M+ episodes without breaking existing APIs.

begin;

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- podcast_shows — scale metadata + source tracking
-- ---------------------------------------------------------------------------

alter table if exists public.podcast_shows
  add column if not exists website_url text,
  add column if not exists country_code text,
  add column if not exists explicit boolean,
  add column if not exists copyright text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists source_feed_id bigint,
  add column if not exists feed_last_updated timestamptz,
  add column if not exists reliability_score integer not null default 100,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists normalized_title text,
  add column if not exists quarantined_at timestamptz,
  add column if not exists last_health_checked_at timestamptz,
  add column if not exists last_health_error text;

alter table if exists public.podcast_episodes
  add column if not exists episode_guid text,
  add column if not exists explicit boolean,
  add column if not exists has_transcript boolean,
  add column if not exists transcript_url text,
  add column if not exists guest_names text[] not null default '{}',
  add column if not exists source_episode_id text,
  add column if not exists reliability_score integer not null default 100,
  add column if not exists consecutive_failures integer not null default 0,
  add column if not exists last_play_verified_at timestamptz,
  add column if not exists quarantined_at timestamptz,
  add column if not exists last_health_checked_at timestamptz,
  add column if not exists last_health_error text;

create unique index if not exists podcast_episodes_show_guid_unique
  on public.podcast_episodes (show_id, episode_guid)
  where episode_guid is not null;

create unique index if not exists podcast_shows_feed_url_unique
  on public.podcast_shows (feed_url)
  where feed_url is not null;

create index if not exists podcast_episodes_show_title_published_idx
  on public.podcast_episodes (show_id, title, published_at);

do $$
begin
  if not exists (
    select 1
    from public.podcast_shows
    where source_type is not null
      and source_id is not null
    group by source_type, source_id
    having count(*) > 1
  ) then
    create unique index if not exists podcast_shows_source_type_source_id_unique
      on public.podcast_shows (source_type, source_id)
      where source_type is not null and source_id is not null;
  end if;
end $$;

create index if not exists podcast_shows_language_public_idx
  on public.podcast_shows (language)
  where status = 'approved' and is_active = true and feed_status = 'active';

create index if not exists podcast_shows_country_public_idx
  on public.podcast_shows (country_code)
  where status = 'approved' and is_active = true and feed_status = 'active';

create index if not exists podcast_shows_normalized_title_trgm_idx
  on public.podcast_shows using gin (normalized_title gin_trgm_ops)
  where normalized_title is not null and normalized_title <> '';

create index if not exists podcast_shows_title_trgm_idx
  on public.podcast_shows using gin (title gin_trgm_ops);

create index if not exists podcast_episodes_title_trgm_idx
  on public.podcast_episodes using gin (title gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- import + health operational tables
-- ---------------------------------------------------------------------------

create table if not exists public.podcast_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  catalog text not null default 'general',
  status text not null default 'running',
  page_cursor text,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  duplicate_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint podcast_import_runs_status_check check (
    status in ('running', 'completed', 'failed', 'cancelled')
  ),
  constraint podcast_import_runs_catalog_check check (
    catalog in ('general', 'mature')
  )
);

create table if not exists public.podcast_health_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  check_type text not null,
  priority integer not null default 100,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint podcast_health_queue_entity_type_check check (
    entity_type in ('show', 'episode')
  ),
  constraint podcast_health_queue_check_type_check check (
    check_type in ('feed', 'audio', 'metadata', 'full')
  ),
  constraint podcast_health_queue_status_check check (
    status in ('pending', 'running', 'completed', 'failed', 'skipped')
  )
);

create table if not exists public.podcast_quarantine (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  feed_url text,
  source_type text,
  source_id text,
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint podcast_quarantine_entity_type_check check (
    entity_type in ('show', 'episode', 'feed')
  )
);

create index if not exists podcast_import_runs_source_status_idx
  on public.podcast_import_runs (source, catalog, status, started_at desc);

create index if not exists podcast_health_queue_status_priority_idx
  on public.podcast_health_queue (status, priority, scheduled_at);

create unique index if not exists podcast_health_queue_entity_check_unique
  on public.podcast_health_queue (entity_type, entity_id, check_type)
  where status in ('pending', 'running');

create index if not exists podcast_quarantine_feed_url_idx
  on public.podcast_quarantine (feed_url)
  where feed_url is not null;

-- ---------------------------------------------------------------------------
-- defer episode_count trigger during bulk import
-- ---------------------------------------------------------------------------

create or replace function public.podcast_episodes_refresh_show_count()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('podcast.bulk_import', true), '') = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.podcast_refresh_show_episode_count(old.show_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.show_id is distinct from new.show_id then
    perform public.podcast_refresh_show_episode_count(old.show_id);
  end if;

  perform public.podcast_refresh_show_episode_count(new.show_id);
  return new;
end;
$$;

create or replace function public.podcast_recount_all_show_episode_counts()
returns integer
language plpgsql
as $$
declare
  updated_count integer := 0;
begin
  update public.podcast_shows s
  set episode_count = sub.cnt
  from (
    select
      e.show_id,
      count(*)::integer as cnt
    from public.podcast_episodes e
    where e.status = 'approved'
      and e.is_active = true
      and e.playback_status = 'playable'
    group by e.show_id
  ) sub
  where s.id = sub.show_id
    and s.episode_count is distinct from sub.cnt;

  get diagnostics updated_count = row_count;

  update public.podcast_shows s
  set episode_count = 0
  where s.episode_count <> 0
    and not exists (
      select 1
      from public.podcast_episodes e
      where e.show_id = s.id
        and e.status = 'approved'
        and e.is_active = true
        and e.playback_status = 'playable'
    );

  get diagnostics updated_count = updated_count + row_count;
  return updated_count;
end;
$$;

notify pgrst, 'reload schema';

commit;
