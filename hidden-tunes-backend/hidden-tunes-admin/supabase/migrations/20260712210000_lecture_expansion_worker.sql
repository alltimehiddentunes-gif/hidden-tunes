begin;

alter table public.lecture_sources add column if not exists terms_url text;
alter table public.lecture_sources add column if not exists robots_url text;
alter table public.lecture_sources add column if not exists legal_notes text;
alter table public.lecture_sources add column if not exists allowed_media_types text[] default '{}';
alter table public.lecture_sources add column if not exists requires_attribution boolean default true;
alter table public.lecture_sources add column if not exists commercial_use_allowed boolean default false;
alter table public.lecture_sources add column if not exists metadata_indexing_allowed boolean default false;
alter table public.lecture_sources add column if not exists direct_streaming_allowed boolean default false;
alter table public.lecture_sources add column if not exists importer_version text;

alter table public.lecture_items add column if not exists source_external_id text;
alter table public.lecture_items add column if not exists source_fingerprint text;
alter table public.lecture_items add column if not exists attribution text;
alter table public.lecture_items add column if not exists provenance jsonb default '{}'::jsonb;
alter table public.lecture_items add column if not exists importer_version text;
alter table public.lecture_items add column if not exists verification_state text default 'unchecked';
alter table public.lecture_items add column if not exists verified_media_count integer default 0;
alter table public.lecture_items add column if not exists quarantined_at timestamptz;
alter table public.lecture_items add column if not exists quarantine_reason text;

alter table public.lecture_files add column if not exists source_external_id text;
alter table public.lecture_files add column if not exists source_fingerprint text;
alter table public.lecture_files add column if not exists canonical_url text;
alter table public.lecture_files add column if not exists final_url text;
alter table public.lecture_files add column if not exists final_host text;
alter table public.lecture_files add column if not exists validation_state text default 'unchecked';
alter table public.lecture_files add column if not exists validated_at timestamptz;
alter table public.lecture_files add column if not exists validation_error text;
alter table public.lecture_files add column if not exists importer_version text;

alter table public.lecture_import_jobs add column if not exists source_key text;
alter table public.lecture_import_jobs add column if not exists checkpoint jsonb default '{}'::jsonb;
alter table public.lecture_import_jobs add column if not exists lease_expires_at timestamptz;
alter table public.lecture_import_jobs add column if not exists completed_programs integer default 0;
alter table public.lecture_import_jobs add column if not exists failed_programs integer default 0;
alter table public.lecture_import_jobs add column if not exists quarantined_programs integer default 0;
alter table public.lecture_import_jobs add column if not exists validation_failures integer default 0;
alter table public.lecture_import_jobs add column if not exists importer_version text;

create table if not exists public.lecture_expansion_quarantine (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lecture_sources(id) on delete set null,
  job_id uuid references public.lecture_import_jobs(id) on delete set null,
  source_key text,
  source_program_id text,
  source_lesson_id text,
  source_url text,
  reason_code text not null,
  reason text not null,
  retryable boolean default true,
  payload_summary jsonb default '{}'::jsonb,
  status text not null default 'open',
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_verification_history (
  id uuid primary key default gen_random_uuid(),
  lecture_item_id uuid references public.lecture_items(id) on delete cascade,
  lecture_file_id uuid references public.lecture_files(id) on delete cascade,
  job_id uuid references public.lecture_import_jobs(id) on delete set null,
  source_key text,
  source_url text,
  final_url text,
  final_host text,
  status text not null,
  http_status integer,
  mime_type text,
  content_length bigint,
  supports_ranges boolean,
  error_code text,
  error_message text,
  checked_at timestamptz default now(),
  importer_version text
);

alter table public.lecture_media_validations add column if not exists lecture_item_id uuid references public.lecture_items(id) on delete cascade;
alter table public.lecture_media_validations add column if not exists source_key text;
alter table public.lecture_media_validations add column if not exists source_url text;
alter table public.lecture_media_validations add column if not exists final_url text;
alter table public.lecture_media_validations add column if not exists final_host text;
alter table public.lecture_media_validations add column if not exists mime_type text;
alter table public.lecture_media_validations add column if not exists error_code text;
alter table public.lecture_media_validations add column if not exists importer_version text;

create index if not exists lecture_sources_legal_ready_idx
  on public.lecture_sources (is_enabled, rights_status, commercial_use_allowed, metadata_indexing_allowed, direct_streaming_allowed, priority);

create index if not exists lecture_items_expansion_public_idx
  on public.lecture_items (is_public, is_verified, verification_state, verified_media_count, status, source_type, source_external_id);

create unique index if not exists lecture_items_source_fingerprint_key
  on public.lecture_items (source_fingerprint)
  where source_fingerprint is not null;

create unique index if not exists lecture_files_source_fingerprint_key
  on public.lecture_files (source_fingerprint)
  where source_fingerprint is not null;

create index if not exists lecture_files_validation_state_idx
  on public.lecture_files (validation_state, validated_at, final_host);

create index if not exists lecture_import_jobs_expansion_claim_idx
  on public.lecture_import_jobs (status, lease_expires_at, next_run_at, priority, updated_at);

create index if not exists lecture_expansion_quarantine_status_idx
  on public.lecture_expansion_quarantine (status, retryable, next_retry_at, source_key, created_at);

create index if not exists lecture_verification_history_file_idx
  on public.lecture_verification_history (lecture_file_id, checked_at desc);

do $$
begin
  alter table public.lecture_expansion_quarantine
    add constraint lecture_expansion_quarantine_status_check
    check (status in ('open', 'retry_wait', 'resolved', 'ignored'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_items
    add constraint lecture_items_verification_state_check
    check (verification_state in ('unchecked', 'pending', 'verified', 'failed', 'quarantined'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_files
    add constraint lecture_files_validation_state_check
    check (validation_state in ('unchecked', 'pending', 'verified', 'failed', 'quarantined'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.claim_lecture_import_job(
  worker_id text,
  stale_after interval default interval '5 minutes'
)
returns setof public.lecture_import_jobs
language sql
security definer
set search_path = public
as $$
  update public.lecture_import_jobs job
  set
    status = 'running',
    locked_by = worker_id,
    locked_at = now(),
    heartbeat_at = now(),
    lease_expires_at = now() + stale_after,
    started_at = coalesce(job.started_at, now()),
    attempt_count = job.attempt_count + 1,
    updated_at = now()
  where job.id = (
    select candidate.id
    from public.lecture_import_jobs candidate
    where (
        candidate.status = 'queued'
        or candidate.status = 'retry_wait'
        or (
          candidate.status = 'running'
          and (
            candidate.lease_expires_at < now()
            or candidate.locked_at < now() - stale_after
          )
        )
      )
      and coalesce(candidate.next_run_at, now()) <= now()
      and candidate.attempt_count < candidate.max_attempts
    order by candidate.priority asc, candidate.next_run_at asc nulls first, candidate.updated_at asc
    for update skip locked
    limit 1
  )
  returning job.*;
$$;

insert into public.lecture_sources (
  source_key,
  source_name,
  source_type,
  base_url,
  api_url,
  terms_url,
  robots_url,
  license_type,
  license_url,
  rights_status,
  rights_notes,
  legal_notes,
  attribution_template,
  default_language,
  allowed_media_types,
  requires_attribution,
  commercial_use_allowed,
  metadata_indexing_allowed,
  direct_streaming_allowed,
  is_enabled,
  priority,
  requests_per_minute,
  max_concurrency,
  importer_version
)
values (
  'internet_archive_public_domain',
  'Internet Archive public-domain education',
  'internet_archive',
  'https://archive.org',
  'https://archive.org/advancedsearch.php',
  'https://archive.org/about/terms.php',
  'https://archive.org/developers/bots.html',
  'public_domain',
  'https://creativecommons.org/publicdomain/mark/1.0/',
  'approved',
  'Only public-domain or public-domain-mark educational records are eligible for automatic publication. Non-public-domain, unclear-rights, restricted, or malformed records are quarantined.',
  'Internet Archive automated access requires bounded requests, descriptive client identity, retry-after handling, caching where possible, and respectful concurrency.',
  'Source: Internet Archive public-domain metadata.',
  'English',
  array['audio', 'video'],
  true,
  true,
  true,
  true,
  true,
  10,
  30,
  2,
  'lecture-expansion-v1'
)
on conflict (source_key) do update
set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  api_url = excluded.api_url,
  terms_url = excluded.terms_url,
  robots_url = excluded.robots_url,
  license_type = excluded.license_type,
  license_url = excluded.license_url,
  rights_status = excluded.rights_status,
  rights_notes = excluded.rights_notes,
  legal_notes = excluded.legal_notes,
  attribution_template = excluded.attribution_template,
  default_language = excluded.default_language,
  allowed_media_types = excluded.allowed_media_types,
  requires_attribution = excluded.requires_attribution,
  commercial_use_allowed = excluded.commercial_use_allowed,
  metadata_indexing_allowed = excluded.metadata_indexing_allowed,
  direct_streaming_allowed = excluded.direct_streaming_allowed,
  is_enabled = excluded.is_enabled,
  priority = excluded.priority,
  requests_per_minute = excluded.requests_per_minute,
  max_concurrency = excluded.max_concurrency,
  importer_version = excluded.importer_version,
  updated_at = now();

update public.lecture_import_jobs job
set
  source_key = coalesce(job.source_key, source.source_key),
  checkpoint = coalesce(job.checkpoint, '{}'::jsonb),
  importer_version = coalesce(job.importer_version, 'lecture-expansion-v1'),
  updated_at = now()
from public.lecture_sources source
where job.source_id = source.id
  and job.source_key is null;

grant select, insert, update, delete on public.lecture_expansion_quarantine to service_role;
grant select, insert, update, delete on public.lecture_verification_history to service_role;
grant execute on function public.claim_lecture_import_job(text, interval) to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
