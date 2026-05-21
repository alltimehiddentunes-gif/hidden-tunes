-- Hidden Tunes TV catalog — Supabase migration
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Matches admin API expectations in lib/tvCatalog.ts (TV_VIDEO_SELECT / TV_PUBLIC_VIDEO_SELECT).
-- Also includes legacy-friendly columns: artist, youtube_video_id, lane, is_public, sort_order.
--
-- Metadata only. No video downloads or rehosting.

-- ---------------------------------------------------------------------------
-- tv_categories (taxonomy + lane seeds)
-- ---------------------------------------------------------------------------

create table if not exists public.tv_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  type text not null,
  parent_id uuid references public.tv_categories(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tv_categories_slug_unique unique (slug),
  constraint tv_categories_type_check check (
    type in ('genre', 'mood', 'format', 'collection')
  )
);

create index if not exists tv_categories_type_active_sort_idx
  on public.tv_categories (type, is_active, sort_order);

-- ---------------------------------------------------------------------------
-- tv_sources (import sources — required for tv_videos.imported_from_source_id)
-- ---------------------------------------------------------------------------

create table if not exists public.tv_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_url text not null,
  source_id text,
  title text,
  default_category text,
  default_genre text,
  default_mood text,
  scan_frequency text not null default 'weekly',
  auto_approve boolean not null default false,
  is_active boolean not null default true,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tv_sources_type_url_unique unique (source_type, source_url),
  constraint tv_sources_source_type_check check (
    source_type in (
      'youtube_channel',
      'youtube_playlist',
      'youtube_video',
      'archive_collection',
      'hls_stream',
      'm3u_playlist',
      'manual'
    )
  ),
  constraint tv_sources_scan_frequency_check check (
    scan_frequency in ('manual', 'daily', 'weekly', 'monthly')
  )
);

create index if not exists tv_sources_is_active_idx
  on public.tv_sources (is_active);

-- ---------------------------------------------------------------------------
-- tv_videos (public catalog + admin moderation)
-- ---------------------------------------------------------------------------

create table if not exists public.tv_videos (
  id uuid primary key default gen_random_uuid(),

  -- Curated embed catalog (used by mobile public API)
  source_type text not null,
  source_id text not null,
  source_url text not null,
  embed_url text,
  title text not null,
  description text,
  thumbnail_url text,
  duration_seconds integer,
  channel_name text,
  category text,
  genre text,
  mood text,
  format text,
  tags text[] not null default '{}',
  language text,
  region text,
  published_at timestamptz,

  -- Moderation + playback safety (public API filters on these)
  status text not null default 'pending',
  playback_status text not null default 'unchecked',
  is_active boolean not null default false,
  is_featured boolean not null default false,
  imported_from_source_id uuid references public.tv_sources(id) on delete set null,

  -- Legacy / ops-friendly aliases (kept in sync via trigger)
  artist text,
  youtube_video_id text,
  lane text,
  is_public boolean not null default false,
  sort_order integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tv_videos_source_type_id_unique unique (source_type, source_id),
  constraint tv_videos_status_check check (
    status in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
  ),
  constraint tv_videos_playback_status_check check (
    playback_status in (
      'unchecked',
      'playable',
      'failed',
      'blocked',
      'private',
      'deleted',
      'region_blocked',
      'embed_blocked'
    )
  )
);

-- Add columns when upgrading an older partial schema
alter table public.tv_videos add column if not exists source_type text;
alter table public.tv_videos add column if not exists source_id text;
alter table public.tv_videos add column if not exists source_url text;
alter table public.tv_videos add column if not exists embed_url text;
alter table public.tv_videos add column if not exists title text;
alter table public.tv_videos add column if not exists description text;
alter table public.tv_videos add column if not exists thumbnail_url text;
alter table public.tv_videos add column if not exists duration_seconds integer;
alter table public.tv_videos add column if not exists channel_name text;
alter table public.tv_videos add column if not exists category text;
alter table public.tv_videos add column if not exists genre text;
alter table public.tv_videos add column if not exists mood text;
alter table public.tv_videos add column if not exists format text;
alter table public.tv_videos add column if not exists tags text[] not null default '{}';
alter table public.tv_videos add column if not exists language text;
alter table public.tv_videos add column if not exists region text;
alter table public.tv_videos add column if not exists published_at timestamptz;
alter table public.tv_videos add column if not exists status text not null default 'pending';
alter table public.tv_videos add column if not exists playback_status text not null default 'unchecked';
alter table public.tv_videos add column if not exists is_active boolean not null default false;
alter table public.tv_videos add column if not exists is_featured boolean not null default false;
alter table public.tv_videos add column if not exists imported_from_source_id uuid;
alter table public.tv_videos add column if not exists artist text;
alter table public.tv_videos add column if not exists youtube_video_id text;
alter table public.tv_videos add column if not exists lane text;
alter table public.tv_videos add column if not exists is_public boolean not null default false;
alter table public.tv_videos add column if not exists sort_order integer not null default 0;
alter table public.tv_videos add column if not exists created_at timestamptz not null default now();
alter table public.tv_videos add column if not exists updated_at timestamptz not null default now();

-- Indexes required by public API + admin filters
create index if not exists tv_videos_status_idx
  on public.tv_videos (status);

create index if not exists tv_videos_is_public_idx
  on public.tv_videos (is_public);

create index if not exists tv_videos_lane_idx
  on public.tv_videos (lane);

create index if not exists tv_videos_sort_order_idx
  on public.tv_videos (sort_order);

create index if not exists tv_videos_created_at_desc_idx
  on public.tv_videos (created_at desc);

create index if not exists tv_videos_status_active_playback_idx
  on public.tv_videos (status, is_active, playback_status);

create index if not exists tv_videos_genre_idx
  on public.tv_videos (genre);

create index if not exists tv_videos_mood_idx
  on public.tv_videos (mood);

create index if not exists tv_videos_format_idx
  on public.tv_videos (format);

create index if not exists tv_videos_category_idx
  on public.tv_videos (category);

create index if not exists tv_videos_is_featured_idx
  on public.tv_videos (is_featured)
  where is_featured = true;

create index if not exists tv_videos_tags_gin_idx
  on public.tv_videos using gin (tags);

create index if not exists tv_videos_fts_idx
  on public.tv_videos using gin (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(channel_name, '') || ' ' ||
      coalesce(artist, '')
    )
  );

-- ---------------------------------------------------------------------------
-- tv_import_jobs (admin import runner)
-- ---------------------------------------------------------------------------

create table if not exists public.tv_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.tv_sources(id) on delete set null,
  status text not null default 'queued',
  total_found integer not null default 0,
  total_imported integer not null default 0,
  total_skipped integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tv_import_jobs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  )
);

create index if not exists tv_import_jobs_source_id_idx
  on public.tv_import_jobs (source_id);

-- ---------------------------------------------------------------------------
-- Sync legacy columns + is_public from curated fields
-- ---------------------------------------------------------------------------

create or replace function public.sync_tv_videos_derived_columns()
returns trigger
language plpgsql
as $$
begin
  new.channel_name := coalesce(new.channel_name, new.artist);
  new.artist := coalesce(new.artist, new.channel_name);

  if new.source_type = 'youtube_video' and new.source_id is not null then
    new.youtube_video_id := coalesce(new.youtube_video_id, new.source_id);
  end if;

  new.lane := coalesce(
    new.lane,
    new.format,
    new.category,
    new.genre
  );

  new.is_public := (
    new.status = 'approved'
    and new.is_active = true
    and new.playback_status = 'playable'
  );

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.set_tv_videos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tv_videos_sync_derived_columns on public.tv_videos;

create trigger tv_videos_sync_derived_columns
before insert or update on public.tv_videos
for each row
execute function public.sync_tv_videos_derived_columns();

drop trigger if exists tv_videos_set_updated_at on public.tv_videos;

create trigger tv_videos_set_updated_at
before update on public.tv_videos
for each row
execute function public.set_tv_videos_updated_at();

-- Backfill derived columns for any existing rows
update public.tv_videos
set
  artist = coalesce(artist, channel_name),
  youtube_video_id = coalesce(
    youtube_video_id,
    case when source_type = 'youtube_video' then source_id else youtube_video_id end
  ),
  lane = coalesce(lane, format, category, genre),
  is_public = (
    status = 'approved'
    and is_active = true
    and playback_status = 'playable'
  )
where true;

-- ---------------------------------------------------------------------------
-- Row level security (safe public read; writes via service role in admin API)
-- ---------------------------------------------------------------------------

alter table public.tv_videos enable row level security;
alter table public.tv_sources enable row level security;
alter table public.tv_import_jobs enable row level security;

drop policy if exists tv_videos_public_read on public.tv_videos;
create policy tv_videos_public_read
  on public.tv_videos
  for select
  to anon, authenticated
  using (
    status = 'approved'
    and is_active = true
    and playback_status = 'playable'
  );

drop policy if exists tv_videos_service_role_all on public.tv_videos;
create policy tv_videos_service_role_all
  on public.tv_videos
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tv_sources_service_role_all on public.tv_sources;
create policy tv_sources_service_role_all
  on public.tv_sources
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tv_import_jobs_service_role_all on public.tv_import_jobs;
create policy tv_import_jobs_service_role_all
  on public.tv_import_jobs
  for all
  to service_role
  using (true)
  with check (true);

-- Grants for API roles (service role bypasses RLS; anon can read public rows)
grant select on public.tv_videos to anon, authenticated;
grant all on public.tv_videos to service_role;
grant all on public.tv_sources to service_role;
grant all on public.tv_import_jobs to service_role;

-- Notify PostgREST to reload schema cache (Supabase Dashboard SQL editor runs this)
notify pgrst, 'reload schema';
