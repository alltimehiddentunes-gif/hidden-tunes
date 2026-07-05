-- Repair production audiobook tables to match the committed metadata-first
-- catalog schema without dropping or rewriting existing LibriVox data.

create extension if not exists pg_trgm;

create table if not exists public.audiobook_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
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
  updated_at timestamptz not null default now()
);

create table if not exists public.audiobook_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text,
  description text,
  author_id uuid references public.audiobook_authors(id) on delete set null,
  source_type text,
  source_id text,
  source_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audiobooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  cover_url text,
  author_id uuid references public.audiobook_authors(id) on delete set null,
  series_id uuid references public.audiobook_series(id) on delete set null,
  language text,
  publisher text,
  duration_seconds integer,
  is_mature boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audiobook_chapters (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  title text not null,
  chapter_number integer,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.audiobook_files (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  audio_url text not null,
  format text,
  bitrate integer,
  created_at timestamptz not null default now()
);

alter table public.audiobook_categories
  add column if not exists description text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now();

alter table public.audiobook_authors
  add column if not exists description text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists source_key text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.audiobook_series
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists author_id uuid references public.audiobook_authors(id) on delete set null,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists source_key text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.audiobooks
  add column if not exists author_name text,
  add column if not exists narrator_name text,
  add column if not exists series_title text,
  add column if not exists series_position numeric,
  add column if not exists category_slug text,
  add column if not exists categories text[] not null default '{}',
  add column if not exists source_type text not null default 'manual',
  add column if not exists source_url text,
  add column if not exists source_key text,
  add column if not exists rights text,
  add column if not exists chapter_count integer not null default 0,
  add column if not exists status text not null default 'pending',
  add column if not exists playback_status text not null default 'unchecked',
  add column if not exists is_active boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists last_checked_at timestamptz;

alter table public.audiobook_chapters
  add column if not exists description text,
  add column if not exists source_key text,
  add column if not exists is_active boolean not null default true,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.audiobook_files
  add column if not exists chapter_id uuid references public.audiobook_chapters(id) on delete set null,
  add column if not exists title text,
  add column if not exists duration_seconds integer,
  add column if not exists mime_type text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists playback_status text not null default 'unchecked',
  add column if not exists is_active boolean not null default true,
  add column if not exists source_key text,
  add column if not exists updated_at timestamptz not null default now();

insert into public.audiobook_categories (name, slug, sort_order)
select seed.name, seed.slug, seed.sort_order
from (
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
) as seed(name, slug, sort_order)
where not exists (
  select 1
  from public.audiobook_categories category
  where category.slug = seed.slug
);

update public.audiobook_categories
set is_active = true
where is_active is distinct from true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobook_authors'
      and column_name = 'bio'
  ) then
    execute 'update public.audiobook_authors set description = coalesce(description, bio) where description is null';
  end if;
end $$;

update public.audiobook_authors
set
  source_type = coalesce(source_type, 'librivox'),
  source_key = coalesce(source_key, nullif(slug, '')),
  is_active = true,
  updated_at = coalesce(updated_at, created_at, now());

update public.audiobook_series
set
  title = coalesce(nullif(title, ''), slug),
  source_type = coalesce(source_type, 'librivox'),
  source_key = coalesce(source_key, nullif(slug, '')),
  is_active = true,
  updated_at = coalesce(updated_at, created_at, now());

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'source'
  ) then
    execute 'update public.audiobooks set source_type = coalesce(source_type, nullif(source, ''''), ''manual'')';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'source_id'
  ) then
    execute 'update public.audiobooks set source_key = coalesce(source_key, source_type || '':'' || nullif(source_id, '''')) where source_id is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'category_id'
  ) then
    update public.audiobooks book
    set category_slug = coalesce(book.category_slug, category.slug)
    from public.audiobook_categories category
    where book.category_id = category.id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'release_date'
  ) then
    execute 'update public.audiobooks set published_at = coalesce(published_at, release_date::timestamptz) where release_date is not null';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'is_public'
  ) then
    execute 'update public.audiobooks set status = case when is_public then ''approved'' else status end, is_active = case when is_public then true else is_active end';
  end if;
end $$;

update public.audiobooks book
set author_name = coalesce(book.author_name, author.name)
from public.audiobook_authors author
where book.author_id = author.id;

update public.audiobooks book
set series_title = coalesce(book.series_title, series.title)
from public.audiobook_series series
where book.series_id = series.id;

update public.audiobooks
set
  category_slug = coalesce(category_slug, case when is_mature then 'mature' else 'fiction' end),
  categories = case
    when categories is null or cardinality(categories) = 0 then array[coalesce(category_slug, case when is_mature then 'mature' else 'fiction' end)]
    else categories
  end,
  status = coalesce(status, 'pending'),
  playback_status = coalesce(playback_status, 'unchecked'),
  is_active = coalesce(is_active, false),
  is_verified = coalesce(is_verified, false),
  is_featured = coalesce(is_featured, false),
  published_at = coalesce(published_at, created_at),
  last_checked_at = coalesce(last_checked_at, now());

update public.audiobooks book
set chapter_count = counts.chapter_count
from (
  select audiobook_id, count(*)::integer as chapter_count
  from public.audiobook_chapters
  group by audiobook_id
) counts
where book.id = counts.audiobook_id;

update public.audiobook_chapters
set
  source_key = coalesce(
    source_key,
    nullif(slug, ''),
    audiobook_id::text || ':chapter:' || coalesce(chapter_number::text, id::text)
  ),
  is_active = true,
  published_at = coalesce(published_at, created_at),
  updated_at = coalesce(updated_at, created_at, now());

update public.audiobook_files file
set chapter_id = chapter.id
from public.audiobook_chapters chapter
where file.chapter_id is null
  and file.audiobook_id = chapter.audiobook_id
  and file.audio_url = chapter.audio_url;

update public.audiobook_files file
set
  title = coalesce(file.title, chapter.title, book.title),
  duration_seconds = coalesce(file.duration_seconds, chapter.duration_seconds),
  mime_type = coalesce(
    file.mime_type,
    case
      when lower(coalesce(file.format, '')) = 'mp3' or file.audio_url ilike '%.mp3%' then 'audio/mpeg'
      when lower(coalesce(file.format, '')) = 'm4b' or file.audio_url ilike '%.m4b%' then 'audio/mp4'
      when lower(coalesce(file.format, '')) = 'ogg' or file.audio_url ilike '%.ogg%' then 'audio/ogg'
      else null
    end
  ),
  playback_status = case
    when file.audio_url ilike 'https://%' then 'playable'
    else coalesce(file.playback_status, 'unchecked')
  end,
  is_active = true,
  source_key = coalesce(
    file.source_key,
    chapter.source_key || ':file:' || file.id::text,
    file.audiobook_id::text || ':file:' || file.id::text
  ),
  updated_at = coalesce(file.updated_at, file.created_at, now())
from public.audiobooks book
left join public.audiobook_chapters chapter on chapter.id = file.chapter_id
where file.audiobook_id = book.id;

with ranked_files as (
  select
    id,
    row_number() over (
      partition by audiobook_id
      order by
        case when audio_url ilike 'https://%' then 0 else 1 end,
        created_at asc,
        id asc
    ) as rn
  from public.audiobook_files
  where is_active = true
)
update public.audiobook_files file
set is_primary = ranked_files.rn = 1
from ranked_files
where file.id = ranked_files.id;

update public.audiobooks book
set playback_status = 'playable'
where exists (
  select 1
  from public.audiobook_files file
  where file.audiobook_id = book.id
    and file.is_active = true
    and file.playback_status = 'playable'
    and file.audio_url ilike 'https://%'
);

create or replace function public.audiobook_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'audiobooks_status_check'
      and conrelid = 'public.audiobooks'::regclass
  ) then
    alter table public.audiobooks
      add constraint audiobooks_status_check
      check (status in ('pending', 'approved', 'rejected', 'blocked', 'inactive'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'audiobooks_playback_status_check'
      and conrelid = 'public.audiobooks'::regclass
  ) then
    alter table public.audiobooks
      add constraint audiobooks_playback_status_check
      check (playback_status in ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'audiobook_files_playback_status_check'
      and conrelid = 'public.audiobook_files'::regclass
  ) then
    alter table public.audiobook_files
      add constraint audiobook_files_playback_status_check
      check (playback_status in ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected'));
  end if;
end $$;

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

create unique index if not exists audiobook_categories_slug_unique_idx
  on public.audiobook_categories (slug);

create unique index if not exists audiobook_authors_slug_unique_idx
  on public.audiobook_authors (slug);

create unique index if not exists audiobook_authors_source_key_unique_idx
  on public.audiobook_authors (source_key)
  where source_key is not null;

create unique index if not exists audiobook_series_slug_unique_idx
  on public.audiobook_series (slug);

create unique index if not exists audiobook_series_source_key_unique_idx
  on public.audiobook_series (source_key)
  where source_key is not null;

create unique index if not exists audiobooks_slug_unique_idx
  on public.audiobooks (slug);

create unique index if not exists audiobooks_source_key_unique_idx
  on public.audiobooks (source_key)
  where source_key is not null;

create unique index if not exists audiobook_chapters_source_key_unique_idx
  on public.audiobook_chapters (source_key)
  where source_key is not null;

create unique index if not exists audiobook_files_source_key_unique_idx
  on public.audiobook_files (source_key)
  where source_key is not null;

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
