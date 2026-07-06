-- Repair production audiobook tables to match the committed metadata-first
-- catalog schema without dropping tables, dropping columns, or deleting data.

begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Base tables. Existing production tables and rows are preserved.
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
  author_id uuid,
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
  author_id uuid,
  series_id uuid,
  language text,
  publisher text,
  duration_seconds integer,
  is_mature boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audiobook_chapters (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null,
  title text not null,
  chapter_number integer,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

create table if not exists public.audiobook_files (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null,
  audio_url text not null,
  format text,
  bitrate integer,
  created_at timestamptz not null default now()
);

-- Add metadata-first columns. These statements are safe to rerun.
alter table public.audiobook_categories
  add column if not exists description text,
  add column if not exists is_active boolean default true,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now();

alter table public.audiobook_authors
  add column if not exists description text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists source_key text,
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

alter table public.audiobook_series
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists author_id uuid,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists source_key text,
  add column if not exists is_active boolean default true,
  add column if not exists updated_at timestamptz default now();

alter table public.audiobooks
  add column if not exists author_name text,
  add column if not exists narrator_name text,
  add column if not exists series_title text,
  add column if not exists series_position numeric,
  add column if not exists category_slug text,
  add column if not exists categories text[] default '{}',
  add column if not exists source_type text default 'manual',
  add column if not exists source_url text,
  add column if not exists source_key text,
  add column if not exists rights text,
  add column if not exists chapter_count integer default 0,
  add column if not exists status text default 'pending',
  add column if not exists playback_status text default 'unchecked',
  add column if not exists is_active boolean default false,
  add column if not exists is_verified boolean default false,
  add column if not exists is_featured boolean default false,
  add column if not exists published_at timestamptz,
  add column if not exists last_checked_at timestamptz;

alter table public.audiobook_chapters
  add column if not exists description text,
  add column if not exists source_key text,
  add column if not exists is_active boolean default true,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz default now();

alter table public.audiobook_files
  add column if not exists chapter_id uuid,
  add column if not exists title text,
  add column if not exists duration_seconds integer,
  add column if not exists mime_type text,
  add column if not exists is_primary boolean default false,
  add column if not exists playback_status text default 'unchecked',
  add column if not exists is_active boolean default true,
  add column if not exists source_key text,
  add column if not exists updated_at timestamptz default now();

-- Seed canonical category rows without assuming a unique constraint already exists.
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
  from public.audiobook_categories existing
  where existing.slug = seed.slug
);

-- Backfills use dynamic SQL so the same file is safe in Supabase SQL editor
-- even when the table was parsed before the new columns existed.
do $$
begin
  execute $sql$
    update public.audiobook_categories
    set
      is_active = coalesce(is_active, true),
      sort_order = coalesce(sort_order, 0),
      created_at = coalesce(created_at, now())
    where is_active is null
       or sort_order is null
       or created_at is null
  $sql$;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobook_authors'
      and column_name = 'bio'
  ) then
    execute $sql$
      update public.audiobook_authors
      set description = bio
      where description is null
        and bio is not null
    $sql$;
  end if;

  execute $sql$
    update public.audiobook_authors
    set
      source_type = coalesce(nullif(source_type, ''), 'librivox'),
      source_key = coalesce(source_key, nullif(slug, '')),
      is_active = coalesce(is_active, true),
      updated_at = coalesce(updated_at, created_at, now())
    where source_type is null
       or source_type = ''
       or source_key is null
       or is_active is null
       or updated_at is null
  $sql$;

  execute $sql$
    update public.audiobook_series
    set
      title = coalesce(nullif(title, ''), slug),
      source_type = coalesce(nullif(source_type, ''), 'librivox'),
      source_key = coalesce(source_key, nullif(slug, '')),
      is_active = coalesce(is_active, true),
      updated_at = coalesce(updated_at, created_at, now())
    where title is null
       or title = ''
       or source_type is null
       or source_type = ''
       or source_key is null
       or is_active is null
       or updated_at is null
  $sql$;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'source'
  ) then
    execute $sql$
      update public.audiobooks
      set source_type = coalesce(nullif(source_type, ''), nullif(source, ''), 'manual')
      where source_type is null
         or source_type = ''
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'source_id'
  ) then
    execute $sql$
      update public.audiobooks
      set source_key = coalesce(source_key, source_type || ':' || nullif(source_id, ''))
      where source_key is null
        and source_id is not null
        and nullif(source_id, '') is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'category_id'
  ) then
    execute $sql$
      update public.audiobooks book
      set category_slug = category.slug
      from public.audiobook_categories category
      where book.category_slug is null
        and book.category_id = category.id
    $sql$;
  end if;

  execute $sql$
    update public.audiobooks book
    set author_name = author.name
    from public.audiobook_authors author
    where book.author_name is null
      and book.author_id = author.id
  $sql$;

  execute $sql$
    update public.audiobooks book
    set series_title = series.title
    from public.audiobook_series series
    where book.series_title is null
      and book.series_id = series.id
  $sql$;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'release_date'
  ) then
    execute $sql$
      update public.audiobooks
      set published_at = release_date::timestamptz
      where published_at is null
        and release_date is not null
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobooks'
      and column_name = 'is_public'
  ) then
    execute $sql$
      update public.audiobooks
      set
        status = case when is_public is true then 'approved' else coalesce(status, 'pending') end,
        is_active = case when is_public is true then true else coalesce(is_active, false) end
      where status is null
         or is_active is null
         or is_public is true
    $sql$;
  end if;

  execute $sql$
    update public.audiobooks
    set category_slug = case
      when is_mature is true then 'mature'
      else 'fiction'
    end
    where category_slug is null
  $sql$;

  execute $sql$
    update public.audiobooks
    set categories = array[category_slug]
    where (categories is null or cardinality(categories) = 0)
      and category_slug is not null
  $sql$;

  execute $sql$
    update public.audiobooks
    set
      source_type = coalesce(nullif(source_type, ''), 'manual'),
      status = case
        when coalesce(nullif(status, ''), 'pending') in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
          then coalesce(nullif(status, ''), 'pending')
        else 'pending'
      end,
      playback_status = case
        when coalesce(nullif(playback_status, ''), 'unchecked') in ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected')
          then coalesce(nullif(playback_status, ''), 'unchecked')
        else 'unchecked'
      end,
      is_active = coalesce(is_active, false),
      is_verified = coalesce(is_verified, false),
      is_featured = coalesce(is_featured, false),
      categories = coalesce(categories, '{}'),
      chapter_count = coalesce(chapter_count, 0),
      published_at = coalesce(published_at, created_at),
      last_checked_at = coalesce(last_checked_at, now()),
      updated_at = coalesce(updated_at, created_at, now())
    where source_type is null
       or source_type = ''
       or status is null
       or status = ''
       or status not in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
       or playback_status is null
       or playback_status = ''
       or playback_status not in ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected')
       or is_active is null
       or is_verified is null
       or is_featured is null
       or categories is null
       or chapter_count is null
       or published_at is null
       or last_checked_at is null
       or updated_at is null
  $sql$;

  execute $sql$
    update public.audiobook_chapters
    set
      description = coalesce(description, ''),
      source_key = coalesce(
        source_key,
        'librivox:chapter:' || audiobook_id::text || ':' || coalesce(chapter_number::text, id::text)
      ),
      is_active = coalesce(is_active, true),
      published_at = coalesce(published_at, created_at),
      updated_at = coalesce(updated_at, created_at, now())
    where description is null
       or source_key is null
       or is_active is null
       or published_at is null
       or updated_at is null
  $sql$;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'audiobook_chapters'
      and column_name = 'audio_url'
  ) then
    execute $sql$
      insert into public.audiobook_files (
        audiobook_id,
        chapter_id,
        title,
        audio_url,
        duration_seconds,
        format,
        mime_type,
        is_primary,
        playback_status,
        is_active,
        source_key,
        created_at,
        updated_at
      )
      select
        chapter.audiobook_id,
        chapter.id,
        chapter.title,
        chapter.audio_url,
        chapter.duration_seconds,
        case
          when chapter.audio_url ilike '%.mp3%' then 'mp3'
          when chapter.audio_url ilike '%.m4b%' then 'm4b'
          when chapter.audio_url ilike '%.ogg%' then 'ogg'
          else null
        end,
        case
          when chapter.audio_url ilike '%.mp3%' then 'audio/mpeg'
          when chapter.audio_url ilike '%.m4b%' then 'audio/mp4'
          when chapter.audio_url ilike '%.ogg%' then 'audio/ogg'
          else null
        end,
        false,
        case when chapter.audio_url ilike 'https://%' then 'playable' else 'unchecked' end,
        true,
        'librivox:file:' || chapter.audiobook_id::text || ':' || md5(chapter.audio_url),
        coalesce(chapter.created_at, now()),
        coalesce(chapter.updated_at, chapter.created_at, now())
      from public.audiobook_chapters chapter
      where chapter.audio_url is not null
        and btrim(chapter.audio_url) <> ''
        and not exists (
          select 1
          from public.audiobook_files existing
          where existing.audiobook_id = chapter.audiobook_id
            and existing.audio_url = chapter.audio_url
        )
    $sql$;

    execute $sql$
      update public.audiobook_files file
      set chapter_id = chapter.id
      from public.audiobook_chapters chapter
      where file.chapter_id is null
        and file.audiobook_id = chapter.audiobook_id
        and file.audio_url = chapter.audio_url
    $sql$;
  end if;

  execute $sql$
    update public.audiobook_files file
    set
      title = coalesce(
        file.title,
        (
          select chapter.title
          from public.audiobook_chapters chapter
          where chapter.id = file.chapter_id
          limit 1
        ),
        (
          select book.title
          from public.audiobooks book
          where book.id = file.audiobook_id
          limit 1
        )
      ),
      duration_seconds = coalesce(
        file.duration_seconds,
        (
          select chapter.duration_seconds
          from public.audiobook_chapters chapter
          where chapter.id = file.chapter_id
          limit 1
        )
      ),
      mime_type = coalesce(
        file.mime_type,
        case
          when lower(coalesce(file.format, '')) = 'mp3' or file.audio_url ilike '%.mp3%' then 'audio/mpeg'
          when lower(coalesce(file.format, '')) = 'm4b' or file.audio_url ilike '%.m4b%' then 'audio/mp4'
          when lower(coalesce(file.format, '')) = 'ogg' or file.audio_url ilike '%.ogg%' then 'audio/ogg'
          else null
        end
      ),
      playback_status = coalesce(
        nullif(file.playback_status, ''),
        case when file.audio_url ilike 'https://%' then 'playable' else 'unchecked' end
      ),
      is_active = coalesce(file.is_active, true),
      source_key = coalesce(
        file.source_key,
        'librivox:file:' || file.audiobook_id::text || ':' || md5(coalesce(file.audio_url, file.id::text))
      ),
      updated_at = coalesce(file.updated_at, file.created_at, now())
    where exists (
        select 1
        from public.audiobooks book
        where book.id = file.audiobook_id
      )
      and (
        file.title is null
        or file.duration_seconds is null
        or file.mime_type is null
        or file.playback_status is null
        or file.playback_status = ''
        or file.playback_status not in ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected')
        or file.is_active is null
        or file.source_key is null
        or file.updated_at is null
      )
  $sql$;

  execute $sql$
    update public.audiobook_files
    set playback_status = case
      when audio_url ilike 'https://%' then 'playable'
      else 'unchecked'
    end
    where playback_status is null
       or playback_status = ''
       or playback_status not in ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected')
  $sql$;

  execute $sql$
    with ranked_files as (
      select
        id,
        row_number() over (
          partition by audiobook_id
          order by
            case when audio_url ilike 'https://%' then 0 else 1 end,
            case when playback_status = 'playable' then 0 else 1 end,
            created_at asc,
            id asc
        ) as rank
      from public.audiobook_files
      where coalesce(is_active, true) = true
    )
    update public.audiobook_files file
    set is_primary = ranked_files.rank = 1
    from ranked_files
    where file.id = ranked_files.id
      and file.is_primary is distinct from (ranked_files.rank = 1)
  $sql$;

  execute $sql$
    update public.audiobooks book
    set chapter_count = counts.chapter_count
    from (
      select audiobook_id, count(*)::integer as chapter_count
      from public.audiobook_chapters
      where coalesce(is_active, true) = true
      group by audiobook_id
    ) counts
    where book.id = counts.audiobook_id
      and book.chapter_count is distinct from counts.chapter_count
  $sql$;

  execute $sql$
    update public.audiobooks book
    set playback_status = 'playable'
    where playback_status is distinct from 'playable'
      and exists (
        select 1
        from public.audiobook_files file
        where file.audiobook_id = book.id
          and coalesce(file.is_active, true) = true
          and file.playback_status = 'playable'
          and file.audio_url ilike 'https://%'
      )
  $sql$;
end $$;

-- Updated-at trigger, matching the metadata-first modules.
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

-- Safe check constraints. Values were normalized above.
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

-- Non-destructive indexes used by public APIs and import scripts.
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

create index if not exists audiobook_files_chapter_idx
  on public.audiobook_files (chapter_id)
  where chapter_id is not null;

-- Unique indexes are added only when existing data can satisfy them.
do $$
begin
  if not exists (
    select 1 from public.audiobook_categories where slug is not null group by slug having count(*) > 1
  ) then
    create unique index if not exists audiobook_categories_slug_unique_idx
      on public.audiobook_categories (slug);
  end if;

  if not exists (
    select 1 from public.audiobook_authors where slug is not null group by slug having count(*) > 1
  ) then
    create unique index if not exists audiobook_authors_slug_unique_idx
      on public.audiobook_authors (slug);
  end if;

  if not exists (
    select 1 from public.audiobook_authors where source_key is not null group by source_key having count(*) > 1
  ) then
    create unique index if not exists audiobook_authors_source_key_unique_idx
      on public.audiobook_authors (source_key)
      where source_key is not null;
  end if;

  if not exists (
    select 1 from public.audiobook_series where slug is not null group by slug having count(*) > 1
  ) then
    create unique index if not exists audiobook_series_slug_unique_idx
      on public.audiobook_series (slug);
  end if;

  if not exists (
    select 1 from public.audiobook_series where source_key is not null group by source_key having count(*) > 1
  ) then
    create unique index if not exists audiobook_series_source_key_unique_idx
      on public.audiobook_series (source_key)
      where source_key is not null;
  end if;

  if not exists (
    select 1 from public.audiobooks where slug is not null group by slug having count(*) > 1
  ) then
    create unique index if not exists audiobooks_slug_unique_idx
      on public.audiobooks (slug);
  end if;

  if not exists (
    select 1 from public.audiobooks where source_key is not null group by source_key having count(*) > 1
  ) then
    create unique index if not exists audiobooks_source_key_unique_idx
      on public.audiobooks (source_key)
      where source_key is not null;
  end if;

  if not exists (
    select 1 from public.audiobook_chapters where source_key is not null group by source_key having count(*) > 1
  ) then
    create unique index if not exists audiobook_chapters_source_key_unique_idx
      on public.audiobook_chapters (source_key)
      where source_key is not null;
  end if;

  if not exists (
    select 1 from public.audiobook_files where source_key is not null group by source_key having count(*) > 1
  ) then
    create unique index if not exists audiobook_files_source_key_unique_idx
      on public.audiobook_files (source_key)
      where source_key is not null;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- Superseded by 20260706123000_audiobook_catalog_production_schema_repair.sql.
-- Kept as a safe no-op so existing deployment bundles can include this
-- timestamp without directly referencing legacy columns that may not exist.

do $$
begin
  raise notice '20260706130000 audiobook catalog upgrade is superseded by production schema repair.';
end $$;

-- Hidden Tunes audiobook scale/import support.
-- Safe additive migration: no drops, no deletes.

begin;

create extension if not exists pg_trgm;

alter table if exists public.audiobooks
  add column if not exists source_id text,
  add column if not exists normalized_title_author text;

update public.audiobooks
set source_id = coalesce(source_id, source_key, id::text)
where source_id is null;

update public.audiobooks
set normalized_title_author = lower(
  regexp_replace(
    regexp_replace(coalesce(title, '') || '-' || coalesce(author_name, ''), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  )
)
where normalized_title_author is null
  and coalesce(title, '') <> '';

create table if not exists public.audiobook_external_links (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  label text not null,
  url text not null,
  source_type text,
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audiobook_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'running',
  page_cursor text,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint audiobook_import_runs_status_check check (
    status in ('running', 'completed', 'failed')
  )
);

do $$
begin
  if not exists (
    select 1
    from public.audiobooks
    where source_type is not null
      and source_id is not null
    group by source_type, source_id
    having count(*) > 1
  ) then
    create unique index if not exists audiobooks_source_type_source_id_unique_idx
      on public.audiobooks (source_type, source_id)
      where source_type is not null and source_id is not null;
  end if;
end $$;

create index if not exists audiobooks_normalized_title_author_idx
  on public.audiobooks (normalized_title_author)
  where normalized_title_author is not null and normalized_title_author <> '';

create unique index if not exists audiobook_external_links_source_key_unique_idx
  on public.audiobook_external_links (source_key)
  where source_key is not null;

create index if not exists audiobook_external_links_audiobook_idx
  on public.audiobook_external_links (audiobook_id);

create index if not exists audiobook_import_runs_source_status_idx
  on public.audiobook_import_runs (source, status, started_at desc);

create index if not exists audiobooks_source_type_idx
  on public.audiobooks (source_type);

create index if not exists audiobooks_missing_artwork_idx
  on public.audiobooks (id)
  where cover_url is null;

create index if not exists audiobook_chapters_audiobook_idx
  on public.audiobook_chapters (audiobook_id);

create or replace function public.audiobook_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists audiobook_external_links_touch_updated_at on public.audiobook_external_links;
create trigger audiobook_external_links_touch_updated_at
  before update on public.audiobook_external_links
  for each row execute function public.audiobook_touch_updated_at();

drop trigger if exists audiobook_import_runs_touch_updated_at on public.audiobook_import_runs;
create trigger audiobook_import_runs_touch_updated_at
  before update on public.audiobook_import_runs
  for each row execute function public.audiobook_touch_updated_at();

with seed(name, slug, sort_order) as (
  values
    ('Fiction', 'fiction', 10),
    ('Classics', 'classics', 20),
    ('Biography', 'biography', 30),
    ('Children', 'children', 40),
    ('History', 'history', 50),
    ('Poetry', 'poetry', 60),
    ('Philosophy', 'philosophy', 70),
    ('Science', 'science', 80),
    ('Religion', 'religion', 90),
    ('Drama', 'drama', 100),
    ('Mystery', 'mystery', 110),
    ('Adventure', 'adventure', 120),
    ('Education', 'education', 130),
    ('Language', 'language', 140),
    ('Short Stories', 'short-stories', 150),
    ('Non-fiction', 'non-fiction', 160)
),
updated as (
  update public.audiobook_categories category
  set
    name = seed.name,
    sort_order = seed.sort_order,
    is_active = true
  from seed
  where category.slug = seed.slug
  returning category.slug
)
insert into public.audiobook_categories (name, slug, sort_order, is_active)
select seed.name, seed.slug, seed.sort_order, true
from seed
where not exists (
  select 1
  from public.audiobook_categories category
  where category.slug = seed.slug
);

notify pgrst, 'reload schema';

commit;
