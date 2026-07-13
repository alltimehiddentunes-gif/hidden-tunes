-- Hidden Tunes stored-music delivery authorization metadata.
-- Existing public songs remain authorized by default for backward compatibility.

alter table public.songs
  add column if not exists rights_status text not null default 'authorized',
  add column if not exists rights_expires_at timestamptz,
  add column if not exists rights_regions jsonb not null default '["*"]'::jsonb;

alter table public.songs drop constraint if exists songs_rights_status_check;
alter table public.songs add constraint songs_rights_status_check
  check (rights_status in ('authorized', 'licensed', 'owned', 'expired', 'revoked', 'unknown'));

create index if not exists songs_playback_rights_idx
  on public.songs (rights_status, rights_expires_at)
  where is_public = true;

comment on column public.songs.rights_status is
  'Server-side authorization state checked before resolving playable media.';
comment on column public.songs.rights_regions is
  'Authorized ISO region codes; ["*"] means all supported regions.';
