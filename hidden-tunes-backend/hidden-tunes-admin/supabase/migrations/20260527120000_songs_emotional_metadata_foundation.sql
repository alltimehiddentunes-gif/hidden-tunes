-- Hidden Tunes Emotional Metadata Foundation
-- Phase 1: DB only
-- Safe additive migration: nullable columns only, no mobile/API/playback changes.

alter table public.songs
  add column if not exists energy smallint,
  add column if not exists tempo_bpm integer,
  add column if not exists atmosphere text,
  add column if not exists emotion text,
  add column if not exists texture text,
  add column if not exists time_of_day text,
  add column if not exists vocal_feel text,
  add column if not exists instrumentation text,
  add column if not exists analysis_status text default 'pending',
  add column if not exists analysis_source text;

comment on column public.songs.energy is
  'Optional emotional/audio energy score, app-defined 0-100. Nullable for legacy songs.';

comment on column public.songs.tempo_bpm is
  'Optional tempo/BPM value. Nullable until manual or AI analysis is available.';

comment on column public.songs.atmosphere is
  'Optional atmosphere tag such as late-night, healing, cinematic, calm, dreamy, intimate.';

comment on column public.songs.emotion is
  'Optional emotional tag such as heartbreak, nostalgia, loneliness, peace, desire, hope.';

comment on column public.songs.texture is
  'Optional sonic texture tag such as ambient, warm, acoustic, dreamy, dark, soft, cinematic.';

comment on column public.songs.time_of_day is
  'Optional listening context such as late-night, morning, sunset, night-drive.';

comment on column public.songs.vocal_feel is
  'Optional vocal feel such as soft, breathy, intimate, soulful, distant, emotional.';

comment on column public.songs.instrumentation is
  'Optional instrumentation summary such as piano, acoustic guitar, synth pads, strings, soft drums.';

comment on column public.songs.analysis_status is
  'Analysis workflow status. Suggested values: pending, queued, analyzing, ready, failed, manual.';

comment on column public.songs.analysis_source is
  'Source of emotional metadata such as manual, admin_upload, batch_v1, external_provider.';
