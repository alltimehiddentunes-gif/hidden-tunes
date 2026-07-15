-- Hidden Tunes audiobook 150K expansion: works, source registry, checkpoints, edition metadata.
-- Safe additive migration.

begin;

create extension if not exists pg_trgm;

-- Works (underlying written work)
create table if not exists public.audiobook_works (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  normalized_title text not null,
  original_title text,
  primary_author_name text,
  description text,
  subjects text[] not null default '{}'::text[],
  genres text[] not null default '{}'::text[],
  original_language text,
  publication_year integer,
  public_domain_status text,
  work_identifier text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists audiobook_works_normalized_title_author_lang_idx
  on public.audiobook_works (normalized_title, coalesce(primary_author_name, ''), coalesce(original_language, ''))
  where normalized_title <> '';

-- Source registry
create table if not exists public.audiobook_source_registry (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text not null,
  source_type text not null,
  base_url text,
  rights_policy text,
  default_license text,
  attribution_requirements text,
  supported_languages text[] not null default '{}'::text[],
  supported_formats text[] not null default '{}'::text[],
  checkpoint_cursor text,
  last_successful_import timestamptz,
  last_failed_import timestamptz,
  failure_count integer not null default 0,
  accepted_editions integer not null default 0,
  rejected_editions integer not null default 0,
  is_enabled boolean not null default true,
  is_exhausted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- File checkpoints (resumable batches)
create table if not exists public.audiobook_import_checkpoints (
  id uuid primary key default gen_random_uuid(),
  batch_number integer not null default 0,
  source_key text not null,
  status text not null default 'running',
  records_examined integer not null default 0,
  records_accepted integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_rejected integer not null default 0,
  records_skipped integer not null default 0,
  source_cursor text,
  source_page integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint audiobook_import_checkpoints_status_check check (
    status in ('running', 'paused', 'completed', 'failed')
  )
);

create unique index if not exists audiobook_import_checkpoints_batch_source_idx
  on public.audiobook_import_checkpoints (batch_number, source_key);

-- Edition (audiobooks) extensions
alter table if exists public.audiobooks
  add column if not exists work_id uuid references public.audiobook_works(id) on delete set null,
  add column if not exists edition_type text,
  add column if not exists abridgement_status text,
  add column if not exists recording_type text,
  add column if not exists translator text,
  add column if not exists country text,
  add column if not exists license_type text,
  add column if not exists license_url text,
  add column if not exists rights_evidence text,
  add column if not exists completeness text,
  add column if not exists is_complete boolean not null default true,
  add column if not exists is_public boolean not null default true,
  add column if not exists is_playable boolean not null default false,
  add column if not exists health_state text,
  add column if not exists quality_state text;

-- Chapter extensions
alter table if exists public.audiobook_chapters
  add column if not exists part_number integer,
  add column if not exists sequence_number integer,
  add column if not exists normalized_title text,
  add column if not exists source_file_id text,
  add column if not exists source_format text,
  add column if not exists mime_type text,
  add column if not exists canonical_media_reference text,
  add column if not exists is_public boolean not null default true,
  add column if not exists is_playable boolean not null default false,
  add column if not exists health_state text;

-- Rejected candidate ledger
create table if not exists public.audiobook_rejected_candidates (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  source_key text,
  title text,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audiobook_rejected_candidates_source_idx
  on public.audiobook_rejected_candidates (source_type, source_id, created_at desc);

-- Public playable browse indexes
create index if not exists audiobooks_public_playable_published_idx
  on public.audiobooks (published_at desc nulls last, created_at desc, id desc)
  where status = 'approved' and is_active = true and playback_status = 'playable' and is_mature = false;

create index if not exists audiobooks_public_playable_language_idx
  on public.audiobooks (language, published_at desc)
  where status = 'approved' and is_active = true and playback_status = 'playable' and is_mature = false;

create index if not exists audiobooks_public_playable_category_idx
  on public.audiobooks (category_slug, published_at desc)
  where status = 'approved' and is_active = true and playback_status = 'playable' and is_mature = false;

create index if not exists audiobooks_work_id_idx
  on public.audiobooks (work_id)
  where work_id is not null;

create index if not exists audiobook_chapters_edition_sequence_idx
  on public.audiobook_chapters (audiobook_id, chapter_number, sequence_number);

create index if not exists audiobooks_title_trgm_idx
  on public.audiobooks using gin (title gin_trgm_ops);

create index if not exists audiobooks_author_trgm_idx
  on public.audiobooks using gin (author_name gin_trgm_ops);

-- Seed source registry
insert into public.audiobook_source_registry (
  source_key, source_name, source_type, base_url, rights_policy, default_license,
  attribution_requirements, supported_languages, supported_formats, is_enabled
)
values
  (
    'librivox',
    'LibriVox',
    'api',
    'https://librivox.org/api/feed/audiobooks',
    'Public domain volunteer readings',
    'public_domain',
    'Credit LibriVox and readers',
    array['English','German','French','Spanish','Italian','Portuguese','Dutch','Russian','Chinese','Japanese'],
    array['mp3','ogg'],
    true
  ),
  (
    'internet_archive:librivoxaudio',
    'Internet Archive LibriVox Audio',
    'archive',
    'https://archive.org/details/librivoxaudio',
    'Public domain via Internet Archive',
    'public_domain',
    'Credit LibriVox and Internet Archive',
    array['English','German','French','Spanish','Italian','Portuguese'],
    array['mp3','ogg','m4a'],
    true
  ),
  (
    'internet_archive:opensource_audio',
    'Internet Archive Open Source Audio',
    'archive',
    'https://archive.org/details/opensource_audio',
    'Open source / public domain audio collections',
    'public_domain',
    'Credit Internet Archive and original uploader',
    array['English','German','French','Spanish','Italian','Portuguese','Russian','Arabic','Hindi'],
    array['mp3','ogg','m4a'],
    true
  ),
  (
    'internet_archive:audio_bookspoetry',
    'Internet Archive Books & Poetry Audio',
    'archive',
    'https://archive.org/details/audio_bookspoetry',
    'Public domain books and poetry readings',
    'public_domain',
    'Credit Internet Archive and readers',
    array['English','German','French','Spanish','Italian'],
    array['mp3','ogg','m4a'],
    true
  )
on conflict (source_key) do update set
  source_name = excluded.source_name,
  base_url = excluded.base_url,
  rights_policy = excluded.rights_policy,
  default_license = excluded.default_license,
  updated_at = now();

commit;
