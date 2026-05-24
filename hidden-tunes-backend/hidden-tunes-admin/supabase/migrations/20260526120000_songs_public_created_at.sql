-- Hidden Tunes catalog feed: public songs, newest first (GET /api/songs).
-- Additive only. Safe to re-run.

create index if not exists songs_public_created_at_idx
  on public.songs (created_at desc)
  where is_public = true;

comment on index public.songs_public_created_at_idx is
  'Supports GET /api/songs: is_public = true ORDER BY created_at DESC LIMIT/OFFSET.';
