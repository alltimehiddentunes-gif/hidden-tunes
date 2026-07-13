-- TV platform quality gate: iOS/Android playability metadata + public browse indexes.
-- Safe to run more than once.

alter table public.tv_videos add column if not exists ios_playable boolean not null default false;
alter table public.tv_videos add column if not exists android_playable boolean not null default false;
alter table public.tv_videos add column if not exists stream_protocol text;
alter table public.tv_videos add column if not exists stream_is_https boolean not null default false;
alter table public.tv_videos add column if not exists last_validation_result text;
alter table public.tv_videos add column if not exists validated_stream_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tv_videos_stream_protocol_check'
      and conrelid = 'public.tv_videos'::regclass
  ) then
    alter table public.tv_videos
      add constraint tv_videos_stream_protocol_check
      check (
        stream_protocol is null
        or stream_protocol in (
          'https',
          'http',
          'hls',
          'dash',
          'rtmp',
          'rtsp',
          'youtube',
          'unknown'
        )
      )
      not valid;
  end if;
end;
$$;

-- Fail closed: classify existing URLs without assuming compatibility.
update public.tv_videos
set
  stream_protocol = case
    when coalesce(source_url, '') ~* '^https://.*\.m3u8' then 'hls'
    when coalesce(source_url, '') ~* '^http://.*\.m3u8' then 'hls'
    when coalesce(source_url, '') ~* '^https://' then 'https'
    when coalesce(source_url, '') ~* '^http://' then 'http'
    when source_type like 'youtube%' then 'youtube'
    else 'unknown'
  end,
  stream_is_https = case
    when coalesce(source_url, '') ~* '^https://' then true
    when source_type like 'youtube%' then true
    else false
  end,
  ios_playable = false,
  android_playable = false,
  last_validation_result = coalesce(last_validation_result, 'pending_revalidation')
where true;

create index if not exists tv_videos_public_ios_eligible_idx
  on public.tv_videos (created_at desc, id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and disabled_at is null
    and quarantined_at is null
    and ios_playable = true
    and reliability_score >= 60;

create index if not exists tv_videos_public_android_eligible_idx
  on public.tv_videos (created_at desc, id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and disabled_at is null
    and quarantined_at is null
    and android_playable = true
    and reliability_score >= 60;

create index if not exists tv_videos_health_priority_idx
  on public.tv_videos (is_featured desc, last_health_checked_at asc nulls first, consecutive_failures desc, id)
  where status in ('approved', 'pending');

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
    and new.disabled_at is null
    and new.quarantined_at is null
    and new.ios_playable = true
    and new.android_playable = true
    and new.last_health_checked_at is not null
  );

  if new.playback_status = 'playable'
     and new.ios_playable = true
     and new.android_playable = true then
    new.recovered_at := coalesce(new.recovered_at, now());
  end if;

  new.updated_at := now();
  return new;
end;
$$;

notify pgrst, 'reload schema';
