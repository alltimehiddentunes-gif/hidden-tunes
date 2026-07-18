-- Additive: multi-provider Concerts expansion toward 25k playable items.
-- No artificial catalogue caps. No public seed rows.

create extension if not exists pgcrypto;

-- Discovery seeds / progress checkpoints (internal)
create table if not exists public.concert_discovery_seeds (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique,
  name text not null,
  provider text not null,
  country_code text,
  language_codes text[] not null default '{}'::text[],
  discovery_url text not null,
  category text,
  enabled boolean not null default true,
  last_discovered_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists concert_discovery_seeds_provider_idx
  on public.concert_discovery_seeds (provider, enabled);

create index if not exists concert_discovery_seeds_country_idx
  on public.concert_discovery_seeds (country_code)
  where country_code is not null;

create table if not exists public.concert_scale_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  discovered integer not null default 0,
  imported integer not null default 0,
  tested integer not null default 0,
  playable integer not null default 0,
  currently_live integer not null default 0,
  upcoming integer not null default 0,
  replay integer not null default 0,
  failed integer not null default 0,
  duplicates integer not null default 0,
  quarantined integer not null default 0,
  by_country jsonb not null default '{}'::jsonb,
  by_language jsonb not null default '{}'::jsonb,
  by_provider jsonb not null default '{}'::jsonb,
  by_category jsonb not null default '{}'::jsonb,
  target integer not null default 25000,
  notes text[] not null default '{}'::text[],
  measured boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists concert_scale_progress_snapshots_created_idx
  on public.concert_scale_progress_snapshots (created_at desc);

-- Playback method on streams for multi-provider app path
alter table public.concert_streams
  add column if not exists playback_method text,
  add column if not exists app_embed_url text,
  add column if not exists app_stream_url text,
  add column if not exists last_playback_validation_at timestamptz,
  add column if not exists last_playback_validation_ok boolean;

create index if not exists concert_streams_playback_method_idx
  on public.concert_streams (playback_method)
  where playback_method is not null;

create index if not exists concert_items_public_playable_provider_idx
  on public.concert_items (is_public, playback_status, visibility_status, published_at desc)
  where is_public = true and playback_status = 'playable';

alter table public.concert_discovery_seeds enable row level security;
alter table public.concert_scale_progress_snapshots enable row level security;

drop policy if exists concert_discovery_seeds_no_public on public.concert_discovery_seeds;
create policy concert_discovery_seeds_no_public
  on public.concert_discovery_seeds for select using (false);

drop policy if exists concert_scale_progress_snapshots_no_public
  on public.concert_scale_progress_snapshots;
create policy concert_scale_progress_snapshots_no_public
  on public.concert_scale_progress_snapshots for select using (false);

revoke all on public.concert_discovery_seeds from anon, authenticated;
revoke all on public.concert_scale_progress_snapshots from anon, authenticated;

drop trigger if exists concert_discovery_seeds_touch_updated_at on public.concert_discovery_seeds;
create trigger concert_discovery_seeds_touch_updated_at
  before update on public.concert_discovery_seeds
  for each row execute function public.concerts_touch_updated_at();

notify pgrst, 'reload schema';

-- Expand media provider vocabulary for multi-provider catalogue
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'concert_sources_provider_check'
  ) then
    alter table public.concert_sources drop constraint concert_sources_provider_check;
  end if;

  alter table public.concert_sources
    add constraint concert_sources_provider_check
    check (
      provider in (
        'youtube',
        'vimeo',
        'dailymotion',
        'twitch',
        'hls',
        'dash',
        'iframe',
        'official_website',
        'authorized_platform',
        'public_broadcaster_player',
        'festival_player',
        'venue_player',
        'other'
      )
    );
end $$;
