-- TV Phase 2: backend health/growth state.
-- Safe to run more than once.

alter table public.tv_videos add column if not exists reliability_score integer not null default 100;
alter table public.tv_videos add column if not exists consecutive_failures integer not null default 0;
alter table public.tv_videos add column if not exists last_health_checked_at timestamptz;
alter table public.tv_videos add column if not exists last_health_error text;
alter table public.tv_videos add column if not exists quarantined_at timestamptz;
alter table public.tv_videos add column if not exists disabled_at timestamptz;
alter table public.tv_videos add column if not exists recovered_at timestamptz;
alter table public.tv_videos add column if not exists source_key text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tv_videos_reliability_score_check'
      and conrelid = 'public.tv_videos'::regclass
  ) then
    alter table public.tv_videos
      add constraint tv_videos_reliability_score_check
      check (reliability_score >= 0 and reliability_score <= 100)
      not valid;
  end if;
end;
$$;

create index if not exists tv_videos_public_reliable_idx
  on public.tv_videos (created_at desc, id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and reliability_score >= 60;

create index if not exists tv_videos_health_due_idx
  on public.tv_videos (last_health_checked_at asc nulls first, id)
  where status in ('approved', 'pending');

create unique index if not exists tv_videos_source_key_unique_idx
  on public.tv_videos (source_key)
  where source_key is not null;

create unique index if not exists tv_videos_source_url_unique_idx
  on public.tv_videos (lower(source_url))
  where source_url is not null and source_url <> '';

drop policy if exists tv_videos_public_read on public.tv_videos;
create policy tv_videos_public_read
  on public.tv_videos
  for select
  to anon, authenticated
  using (
    status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and reliability_score >= 60
  );

create or replace function public.sync_tv_videos_derived_columns()
returns trigger
language plpgsql
as $$
begin
  new.channel_name := coalesce(new.channel_name, new.artist);
  new.artist := coalesce(new.artist, new.channel_name);

  if new.source_type = 'youtube_video' and new.source_id is not null then
    new.youtube_video_id := coalesce(new.youtube_video_id, new.source_id);
  end if;

  new.lane := coalesce(
    new.lane,
    new.format,
    new.category,
    new.genre
  );

  new.is_public := (
    new.status = 'approved'
    and new.is_active = true
    and new.playback_status = 'playable'
    and new.reliability_score >= 60
  );

  if new.playback_status = 'playable' then
    new.recovered_at := coalesce(new.recovered_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

update public.tv_videos
set
  reliability_score = coalesce(reliability_score, 100),
  consecutive_failures = coalesce(consecutive_failures, 0),
  source_key = coalesce(source_key, source_type || ':' || source_id),
  is_public = (
    status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and reliability_score >= 60
  )
where true;

notify pgrst, 'reload schema';
