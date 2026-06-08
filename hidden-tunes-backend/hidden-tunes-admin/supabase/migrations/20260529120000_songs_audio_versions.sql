-- Hidden Tunes Audio Versions Read Path
-- Phase 35E-2: nullable JSONB only — no transcoding or upload changes.

alter table public.songs
  add column if not exists audio_versions jsonb;

comment on column public.songs.audio_versions is
  'Optional multi-tier audio metadata keyed by ultraLight, standard, highQuality, and lossless. Legacy audio_url/url remain the standard playback fallback until tiers are populated.';
