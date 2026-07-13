-- TV reliability score production repair.
-- Safe to run more than once; restores the public TV route schema contract.

alter table public.tv_videos
  add column if not exists reliability_score integer not null default 0;

alter table public.tv_videos
  alter column reliability_score set default 0;

update public.tv_videos
set reliability_score = 0
where reliability_score is null;

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

notify pgrst, 'reload schema';
