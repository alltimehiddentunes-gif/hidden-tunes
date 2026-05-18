-- Hidden Tunes artist submission audio attachment foundation
-- Safe additive metadata for draft artist-submission audio files.
--
-- Safety rules:
-- - Adds nullable columns only.
-- - Does not modify songs, albums, upload-track, R2 helpers, or playback.
-- - Does not publish submissions into the public catalog.
-- - Keeps audio attached only to artist_submissions for review.
-- - Can be re-run safely.

alter table public.artist_submissions
  add column if not exists audio_url text,
  add column if not exists audio_filename text,
  add column if not exists audio_size_bytes bigint,
  add column if not exists audio_mime_type text;
