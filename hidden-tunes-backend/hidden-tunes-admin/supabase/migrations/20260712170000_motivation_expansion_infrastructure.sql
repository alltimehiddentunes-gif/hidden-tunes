begin;

-- Service-role and PostgREST access for Motivationals tables (safe if already granted).
grant usage on schema public to postgres, anon, authenticated, service_role;

grant select on table public.motivation_categories to anon, authenticated, service_role;
grant select on table public.motivation_items to anon, authenticated, service_role;
grant select on table public.motivation_files to anon, authenticated, service_role;

grant insert, update, delete on table public.motivation_categories to service_role;
grant insert, update, delete on table public.motivation_items to service_role;
grant insert, update, delete on table public.motivation_files to service_role;

grant all on table public.motivation_categories to postgres;
grant all on table public.motivation_items to postgres;
grant all on table public.motivation_files to postgres;

create table if not exists public.motivation_source_registry (
  source_key text primary key,
  source_name text not null,
  section text not null default 'motivation',
  source_type text not null,
  source_url text,
  rights_type text not null,
  license_url text,
  redistribution_allowed boolean not null default false,
  embedding_allowed boolean not null default false,
  commercial_use_allowed boolean not null default false,
  modification_allowed boolean not null default false,
  attribution_required boolean not null default false,
  attribution_text text,
  reviewed boolean not null default false,
  enabled boolean not null default false,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_source_registry_section_check check (section = 'motivation')
);

create table if not exists public.motivation_import_checkpoints (
  id uuid primary key default gen_random_uuid(),
  section text not null default 'motivation',
  source_key text not null,
  source_page integer not null default 0,
  source_cursor text,
  batch_number integer not null default 0,
  last_external_id text,
  records_examined integer not null default 0,
  records_accepted integer not null default 0,
  records_inserted integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  records_rejected integer not null default 0,
  files_inserted integer not null default 0,
  media_verified integer not null default 0,
  media_failed integer not null default 0,
  failure_count integer not null default 0,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint motivation_import_checkpoints_section_check check (section = 'motivation')
);

create unique index if not exists motivation_import_checkpoints_active_source_idx
  on public.motivation_import_checkpoints (section, source_key, batch_number)
  where status in ('running', 'paused');

create index if not exists motivation_import_checkpoints_status_idx
  on public.motivation_import_checkpoints (section, status, updated_at desc);

grant select on table public.motivation_source_registry to anon, authenticated, service_role;
grant select on table public.motivation_import_checkpoints to service_role;
grant insert, update, delete on table public.motivation_source_registry to service_role;
grant insert, update, delete on table public.motivation_import_checkpoints to service_role;
grant all on table public.motivation_source_registry to postgres;
grant all on table public.motivation_import_checkpoints to postgres;

insert into public.motivation_source_registry (
  source_key,
  source_name,
  section,
  source_type,
  source_url,
  rights_type,
  license_url,
  redistribution_allowed,
  embedding_allowed,
  commercial_use_allowed,
  modification_allowed,
  attribution_required,
  attribution_text,
  reviewed,
  enabled,
  reviewed_at,
  reviewed_by
)
values
  (
    'archive:internet-archive-prelinger-motivation',
    'Internet Archive Prelinger Motivation Collection',
    'motivation',
    'archive_video',
    'https://archive.org/details/prelinger',
    'public_domain',
    'https://creativecommons.org/publicdomain/mark/1.0/',
    true,
    true,
    true,
    true,
    false,
    'Internet Archive public-domain collection.',
    true,
    true,
    now(),
    'hidden-tunes-review'
  ),
  (
    'archive:internet-archive-opensource-motivation',
    'Internet Archive Open Source Movies Motivation',
    'motivation',
    'archive_video',
    'https://archive.org/details/opensource_movies',
    'public_domain',
    'https://creativecommons.org/publicdomain/mark/1.0/',
    true,
    true,
    true,
    true,
    false,
    'Internet Archive open-source movies collection.',
    true,
    true,
    now(),
    'hidden-tunes-review'
  )
on conflict (source_key) do update
set
  reviewed = excluded.reviewed,
  enabled = excluded.enabled,
  rights_type = excluded.rights_type,
  redistribution_allowed = excluded.redistribution_allowed,
  embedding_allowed = excluded.embedding_allowed,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
