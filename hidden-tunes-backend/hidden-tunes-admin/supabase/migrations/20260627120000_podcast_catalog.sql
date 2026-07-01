-- Hidden Tunes podcast catalog — Supabase migration
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
--
-- Public mobile API: metadata-only lists; audio_url exposed only via play endpoint.
-- Matches lib/podcastCatalog.ts select constants.

-- ---------------------------------------------------------------------------
-- podcast_categories (browse taxonomy)
-- ---------------------------------------------------------------------------

create table if not exists public.podcast_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint podcast_categories_slug_unique unique (slug)
);

create index if not exists podcast_categories_active_sort_idx
  on public.podcast_categories (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- podcast_shows
-- ---------------------------------------------------------------------------

create table if not exists public.podcast_shows (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  artwork_url text,
  host_name text,
  primary_category text,
  categories text[] not null default '{}',
  language text,
  publisher text,
  feed_url text,
  status text not null default 'pending',
  feed_status text not null default 'unchecked',
  is_verified boolean not null default false,
  is_active boolean not null default false,
  is_featured boolean not null default false,
  is_exclusive boolean not null default false,
  is_mature boolean not null default false,
  episode_count integer not null default 0,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint podcast_shows_slug_unique unique (slug),
  constraint podcast_shows_status_check check (
    status in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
  ),
  constraint podcast_shows_feed_status_check check (
    feed_status in (
      'unchecked',
      'active',
      'inactive',
      'offline',
      'blocked',
      'pending',
      'rejected'
    )
  )
);

create index if not exists podcast_shows_public_catalog_idx
  on public.podcast_shows (status, is_active, feed_status, is_featured, created_at desc);

create index if not exists podcast_shows_primary_category_idx
  on public.podcast_shows (primary_category)
  where status = 'approved' and is_active = true and feed_status = 'active';

-- ---------------------------------------------------------------------------
-- podcast_episodes
-- ---------------------------------------------------------------------------

create table if not exists public.podcast_episodes (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.podcast_shows(id) on delete cascade,
  title text not null,
  description text,
  artwork_url text,
  audio_url text,
  duration_seconds integer,
  published_at timestamptz,
  episode_number integer,
  season_number integer,
  status text not null default 'pending',
  playback_status text not null default 'unchecked',
  is_verified boolean not null default false,
  is_active boolean not null default false,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint podcast_episodes_status_check check (
    status in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
  ),
  constraint podcast_episodes_playback_status_check check (
    playback_status in (
      'unchecked',
      'playable',
      'failed',
      'blocked',
      'offline',
      'pending',
      'rejected'
    )
  )
);

create index if not exists podcast_episodes_show_public_idx
  on public.podcast_episodes (show_id, status, is_active, playback_status, published_at desc);

create index if not exists podcast_episodes_public_play_idx
  on public.podcast_episodes (id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.podcast_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists podcast_shows_touch_updated_at on public.podcast_shows;
create trigger podcast_shows_touch_updated_at
  before update on public.podcast_shows
  for each row execute function public.podcast_touch_updated_at();

drop trigger if exists podcast_episodes_touch_updated_at on public.podcast_episodes;
create trigger podcast_episodes_touch_updated_at
  before update on public.podcast_episodes
  for each row execute function public.podcast_touch_updated_at();

-- ---------------------------------------------------------------------------
-- episode_count maintenance
-- ---------------------------------------------------------------------------

create or replace function public.podcast_refresh_show_episode_count(target_show_id uuid)
returns void
language sql
as $$
  update public.podcast_shows
  set episode_count = (
    select count(*)::integer
    from public.podcast_episodes e
    where e.show_id = target_show_id
      and e.status = 'approved'
      and e.is_active = true
      and e.playback_status = 'playable'
  )
  where id = target_show_id;
$$;

create or replace function public.podcast_episodes_refresh_show_count()
returns trigger
language plpgsql
as $$
begin
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

drop trigger if exists podcast_episodes_refresh_show_count on public.podcast_episodes;
create trigger podcast_episodes_refresh_show_count
  after insert or update or delete on public.podcast_episodes
  for each row execute function public.podcast_episodes_refresh_show_count();

-- ---------------------------------------------------------------------------
-- starter categories (taxonomy only — no fake shows)
-- ---------------------------------------------------------------------------

insert into public.podcast_categories (name, slug, sort_order)
values
  ('Business', 'business', 10),
  ('Technology', 'technology', 20),
  ('Health', 'health', 30),
  ('Education', 'education', 40),
  ('News', 'news', 50),
  ('Comedy', 'comedy', 60),
  ('Society & Culture', 'society-culture', 70),
  ('Music', 'music', 80),
  ('Sports', 'sports', 90),
  ('True Crime', 'true-crime', 100)
on conflict (slug) do nothing;
