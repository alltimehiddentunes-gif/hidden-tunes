begin;

alter table public.lecture_items add column if not exists subject_slug text;
alter table public.lecture_items add column if not exists subsubject_slug text;
alter table public.lecture_items add column if not exists provisional_subject text;
alter table public.lecture_items add column if not exists content_classification text;
alter table public.lecture_items add column if not exists classification_confidence numeric;
alter table public.lecture_items add column if not exists course_title text;
alter table public.lecture_items add column if not exists course_identifier text;
alter table public.lecture_items add column if not exists series_identifier text;
alter table public.lecture_items add column if not exists institution text;
alter table public.lecture_items add column if not exists department text;
alter table public.lecture_items add column if not exists academic_level text;
alter table public.lecture_items add column if not exists course_code text;
alter table public.lecture_items add column if not exists term text;
alter table public.lecture_items add column if not exists publication_date date;
alter table public.lecture_items add column if not exists recording_date date;
alter table public.lecture_items add column if not exists country text;
alter table public.lecture_items add column if not exists rights_evidence jsonb default '{}'::jsonb;
alter table public.lecture_items add column if not exists rights_verified_at timestamptz;
alter table public.lecture_items add column if not exists query_family text;
alter table public.lecture_items add column if not exists subject_family text;
alter table public.lecture_items add column if not exists import_state text default 'pending_review';
alter table public.lecture_items add column if not exists legal_playable_verified boolean default false;

alter table public.lecture_files add column if not exists media_size bigint;
alter table public.lecture_files add column if not exists media_format text;
alter table public.lecture_files add column if not exists module_number integer;
alter table public.lecture_files add column if not exists session_number integer;
alter table public.lecture_files add column if not exists episode_number integer;
alter table public.lecture_files add column if not exists chapter_number integer;
alter table public.lecture_files add column if not exists lecture_number integer;
alter table public.lecture_files add column if not exists rights_evidence jsonb default '{}'::jsonb;

alter table public.lecture_import_jobs add column if not exists query_family text;
alter table public.lecture_import_jobs add column if not exists subject_family text;
alter table public.lecture_import_jobs add column if not exists report_path text;

create table if not exists public.lecture_playable_import_checkpoints (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  query_family text not null,
  subject_family text,
  page integer not null default 1,
  cursor text,
  last_processed_identifier text,
  discovered_count integer not null default 0,
  media_resolved_count integer not null default 0,
  media_verified_count integer not null default 0,
  rights_pass_count integer not null default 0,
  duplicate_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  completed boolean not null default false,
  checkpoint_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_playable_import_reports (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  source_key text,
  query_family text,
  subject_family text,
  report jsonb not null default '{}'::jsonb,
  apply_writes boolean not null default false,
  created_at timestamptz default now()
);

create unique index if not exists lecture_playable_import_checkpoint_key
  on public.lecture_playable_import_checkpoints (source_key, query_family, coalesce(subject_family, ''));

create index if not exists lecture_playable_import_checkpoints_resume_idx
  on public.lecture_playable_import_checkpoints (completed, updated_at, source_key, query_family);

create index if not exists lecture_playable_legal_count_idx
  on public.lecture_items (legal_playable_verified, import_state, source_type, source_identifier);

create index if not exists lecture_items_subject_slug_idx
  on public.lecture_items (subject_slug, subsubject_slug, import_state, created_at desc);

create index if not exists lecture_items_query_family_idx
  on public.lecture_items (query_family, subject_family, created_at desc);

create index if not exists lecture_files_media_validation_idx
  on public.lecture_files (media_type, mime_type, media_size, validation_state, playable_status);

do $$
begin
  alter table public.lecture_items
    add constraint lecture_items_import_state_check
    check (import_state in ('pending_review', 'pending_enrichment', 'duplicate_review', 'rights_review', 'media_failed', 'rejected', 'promoted'));
exception
  when duplicate_object then null;
end $$;

grant select, insert, update, delete on public.lecture_playable_import_checkpoints to service_role;
grant select, insert, update, delete on public.lecture_playable_import_reports to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
