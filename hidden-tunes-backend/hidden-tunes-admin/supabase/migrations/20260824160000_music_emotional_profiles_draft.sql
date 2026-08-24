-- DRAFT ONLY — HiddenTunes Music Emotional Intelligence Phase B.
-- Additive canonical, versioned song profile store. Do not apply without separate authorization.

create table if not exists public.music_emotional_profiles (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  profile_json jsonb not null,
  profile_version text not null,
  lyric_hash text,
  lyric_provenance text not null,
  analyzer_type text not null,
  analyzer_version text not null,
  model_version text,
  taxonomy_version text not null,
  input_fingerprint text not null,
  confidence numeric(5,4) not null,
  review_status text not null default 'unreviewed',
  analysis_status text not null default 'ready',
  failure_code text,
  attempt_count integer not null default 1,
  retry_after timestamptz,
  analyzed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint music_emotional_profiles_profile_object check (jsonb_typeof(profile_json) = 'object' and pg_column_size(profile_json) <= 16384),
  constraint music_emotional_profiles_lyric_hash check (lyric_hash is null or lyric_hash ~ '^[0-9a-f]{64}$'),
  constraint music_emotional_profiles_input_fingerprint check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint music_emotional_profiles_confidence check (confidence between 0 and 1),
  constraint music_emotional_profiles_provenance check (lyric_provenance in ('trusted_plain','trusted_lrc','supplied','whisper_transcription','none')),
  constraint music_emotional_profiles_analyzer check (analyzer_type in ('deterministic','semantic','manual')),
  constraint music_emotional_profiles_review check (review_status in ('unreviewed','accepted','corrected','rejected')),
  constraint music_emotional_profiles_status check (analysis_status in ('ready','failed')),
  constraint music_emotional_profiles_failure check ((analysis_status = 'ready' and failure_code is null) or analysis_status = 'failed'),
  constraint music_emotional_profiles_identity unique (song_id, analyzer_type, analyzer_version, taxonomy_version, input_fingerprint)
);

create index if not exists music_emotional_profiles_song_current_idx
  on public.music_emotional_profiles (song_id, analysis_status, analyzed_at desc);
create index if not exists music_emotional_profiles_version_review_idx
  on public.music_emotional_profiles (analyzer_version, taxonomy_version, review_status, confidence desc);
create index if not exists music_emotional_profiles_worlds_gin_idx
  on public.music_emotional_profiles using gin (profile_json jsonb_path_ops);
create index if not exists music_emotional_profiles_retry_idx
  on public.music_emotional_profiles (retry_after) where analysis_status = 'failed';

alter table public.music_emotional_profiles enable row level security;
revoke all on table public.music_emotional_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.music_emotional_profiles to service_role;

comment on table public.music_emotional_profiles is
  'Versioned server-owned emotional profiles. Stores no lyrics; clients have no direct access.';
