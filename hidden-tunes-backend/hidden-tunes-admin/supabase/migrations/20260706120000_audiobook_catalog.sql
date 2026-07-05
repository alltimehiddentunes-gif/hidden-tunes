-- Hidden Tunes audiobook catalog foundation.
-- Metadata-first public APIs; audio_url is stored only in audiobook_files and
-- exposed only by explicit play endpoints.

create extension if not exists pg_trgm;

create table if not exists public.audiobook_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint audiobook_categories_slug_unique unique (slug)
);

create table if not exists public.audiobook_authors (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  source_type text,
  source_id text,
  source_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audiobook_authors_slug_unique unique (slug),
  constraint audiobook_authors_source_key_unique unique (source_key)
);

create table if not exists public.audiobook_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text,
  author_id uuid references public.audiobook_authors(id) on delete set null,
  source_type text,
  source_id text,
  source_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audiobook_series_slug_unique unique (slug),
  constraint audiobook_series_source_key_unique unique (source_key)
);

create table if not exists public.audiobooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  cover_url text,
  author_id uuid references public.audiobook_authors(id) on delete set null,
  author_name text,
  narrator_name text,
  series_id uuid references public.audiobook_series(id) on delete set null,
  series_title text,
  series_position numeric,
  category_slug text,
  categories text[] not null default '{}',
  language text,
  publisher text,
  source_type text not null default 'manual',
  source_url text,
  source_key text,
  rights text,
  duration_seconds integer,
  chapter_count integer not null default 0,
  status text not null default 'pending',
  playback_status text not null default 'unchecked',
  is_active boolean not null default false,
  is_verified boolean not null default false,
  is_featured boolean not null default false,
  is_mature boolean not null default false,
  published_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audiobooks_slug_unique unique (slug),
  constraint audiobooks_source_key_unique unique (source_key),
  constraint audiobooks_status_check check (
    status in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
  ),
  constraint audiobooks_playback_status_check check (
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

create table if not exists public.audiobook_chapters (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  title text not null,
  description text,
  chapter_number integer,
  duration_seconds integer,
  source_key text,
  is_active boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audiobook_chapters_source_key_unique unique (source_key)
);

create table if not exists public.audiobook_files (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  chapter_id uuid references public.audiobook_chapters(id) on delete set null,
  title text,
  audio_url text not null,
  duration_seconds integer,
  format text,
  mime_type text,
  bitrate integer,
  is_primary boolean not null default false,
  playback_status text not null default 'unchecked',
  is_active boolean not null default true,
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audiobook_files_source_key_unique unique (source_key),
  constraint audiobook_files_playback_status_check check (
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

create index if not exists audiobook_categories_active_sort_idx
  on public.audiobook_categories (is_active, sort_order);

create index if not exists audiobooks_public_catalog_idx
  on public.audiobooks (is_mature, status, is_active, playback_status, category_slug, published_at desc, id desc);

create index if not exists audiobooks_search_trgm_idx
  on public.audiobooks using gin ((title || ' ' || coalesce(author_name, '') || ' ' || coalesce(description, '')) gin_trgm_ops);

create index if not exists audiobooks_categories_gin_idx
  on public.audiobooks using gin (categories);

create index if not exists audiobook_chapters_public_idx
  on public.audiobook_chapters (audiobook_id, is_active, chapter_number, id);

create index if not exists audiobook_files_play_idx
  on public.audiobook_files (audiobook_id, is_active, playback_status, is_primary desc, id);

create or replace function public.audiobook_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists audiobook_authors_touch_updated_at on public.audiobook_authors;
create trigger audiobook_authors_touch_updated_at
  before update on public.audiobook_authors
  for each row execute function public.audiobook_touch_updated_at();

drop trigger if exists audiobook_series_touch_updated_at on public.audiobook_series;
create trigger audiobook_series_touch_updated_at
  before update on public.audiobook_series
  for each row execute function public.audiobook_touch_updated_at();

drop trigger if exists audiobooks_touch_updated_at on public.audiobooks;
create trigger audiobooks_touch_updated_at
  before update on public.audiobooks
  for each row execute function public.audiobook_touch_updated_at();

drop trigger if exists audiobook_chapters_touch_updated_at on public.audiobook_chapters;
create trigger audiobook_chapters_touch_updated_at
  before update on public.audiobook_chapters
  for each row execute function public.audiobook_touch_updated_at();

drop trigger if exists audiobook_files_touch_updated_at on public.audiobook_files;
create trigger audiobook_files_touch_updated_at
  before update on public.audiobook_files
  for each row execute function public.audiobook_touch_updated_at();

insert into public.audiobook_categories (name, slug, sort_order)
values
  ('Fiction', 'fiction', 10),
  ('Non-fiction', 'non-fiction', 20),
  ('Business', 'business', 30),
  ('Self Development', 'self-development', 40),
  ('Education', 'education', 50),
  ('Biography', 'biography', 60),
  ('History', 'history', 70),
  ('Science', 'science', 80),
  ('Faith', 'faith', 90),
  ('Health', 'health', 100),
  ('Language Learning', 'language-learning', 110),
  ('Children', 'children', 120),
  ('Classics', 'classics', 130),
  ('Mature', 'mature', 900)
on conflict (slug) do nothing;
