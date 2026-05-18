-- Hidden Tunes artist submission details expansion
-- Safe additive metadata scaffold for richer artist submissions.
--
-- Safety rules:
-- - Adds nullable columns only.
-- - Does not modify songs, albums, upload-track, R2, or playback.
-- - Does not publish submissions into the public catalog.
-- - Keeps audio/artwork upload out of scope.
-- - Can be re-run safely.

alter table public.artist_submissions
  add column if not exists description text,
  add column if not exists genre text,
  add column if not exists mood text,
  add column if not exists release_notes text,
  add column if not exists lyrics_text text;
