-- Additive TV catalog eligibility tier for verified browse vs search-only discovery.
-- Safe to run multiple times.

alter table public.tv_videos
  add column if not exists catalog_eligibility_tier text not null default 'verified';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tv_videos_catalog_eligibility_tier_check'
      and conrelid = 'public.tv_videos'::regclass
  ) then
    alter table public.tv_videos
      add constraint tv_videos_catalog_eligibility_tier_check
      check (catalog_eligibility_tier in ('verified', 'search_only'));
  end if;
end $$;

create index if not exists tv_videos_verified_catalog_eligible_idx
  on public.tv_videos (created_at desc, id)
  where catalog_eligibility_tier = 'verified'
    and status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and disabled_at is null
    and quarantined_at is null
    and reliability_score >= 60;

create index if not exists tv_videos_search_discovery_eligible_idx
  on public.tv_videos (created_at desc, id)
  where catalog_eligibility_tier = 'search_only'
    and status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and disabled_at is null
    and quarantined_at is null
    and reliability_score >= 60;

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

  new.catalog_eligibility_tier := coalesce(new.catalog_eligibility_tier, 'verified');

  new.is_public := (
    new.catalog_eligibility_tier = 'verified'
    and new.status = 'approved'
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
