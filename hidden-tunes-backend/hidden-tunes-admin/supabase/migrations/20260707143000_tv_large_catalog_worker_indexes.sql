-- Hidden Tunes TV large catalog support.
-- Safe additive migration: no drops, no deletes, no data rewrites.
-- The canonical TV catalog table remains public.tv_videos.

alter table public.tv_videos add column if not exists source_key text;
alter table public.tv_videos add column if not exists reliability_score integer not null default 100;
alter table public.tv_videos add column if not exists consecutive_failures integer not null default 0;
alter table public.tv_videos add column if not exists last_health_checked_at timestamptz;
alter table public.tv_videos add column if not exists last_health_error text;
alter table public.tv_videos add column if not exists quarantined_at timestamptz;
alter table public.tv_videos add column if not exists disabled_at timestamptz;

update public.tv_videos
set source_key = coalesce(source_key, source_type || ':' || source_id)
where source_key is null
  and source_type is not null
  and source_id is not null;

create index if not exists tv_videos_public_page_idx
  on public.tv_videos (created_at desc, id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and reliability_score >= 60;

create index if not exists tv_videos_public_category_idx
  on public.tv_videos (category, created_at desc)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable';

create index if not exists tv_videos_public_region_idx
  on public.tv_videos (region, created_at desc)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable';

create index if not exists tv_videos_public_language_idx
  on public.tv_videos (language, created_at desc)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable';

do $$
begin
  if not exists (
    select 1
    from public.tv_videos
    where source_key is not null
    group by source_key
    having count(*) > 1
  ) then
    create unique index if not exists tv_videos_source_key_unique_idx
      on public.tv_videos (source_key)
      where source_key is not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from public.tv_videos
    where source_url is not null
    group by lower(source_url)
    having count(*) > 1
  ) then
    create unique index if not exists tv_videos_source_url_unique_idx
      on public.tv_videos (lower(source_url))
      where source_url is not null;
  end if;
end
$$;

create index if not exists tv_videos_health_due_large_catalog_idx
  on public.tv_videos (last_health_checked_at asc nulls first, id)
  where status in ('approved', 'pending');

notify pgrst, 'reload schema';
