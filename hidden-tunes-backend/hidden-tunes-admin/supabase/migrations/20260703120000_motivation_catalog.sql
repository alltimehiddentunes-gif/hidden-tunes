-- Hidden Tunes Motivation catalog — production foundation schema.
-- Metadata-first public APIs; playable URLs only via explicit /play endpoints.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- motivation_categories
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_categories_slug_unique unique (slug)
);

create index if not exists motivation_categories_active_sort_idx
  on public.motivation_categories (is_active, sort_order, slug);

-- ---------------------------------------------------------------------------
-- motivation_items
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_items (
  id uuid primary key default gen_random_uuid(),

  slug text,
  title text not null,
  subtitle text,
  description text,
  speaker_name text,
  creator_name text,
  category_slug text,
  categories text[] not null default '{}',

  artwork_url text,
  cover_url text,

  duration_seconds integer,
  language text,
  rights text,

  source_type text not null,
  source_id text not null,
  source_url text not null,
  source_key text,
  embed_url text,

  thumbnail_url text,
  channel_name text,
  category text,
  subcategory text,
  tags text[],
  region text,

  status text not null default 'pending',
  playback_status text not null default 'unchecked',
  is_active boolean not null default false,
  is_verified boolean not null default false,
  is_featured boolean not null default false,
  is_mature boolean not null default false,

  reliability_score integer not null default 100,
  consecutive_failures integer not null default 0,
  last_health_checked_at timestamptz,
  last_health_error text,
  last_checked_at timestamptz,
  quarantined_at timestamptz,
  disabled_at timestamptz,

  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint motivation_items_source_type_check check (
    source_type in (
      'youtube_video',
      'archive_video',
      'hls_stream',
      'mp4_file',
      'manual'
    )
  ),
  constraint motivation_items_status_check check (
    status in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
  ),
  constraint motivation_items_playback_status_check check (
    playback_status in (
      'unchecked',
      'playable',
      'failed',
      'blocked',
      'private',
      'deleted',
      'region_blocked',
      'embed_blocked',
      'offline',
      'pending',
      'rejected'
    )
  ),
  constraint motivation_items_reliability_score_check check (
    reliability_score >= 0 and reliability_score <= 100
  )
);

-- ---------------------------------------------------------------------------
-- motivation_files
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_files (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  title text,
  audio_url text,
  video_url text,
  media_type text not null default 'video',
  mime_type text,
  duration_seconds integer,
  is_primary boolean not null default false,
  playback_status text not null default 'unchecked',
  is_active boolean not null default true,
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_files_media_type_check check (
    media_type in ('audio', 'video', 'stream', 'embed', 'manual')
  ),
  constraint motivation_files_playback_status_check check (
    playback_status in (
      'unchecked',
      'playable',
      'failed',
      'blocked',
      'private',
      'deleted',
      'region_blocked',
      'embed_blocked',
      'offline',
      'pending',
      'rejected'
    )
  )
);

-- ---------------------------------------------------------------------------
-- indexes — categories, search, play lookup, source_key, slug, public catalog
-- ---------------------------------------------------------------------------

create unique index if not exists motivation_items_slug_unique_idx
  on public.motivation_items (slug)
  where slug is not null;

create unique index if not exists motivation_items_source_key_unique_idx
  on public.motivation_items (source_key)
  where source_key is not null;

create unique index if not exists motivation_items_source_pair_unique_idx
  on public.motivation_items (source_type, source_id);

create unique index if not exists motivation_items_source_url_unique_idx
  on public.motivation_items (lower(source_url));

create index if not exists motivation_items_category_slug_idx
  on public.motivation_items (category_slug, sort_order desc, published_at desc, created_at desc)
  where status = 'approved' and is_active = true;

create index if not exists motivation_items_categories_gin_idx
  on public.motivation_items using gin (categories);

create index if not exists motivation_items_public_catalog_idx
  on public.motivation_items (
    status,
    is_active,
    playback_status,
    is_mature,
    category_slug,
    published_at desc,
    sort_order desc,
    id desc
  )
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable';

create index if not exists motivation_items_public_list_idx
  on public.motivation_items (sort_order desc, created_at desc, id desc)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and reliability_score >= 60;

create index if not exists motivation_items_health_due_idx
  on public.motivation_items (last_health_checked_at asc nulls first, id)
  where status in ('pending', 'approved');

create index if not exists motivation_items_category_idx
  on public.motivation_items (category, sort_order desc)
  where status = 'approved' and is_active = true;

create index if not exists motivation_items_search_trgm_idx
  on public.motivation_items using gin (
    (
      coalesce(title, '') || ' ' ||
      coalesce(speaker_name, '') || ' ' ||
      coalesce(creator_name, '') || ' ' ||
      coalesce(channel_name, '') || ' ' ||
      coalesce(description, '')
    ) gin_trgm_ops
  );

create index if not exists motivation_items_play_lookup_idx
  on public.motivation_items (id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable';

create unique index if not exists motivation_files_source_key_unique_idx
  on public.motivation_files (source_key)
  where source_key is not null;

create index if not exists motivation_files_play_idx
  on public.motivation_files (item_id, is_active, playback_status, is_primary desc, id);

create index if not exists motivation_files_item_primary_idx
  on public.motivation_files (item_id)
  where is_primary = true and is_active = true and playback_status = 'playable';

-- ---------------------------------------------------------------------------
-- foreign keys (additive, only when table is new)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'motivation_files_item_id_fkey'
      and conrelid = 'public.motivation_files'::regclass
  ) then
    alter table public.motivation_files
      add constraint motivation_files_item_id_fkey
      foreign key (item_id) references public.motivation_items(id) on delete cascade;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.motivation_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists motivation_categories_touch_updated_at on public.motivation_categories;
create trigger motivation_categories_touch_updated_at
  before update on public.motivation_categories
  for each row execute function public.motivation_touch_updated_at();

drop trigger if exists motivation_items_touch_updated_at on public.motivation_items;
create trigger motivation_items_touch_updated_at
  before update on public.motivation_items
  for each row execute function public.motivation_touch_updated_at();

drop trigger if exists motivation_files_touch_updated_at on public.motivation_files;
create trigger motivation_files_touch_updated_at
  before update on public.motivation_files
  for each row execute function public.motivation_touch_updated_at();

-- ---------------------------------------------------------------------------
-- row level security (metadata-only public reads on approved playable items)
-- ---------------------------------------------------------------------------

alter table public.motivation_categories enable row level security;
alter table public.motivation_items enable row level security;

drop policy if exists motivation_categories_public_read on public.motivation_categories;
create policy motivation_categories_public_read
  on public.motivation_categories
  for select
  using (is_active = true);

drop policy if exists motivation_items_public_read on public.motivation_items;
create policy motivation_items_public_read
  on public.motivation_items
  for select
  using (
    status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and reliability_score >= 60
  );

-- ---------------------------------------------------------------------------
-- canonical motivation categories
-- ---------------------------------------------------------------------------

insert into public.motivation_categories (name, slug, description, sort_order, is_active)
values
  ('Daily Motivation', 'daily-motivation', 'Daily encouragement and momentum', 10, true),
  ('Discipline', 'discipline', 'Consistency, habits, and self-control', 20, true),
  ('Focus', 'focus', 'Concentration and deep work', 30, true),
  ('Success', 'success', 'Achievement and winning mindset', 40, true),
  ('Confidence', 'confidence', 'Self-belief and courage', 50, true),
  ('Healing', 'healing', 'Recovery, peace, and emotional strength', 60, true),
  ('Faith & Purpose', 'faith-purpose', 'Spiritual motivation and purpose', 70, true),
  ('Study Motivation', 'study-motivation', 'Learning drive and academic focus', 80, true),
  ('Fitness Motivation', 'fitness-motivation', 'Training, gym, and physical discipline', 90, true),
  ('Business Motivation', 'business-motivation', 'Entrepreneurship and career drive', 100, true),
  ('Mindset', 'mindset', 'Mental models and growth thinking', 110, true),
  ('Speeches', 'speeches', 'Motivational speeches and talks', 120, true),
  ('Life Lessons', 'life-lessons', 'Stories, wisdom, and perspective', 130, true),
  ('Short Motivationals', 'short-motivationals', 'Quick motivational clips', 140, true)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
