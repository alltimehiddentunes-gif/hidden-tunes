-- Mature TV catalogue isolation — additive columns on tv_videos.
-- Normal browse/search/category endpoints exclude is_mature=true by default.

alter table public.tv_videos add column if not exists is_mature boolean not null default false;
alter table public.tv_videos add column if not exists mature_rating text;
alter table public.tv_videos add column if not exists mature_source_approved boolean not null default false;
alter table public.tv_videos add column if not exists mature_approval_reference text;
alter table public.tv_videos add column if not exists mature_reviewed_at timestamptz;
alter table public.tv_videos add column if not exists mature_allowed_countries text[];
alter table public.tv_videos add column if not exists mature_blocked_countries text[];

create index if not exists tv_videos_public_normal_catalog_idx
  on public.tv_videos (created_at desc, id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and is_mature = false;

create index if not exists tv_videos_public_mature_catalog_idx
  on public.tv_videos (created_at desc, id)
  where status = 'approved'
    and is_active = true
    and playback_status = 'playable'
    and is_mature = true
    and mature_source_approved = true;
