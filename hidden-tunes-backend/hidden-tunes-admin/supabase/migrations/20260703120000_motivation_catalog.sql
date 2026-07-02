-- Hidden Tunes Motivation catalog — dedicated playable motivation content.
-- Metadata on list APIs; stream URLs only via play endpoint after tap.

create table if not exists public.motivation_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint motivation_categories_slug_unique unique (slug)
);

create table if not exists public.motivation_items (
  id uuid primary key default gen_random_uuid(),

  source_type text not null,
  source_id text not null,
  source_url text not null,
  embed_url text,

  title text not null,
  description text,
  thumbnail_url text,
  channel_name text,

  category text,
  subcategory text,
  tags text[],
  language text,
  region text,
  duration_seconds integer,

  status text not null default 'pending',
  playback_status text not null default 'unchecked',
  is_active boolean not null default false,
  is_featured boolean not null default false,
  reliability_score integer not null default 100,
  consecutive_failures integer not null default 0,
  last_health_checked_at timestamptz,
  last_health_error text,
  quarantined_at timestamptz,
  disabled_at timestamptz,
  source_key text,
  sort_order integer not null default 0,

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
      'embed_blocked'
    )
  ),
  constraint motivation_items_reliability_score_check check (
    reliability_score >= 0 and reliability_score <= 100
  )
);

create unique index if not exists motivation_items_source_key_unique_idx
  on public.motivation_items (source_key)
  where source_key is not null;

create unique index if not exists motivation_items_source_pair_unique_idx
  on public.motivation_items (source_type, source_id);

create unique index if not exists motivation_items_source_url_unique_idx
  on public.motivation_items (lower(source_url));

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

alter table public.motivation_items enable row level security;

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

insert into public.motivation_categories (name, slug, sort_order)
values
  ('Motivation', 'motivation', 100),
  ('Motivational speeches', 'motivational-speeches', 110),
  ('Self-improvement', 'self-improvement', 120),
  ('Business motivation', 'business-motivation', 130),
  ('Gym motivation', 'gym-motivation', 140),
  ('Study motivation', 'study-motivation', 150),
  ('Faith motivation', 'faith-motivation', 160),
  ('Success stories', 'success-stories', 170),
  ('Mindset', 'mindset', 180),
  ('Discipline', 'discipline', 190),
  ('Focus', 'focus', 200),
  ('Emotional Worlds', 'emotional-worlds', 210)
on conflict (slug) do nothing;
