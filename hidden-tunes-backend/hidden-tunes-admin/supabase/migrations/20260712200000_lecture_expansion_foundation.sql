begin;

alter table public.lecture_sources add column if not exists source_type text default 'manual';
alter table public.lecture_sources add column if not exists api_url text;
alter table public.lecture_sources add column if not exists attribution_template text;
alter table public.lecture_sources add column if not exists default_language text default 'English';
alter table public.lecture_sources add column if not exists priority integer default 100;
alter table public.lecture_sources add column if not exists requests_per_minute integer default 30;
alter table public.lecture_sources add column if not exists max_concurrency integer default 3;
alter table public.lecture_sources add column if not exists rights_status text default 'pending_legal_review';
alter table public.lecture_sources add column if not exists last_success_at timestamptz;
alter table public.lecture_sources add column if not exists last_failure_at timestamptz;
alter table public.lecture_sources add column if not exists consecutive_failures integer default 0;

alter table public.lecture_import_checkpoints add column if not exists programs_normalized integer default 0;
alter table public.lecture_import_checkpoints add column if not exists programs_skipped integer default 0;
alter table public.lecture_import_checkpoints add column if not exists programs_quarantined integer default 0;
alter table public.lecture_import_checkpoints add column if not exists lessons_skipped integer default 0;
alter table public.lecture_import_checkpoints add column if not exists media_validated integer default 0;
alter table public.lecture_import_checkpoints add column if not exists media_failed integer default 0;

alter table public.lecture_import_errors add column if not exists job_id uuid;
alter table public.lecture_import_errors add column if not exists source_program_id text;
alter table public.lecture_import_errors add column if not exists source_lesson_id text;
alter table public.lecture_import_errors add column if not exists stage text;
alter table public.lecture_import_errors add column if not exists error_code text;
alter table public.lecture_import_errors add column if not exists error_message text;
alter table public.lecture_import_errors add column if not exists attempt_count integer default 0;
alter table public.lecture_import_errors add column if not exists next_retry_at timestamptz;
alter table public.lecture_import_errors add column if not exists updated_at timestamptz default now();

create table if not exists public.lecture_import_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  source_id uuid references public.lecture_sources(id) on delete set null,
  job_type text not null default 'discovery',
  status text not null default 'queued',
  priority integer not null default 100,
  target_program_count integer default 200000,
  batch_size integer not null default 100,
  cursor text,
  page integer default 0,
  offset_value integer default 0,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  next_run_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_media_validations (
  id uuid primary key default gen_random_uuid(),
  lecture_file_id uuid references public.lecture_files(id) on delete cascade,
  status text not null default 'queued',
  http_status integer,
  content_type text,
  content_length bigint,
  supports_ranges boolean,
  final_url_hash text,
  validated_at timestamptz,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if exists (
    select source_key
    from public.lecture_items
    where source_key is not null
    group by source_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate lecture_items.source_key values must be resolved before creating lecture_items_source_key_unique.';
  end if;
end $$;

do $$
begin
  if exists (
    select source_key
    from public.lecture_files
    where source_key is not null
    group by source_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate lecture_files.source_key values must be resolved before creating lecture_files_source_key_unique.';
  end if;
end $$;

create unique index if not exists lecture_items_source_key_unique
  on public.lecture_items (source_key);

create unique index if not exists lecture_files_source_key_unique
  on public.lecture_files (source_key);

create unique index if not exists lecture_import_jobs_job_key_key
  on public.lecture_import_jobs (job_key);

create index if not exists lecture_import_jobs_claim_idx
  on public.lecture_import_jobs (status, next_run_at, priority, updated_at);

create index if not exists lecture_import_jobs_heartbeat_idx
  on public.lecture_import_jobs (status, locked_at, heartbeat_at);

create index if not exists lecture_sources_enabled_priority_idx
  on public.lecture_sources (is_enabled, rights_status, priority, source_key);

create index if not exists lecture_items_source_identity_idx
  on public.lecture_items (source_type, source_identifier);

create index if not exists lecture_items_published_id_idx
  on public.lecture_items (published_at desc, id desc);

create index if not exists lecture_files_item_position_id_idx
  on public.lecture_files (lecture_item_id, position, id);

create index if not exists lecture_files_status_validation_idx
  on public.lecture_files (playable_status, is_active, is_verified);

create index if not exists lecture_media_validations_status_retry_idx
  on public.lecture_media_validations (status, next_retry_at, updated_at);

create unique index if not exists lecture_media_validations_file_key
  on public.lecture_media_validations (lecture_file_id);

do $$
begin
  alter table public.lecture_import_jobs
    add constraint lecture_import_jobs_status_check
    check (status in ('queued', 'running', 'paused', 'retry_wait', 'completed', 'failed', 'cancelled'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_media_validations
    add constraint lecture_media_validations_status_check
    check (status in ('queued', 'running', 'validated', 'failed', 'retry_wait', 'quarantined'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.claim_lecture_import_job(
  worker_id text,
  stale_after interval default interval '30 minutes'
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
          and candidate.locked_at < now() - stale_after
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
  license_type,
  license_url,
  rights_status,
  rights_notes,
  attribution_template,
  default_language,
  is_enabled,
  priority,
  requests_per_minute,
  max_concurrency
)
values (
  'internet_archive_public_domain',
  'Internet Archive public-domain education',
  'internet_archive',
  'https://archive.org',
  'https://archive.org/metadata',
  'public_domain',
  'https://archive.org/about/terms.php',
  'approved',
  'Only public-domain or public-domain-mark educational records may be promoted automatically.',
  'Source: Internet Archive / LibriVox public-domain metadata.',
  'English',
  true,
  10,
  30,
  3
)
on conflict (source_key) do update
set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  api_url = excluded.api_url,
  license_type = excluded.license_type,
  license_url = excluded.license_url,
  rights_status = excluded.rights_status,
  rights_notes = excluded.rights_notes,
  attribution_template = excluded.attribution_template,
  default_language = excluded.default_language,
  is_enabled = excluded.is_enabled,
  priority = excluded.priority,
  requests_per_minute = excluded.requests_per_minute,
  max_concurrency = excluded.max_concurrency,
  updated_at = now();

insert into public.lecture_import_jobs (
  job_key,
  source_id,
  job_type,
  status,
  priority,
  target_program_count,
  batch_size
)
select
  'internet_archive_public_domain_stage_a',
  source.id,
  'discovery',
  'paused',
  10,
  100,
  25
from public.lecture_sources source
where source.source_key = 'internet_archive_public_domain'
on conflict (job_key) do nothing;

grant select on public.lecture_import_jobs to service_role;
grant insert, update, delete on public.lecture_import_jobs to service_role;
grant select on public.lecture_media_validations to service_role;
grant insert, update, delete on public.lecture_media_validations to service_role;
grant execute on function public.claim_lecture_import_job(text, interval) to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
