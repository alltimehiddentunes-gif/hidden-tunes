-- Upgrade legacy audiobook tables to the metadata-first catalog schema.
-- Safe to run multiple times.

alter table public.audiobooks
  add column if not exists author_name text,
  add column if not exists narrator_name text,
  add column if not exists series_title text,
  add column if not exists series_position numeric,
  add column if not exists category_slug text,
  add column if not exists categories text[] not null default '{}',
  add column if not exists source_type text,
  add column if not exists source_url text,
  add column if not exists source_key text,
  add column if not exists rights text,
  add column if not exists chapter_count integer not null default 0,
  add column if not exists status text,
  add column if not exists playback_status text,
  add column if not exists is_active boolean,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists last_checked_at timestamptz;

update public.audiobooks
set
  source_type = coalesce(source_type, source, 'manual'),
  source_key = coalesce(
    source_key,
    case
      when source is not null and source_id is not null
        then source || ':book:' || source_id
      else null
    end
  ),
  category_slug = coalesce(
    category_slug,
    (
      select c.slug
      from public.audiobook_categories c
      where c.id = audiobooks.category_id
      limit 1
    )
  ),
  categories = case
    when coalesce(array_length(categories, 1), 0) > 0 then categories
    when category_slug is not null then array[category_slug]
    else categories
  end,
  author_name = coalesce(
    author_name,
    (
      select a.name
      from public.audiobook_authors a
      where a.id = audiobooks.author_id
      limit 1
    )
  ),
  status = coalesce(status, case when is_public is true then 'approved' else 'pending' end),
  playback_status = coalesce(playback_status, case when is_public is true then 'playable' else 'unchecked' end),
  is_active = coalesce(is_active, coalesce(is_public, false)),
  published_at = coalesce(published_at, release_date, created_at),
  last_checked_at = coalesce(last_checked_at, updated_at, now())
where true;

alter table public.audiobook_chapters
  add column if not exists description text,
  add column if not exists source_key text,
  add column if not exists is_active boolean not null default true,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.audiobook_chapters
set
  source_key = coalesce(
    source_key,
    'legacy:chapter:' || audiobook_id::text || ':' || coalesce(chapter_number::text, id::text)
  ),
  is_active = coalesce(is_active, true),
  updated_at = coalesce(updated_at, created_at, now())
where true;

alter table public.audiobook_files
  add column if not exists chapter_id uuid references public.audiobook_chapters(id) on delete set null,
  add column if not exists title text,
  add column if not exists duration_seconds integer,
  add column if not exists mime_type text,
  add column if not exists is_primary boolean not null default false,
  add column if not exists playback_status text,
  add column if not exists is_active boolean not null default true,
  add column if not exists source_key text,
  add column if not exists updated_at timestamptz not null default now();

update public.audiobook_files f
set
  source_key = coalesce(
    f.source_key,
    'legacy:file:' || f.audiobook_id::text || ':' || md5(coalesce(f.audio_url, f.id::text))
  ),
  playback_status = coalesce(f.playback_status, 'playable'),
  is_active = coalesce(f.is_active, true),
  is_primary = coalesce(f.is_primary, false),
  updated_at = coalesce(f.updated_at, f.created_at, now())
where true;

update public.audiobooks b
set chapter_count = (
  select count(*)::integer
  from public.audiobook_chapters c
  where c.audiobook_id = b.id
    and coalesce(c.is_active, true) = true
)
where coalesce(b.chapter_count, 0) = 0;

create unique index if not exists audiobooks_source_key_unique_idx
  on public.audiobooks (source_key)
  where source_key is not null;

create unique index if not exists audiobook_chapters_source_key_unique_idx
  on public.audiobook_chapters (source_key)
  where source_key is not null;

create unique index if not exists audiobook_files_source_key_unique_idx
  on public.audiobook_files (source_key)
  where source_key is not null;

notify pgrst, 'reload schema';
