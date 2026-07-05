-- Motivation catalog parity upgrade — Podcast/Audiobook alignment.
-- Safe additive migration only. Preserves populated values. Idempotent.

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- motivation_categories — missing columns
-- ---------------------------------------------------------------------------

alter table public.motivation_categories
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- motivation_items — missing parity columns
-- ---------------------------------------------------------------------------

alter table public.motivation_items
  add column if not exists slug text,
  add column if not exists subtitle text,
  add column if not exists speaker_name text,
  add column if not exists creator_name text,
  add column if not exists category_slug text,
  add column if not exists categories text[] not null default '{}',
  add column if not exists artwork_url text,
  add column if not exists cover_url text,
  add column if not exists rights text,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_mature boolean not null default false,
  add column if not exists published_at timestamptz,
  add column if not exists last_checked_at timestamptz,
  add column if not exists source_key text,
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- motivation_files — ensure table + missing columns
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
  updated_at timestamptz not null default now()
);

alter table public.motivation_files
  add column if not exists title text,
  add column if not exists audio_url text,
  add column if not exists video_url text,
  add column if not exists media_type text,
  add column if not exists mime_type text,
  add column if not exists duration_seconds integer,
  add column if not exists is_primary boolean,
  add column if not exists playback_status text,
  add column if not exists is_active boolean,
  add column if not exists source_key text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- indexes (missing only)
-- ---------------------------------------------------------------------------

create unique index if not exists motivation_items_slug_unique_idx
  on public.motivation_items (slug)
  where slug is not null;

create unique index if not exists motivation_items_source_key_unique_idx
  on public.motivation_items (source_key)
  where source_key is not null;

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
-- foreign keys (only when safe / missing)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'motivation_files'
  )
  and exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'motivation_items'
  )
  and not exists (
    select 1
    from pg_constraint
    where conname = 'motivation_files_item_id_fkey'
      and conrelid = 'public.motivation_files'::regclass
  )
  and not exists (
    select 1
    from public.motivation_files f
    left join public.motivation_items i on i.id = f.item_id
    where f.item_id is not null
      and i.id is null
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
-- canonical categories (upsert metadata, never deactivate populated rows)
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
on conflict (slug) do update
set
  name = excluded.name,
  description = coalesce(public.motivation_categories.description, excluded.description),
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- source/source_id → source_type/source_key (preserve populated values)
-- ---------------------------------------------------------------------------

update public.motivation_items
set source_key = coalesce(
  source_key,
  case
    when source_type is not null and source_id is not null
      then source_type || ':' || source_id
    else null
  end
)
where source_key is null
  and source_type is not null
  and source_id is not null;

-- ---------------------------------------------------------------------------
-- speaker / author fields
-- ---------------------------------------------------------------------------

update public.motivation_items
set speaker_name = coalesce(speaker_name, channel_name)
where speaker_name is null
  and channel_name is not null;

update public.motivation_items
set creator_name = coalesce(creator_name, speaker_name, channel_name)
where creator_name is null
  and coalesce(speaker_name, channel_name) is not null;

-- ---------------------------------------------------------------------------
-- artwork metadata
-- ---------------------------------------------------------------------------

update public.motivation_items
set artwork_url = coalesce(artwork_url, thumbnail_url, cover_url)
where artwork_url is null
  and coalesce(thumbnail_url, cover_url) is not null;

update public.motivation_items
set cover_url = coalesce(cover_url, artwork_url, thumbnail_url)
where cover_url is null
  and coalesce(artwork_url, thumbnail_url) is not null;

update public.motivation_items
set thumbnail_url = coalesce(thumbnail_url, artwork_url, cover_url)
where thumbnail_url is null
  and coalesce(artwork_url, cover_url) is not null;

-- ---------------------------------------------------------------------------
-- category_id → category_slug (legacy FK if present)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'motivation_items'
      and column_name = 'category_id'
  ) then
    execute $sql$
      update public.motivation_items mi
      set category_slug = coalesce(
        mi.category_slug,
        (
          select c.slug
          from public.motivation_categories c
          where c.id = mi.category_id
          limit 1
        )
      )
      where mi.category_slug is null
        and mi.category_id is not null
    $sql$;
  end if;
end $$;

-- category text → category_slug via category table name match
update public.motivation_items mi
set category_slug = coalesce(
  mi.category_slug,
  c.slug
)
from public.motivation_categories c
where mi.category_slug is null
  and mi.category is not null
  and lower(trim(mi.category)) = lower(trim(c.name));

-- legacy free-text category labels → canonical slugs
update public.motivation_items
set category_slug = case lower(trim(category))
  when 'motivation' then 'daily-motivation'
  when 'motivational speeches' then 'speeches'
  when 'self-improvement' then 'mindset'
  when 'business motivation' then 'business-motivation'
  when 'gym motivation' then 'fitness-motivation'
  when 'study motivation' then 'study-motivation'
  when 'faith motivation' then 'faith-purpose'
  when 'success stories' then 'life-lessons'
  when 'emotional worlds' then 'healing'
  when 'discipline' then 'discipline'
  when 'focus' then 'focus'
  when 'mindset' then 'mindset'
  else category_slug
end
where category_slug is null
  and category is not null;

-- subcategory text → category_slug when still empty
update public.motivation_items
set category_slug = case lower(trim(subcategory))
  when 'gym motivation' then 'fitness-motivation'
  when 'study motivation' then 'study-motivation'
  when 'business motivation' then 'business-motivation'
  when 'faith motivation' then 'faith-purpose'
  else category_slug
end
where category_slug is null
  and subcategory is not null;

-- category_slug → categories[]
update public.motivation_items
set categories = case
  when coalesce(array_length(categories, 1), 0) > 0 then categories
  when category_slug is not null then array[category_slug]
  else categories
end
where coalesce(array_length(categories, 1), 0) = 0
  and category_slug is not null;

-- ---------------------------------------------------------------------------
-- public flags → status / is_active / is_verified
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'motivation_items'
      and column_name = 'is_public'
  ) then
    execute $sql$
      update public.motivation_items
      set status = coalesce(status, case when is_public is true then 'approved' else 'pending' end)
      where status is null
    $sql$;

    execute $sql$
      update public.motivation_items
      set is_active = coalesce(is_active, is_public)
      where is_active is null
    $sql$;

    execute $sql$
      update public.motivation_items
      set playback_status = coalesce(
        playback_status,
        case when is_public is true then 'playable' else 'unchecked' end
      )
      where playback_status is null
    $sql$;
  end if;
end $$;

update public.motivation_items
set is_verified = true
where is_verified = false
  and status = 'approved'
  and is_active = true
  and playback_status = 'playable';

-- ---------------------------------------------------------------------------
-- slug + published_at + last_checked_at metadata
-- ---------------------------------------------------------------------------

update public.motivation_items
set slug = coalesce(
  slug,
  trim(both '-' from regexp_replace(lower(coalesce(title, 'motivation')), '[^a-z0-9]+', '-', 'g'))
    || '-' || left(replace(id::text, '-', ''), 8)
)
where slug is null;

update public.motivation_items
set published_at = coalesce(published_at, created_at)
where published_at is null
  and created_at is not null;

update public.motivation_items
set last_checked_at = coalesce(last_checked_at, last_health_checked_at, updated_at, created_at)
where last_checked_at is null;

-- ---------------------------------------------------------------------------
-- primary motivation_files from legacy item URLs (metadata-first file table)
-- ---------------------------------------------------------------------------

insert into public.motivation_files (
  item_id,
  title,
  audio_url,
  video_url,
  media_type,
  mime_type,
  duration_seconds,
  is_primary,
  playback_status,
  is_active,
  source_key,
  created_at,
  updated_at
)
select
  mi.id,
  coalesce(mi.title, 'Primary media'),
  case
    when mi.source_type in ('hls_stream', 'mp4_file', 'manual')
      and coalesce(mi.source_url, '') ~* '\.(mp3|m4a|aac|wav|ogg)(\?|$)'
      then mi.source_url
    else null
  end,
  case
    when mi.source_type in ('youtube_video', 'archive_video')
      or (
        mi.source_type in ('hls_stream', 'mp4_file', 'manual')
        and coalesce(mi.source_url, '') !~* '\.(mp3|m4a|aac|wav|ogg)(\?|$)'
      )
      then coalesce(mi.source_url, mi.embed_url)
    else null
  end,
  case
    when mi.source_type in ('youtube_video', 'archive_video') then 'video'
    when mi.source_type = 'hls_stream' then 'stream'
    when coalesce(mi.source_url, '') ~* '\.(mp3|m4a|aac|wav|ogg)(\?|$)' then 'audio'
    else 'video'
  end,
  case
    when coalesce(mi.source_url, '') ~* '\.mp3(\?|$)' then 'audio/mpeg'
    when coalesce(mi.source_url, '') ~* '\.m4a(\?|$)' then 'audio/mp4'
    when coalesce(mi.source_url, '') ~* '\.mp4(\?|$)' then 'video/mp4'
    else null
  end,
  mi.duration_seconds,
  true,
  coalesce(mi.playback_status, 'unchecked'),
  coalesce(mi.is_active, false),
  coalesce(
    mi.source_key,
    case
      when mi.source_type is not null and mi.source_id is not null
        then 'file:' || mi.source_type || ':' || mi.source_id
      else 'file:' || mi.id::text
    end
  ),
  coalesce(mi.created_at, now()),
  coalesce(mi.updated_at, mi.created_at, now())
from public.motivation_items mi
where coalesce(mi.source_url, mi.embed_url) is not null
  and not exists (
    select 1
    from public.motivation_files mf
    where mf.item_id = mi.id
  );

-- ensure exactly one primary file per item when files exist but none marked primary
update public.motivation_files mf
set is_primary = true
where mf.is_primary = false
  and not exists (
    select 1
    from public.motivation_files other
    where other.item_id = mf.item_id
      and other.is_primary = true
  )
  and mf.id = (
    select candidate.id
    from public.motivation_files candidate
    where candidate.item_id = mf.item_id
    order by candidate.created_at asc, candidate.id asc
    limit 1
  );

-- sync file playback_status from parent item when still unchecked
update public.motivation_files mf
set playback_status = mi.playback_status
from public.motivation_items mi
where mf.item_id = mi.id
  and mf.playback_status = 'unchecked'
  and mi.playback_status is not null
  and mi.playback_status <> 'unchecked';

-- sync file active flag from parent item when file has no explicit state
update public.motivation_files mf
set is_active = mi.is_active
from public.motivation_items mi
where mf.item_id = mi.id
  and mf.is_active is distinct from mi.is_active
  and mi.is_active is not null;

-- backfill item duration from primary file when missing
update public.motivation_items mi
set duration_seconds = mf.duration_seconds
from public.motivation_files mf
where mf.item_id = mi.id
  and mf.is_primary = true
  and mi.duration_seconds is null
  and mf.duration_seconds is not null;

-- backfill primary file duration from item when missing
update public.motivation_files mf
set duration_seconds = mi.duration_seconds
from public.motivation_items mi
where mf.item_id = mi.id
  and mf.is_primary = true
  and mf.duration_seconds is null
  and mi.duration_seconds is not null;

-- recalculate item playback_status from primary playable file when item is approved/active
update public.motivation_items mi
set playback_status = 'playable'
from public.motivation_files mf
where mf.item_id = mi.id
  and mf.is_primary = true
  and mf.is_active = true
  and mf.playback_status = 'playable'
  and mi.status = 'approved'
  and mi.is_active = true
  and mi.playback_status in ('unchecked', 'pending', 'offline');

notify pgrst, 'reload schema';
