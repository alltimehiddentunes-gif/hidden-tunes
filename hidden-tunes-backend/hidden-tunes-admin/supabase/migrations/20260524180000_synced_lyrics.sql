-- Premium synced lyrics infrastructure (parallel to track_lyrics — does NOT drop or alter existing lyrics columns)
-- Safe to run multiple times.

create table if not exists public.synced_lyrics (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  lyrics_json jsonb not null default '[]'::jsonb,
  lyrics_lrc text,
  plain_lyrics text,
  created_by_user_id uuid,
  updated_by_user_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint synced_lyrics_song_id_unique unique (song_id)
);

create index if not exists synced_lyrics_song_id_idx
  on public.synced_lyrics (song_id);

create index if not exists synced_lyrics_updated_at_idx
  on public.synced_lyrics (updated_at desc);

comment on table public.synced_lyrics is
  'Premium JSON + LRC synced lyrics. Existing track_lyrics.plain_lyrics / synced_lrc remain unchanged.';
