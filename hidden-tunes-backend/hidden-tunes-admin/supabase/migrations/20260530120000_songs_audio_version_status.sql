-- Hidden Tunes Audio Version Status Infrastructure
-- Phase 35E-5A: generation lifecycle fields only — no automatic transcoding.

alter table public.songs
  add column if not exists audio_version_status text,
  add column if not exists audio_version_error text,
  add column if not exists audio_version_generated_at timestamptz;

comment on column public.songs.audio_version_status is
  'Lifecycle state for tier generation: pending, processing, ready, failed, or skipped.';

comment on column public.songs.audio_version_error is
  'Last audio version generation error message when status is failed or skipped.';

comment on column public.songs.audio_version_generated_at is
  'Timestamp when ultraLight + standard tiers were last generated successfully.';

create index if not exists songs_audio_version_status_queue_idx
  on public.songs (audio_version_status)
  where audio_version_status in ('pending', 'processing');
