-- Hidden Tunes artist submission publishing metadata foundation
-- Preparation-only migration for future admin-controlled catalog publishing.
--
-- Safety rules:
-- - Adds nullable/status metadata only.
-- - Does not insert into songs or albums.
-- - Does not modify upload-track, R2 helpers, playback, TV, or YouTube.
-- - Keeps approved artist submissions separate from the public catalog until a
--   future explicit publish workflow is implemented.
-- - Can be re-run safely.

alter table public.artist_submissions
  add column if not exists published_album_id uuid references public.albums(id) on delete set null,
  add column if not exists published_song_id uuid references public.songs(id) on delete set null,
  add column if not exists published_at timestamptz,
  add column if not exists published_by_user_id uuid references public.uploader_profiles(id) on delete set null,
  add column if not exists publish_error text,
  add column if not exists publish_status text not null default 'not_published';

alter table public.albums
  add column if not exists source_artist_submission_id uuid references public.artist_submissions(id) on delete set null;

alter table public.songs
  add column if not exists source_artist_submission_id uuid references public.artist_submissions(id) on delete set null;

create index if not exists artist_submissions_publish_status_idx
  on public.artist_submissions (publish_status);

create index if not exists artist_submissions_published_song_id_idx
  on public.artist_submissions (published_song_id);

create index if not exists albums_source_artist_submission_id_idx
  on public.albums (source_artist_submission_id);

create index if not exists songs_source_artist_submission_id_idx
  on public.songs (source_artist_submission_id);
