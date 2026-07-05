-- Mature 18+ podcast catalog separation.
-- Metadata-first lists; audio_url remains available only through play endpoints.

alter table public.podcast_shows
  add column if not exists mature_category text;

create index if not exists podcast_shows_mature_catalog_idx
  on public.podcast_shows (is_mature, mature_category, status, is_active, feed_status);

create index if not exists podcast_episodes_mature_public_idx
  on public.podcast_episodes (show_id, status, is_active, playback_status, published_at desc);

