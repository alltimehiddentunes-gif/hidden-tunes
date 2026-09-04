begin;

-- Hidden Tunes Rights Control Center, Phase 4A.
-- Additive control-plane schema only. This migration deliberately performs no
-- catalog backfill and changes no public eligibility or media state.
create extension if not exists pg_trgm;

create table if not exists public.rights_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  name text not null check (char_length(name) between 1 and 160),
  provider_type text not null default 'other' check (provider_type in (
    'music','radio','tv','podcast','audiobook','archive','direct','other'
  )),
  external_account_id text,
  owner_name text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rights_catalog_items (
  id bigint generated always as identity primary key,
  content_type text not null check (content_type in (
    'music','radio','tv','podcast_show','podcast_episode','audiobook',
    'lecture','motivational','sports'
  )),
  content_id text not null check (char_length(content_id) between 1 and 200),
  parent_content_id text,
  title text not null default '',
  creator_name text,
  provider_id uuid references public.rights_providers(id) on delete set null,
  source_type text,
  source_key text,
  source_id text,
  source_host text,
  uploader_id uuid,
  import_batch text,
  ingested_at timestamptz,
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  region text,
  territory_hint text,
  stream_type text not null default 'unknown' check (stream_type in (
    'direct','proxied','relayed','rehosted','unknown'
  )),
  base_rights_status text not null default 'unknown' check (base_rights_status in (
    'green','amber','red','unknown'
  )),
  evidence_status text not null default 'missing' check (evidence_status in (
    'documented','missing','expiring','expired','needs_review'
  )),
  ios_enabled boolean not null default false,
  android_enabled boolean not null default false,
  web_enabled boolean not null default false,
  windows_enabled boolean not null default false,
  macos_enabled boolean not null default false,
  linux_enabled boolean not null default false,
  license_expires_at timestamptz,
  source_active boolean not null default true,
  review_assignee uuid,
  source_version text,
  source_updated_at timestamptz,
  indexed_at timestamptz not null default now(),
  sort_at timestamptz not null default now(),
  search_document tsvector generated always as (
    to_tsvector('simple'::regconfig,
      coalesce(title,'') || ' ' || coalesce(creator_name,'') || ' ' ||
      coalesce(source_type,'') || ' ' || coalesce(source_id,'') || ' ' ||
      coalesce(source_host,'') || ' ' || coalesce(import_batch,'') || ' ' || content_id)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, content_id)
);

create table if not exists public.rights_catalog_rollups (
  dimension text not null,
  dimension_value text not null,
  content_type text not null,
  item_count bigint not null check (item_count >= 0),
  watermark timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (dimension, dimension_value, content_type)
);

create table if not exists public.rights_saved_filters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  owner_id uuid not null,
  normalized_filter jsonb not null check (jsonb_typeof(normalized_filter) = 'object'),
  filter_hash varchar(64) not null check (filter_hash ~ '^[0-9a-f]{64}$'),
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.rights_filter_snapshots (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  normalized_filter jsonb not null check (jsonb_typeof(normalized_filter) = 'object'),
  filter_hash varchar(64) not null check (filter_hash ~ '^[0-9a-f]{64}$'),
  catalog_watermark timestamptz not null,
  policy_revision bigint not null default 0 check (policy_revision >= 0),
  exact_count bigint not null check (exact_count >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists public.rights_filter_exclusions (
  snapshot_id uuid not null references public.rights_filter_snapshots(id) on delete cascade,
  content_type text not null,
  content_id text not null,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, content_type, content_id)
);

create table if not exists public.rights_licenses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 240),
  provider_id uuid references public.rights_providers(id) on delete set null,
  rights_holder text,
  status text not null default 'draft' check (status in (
    'draft','active','expired','revoked','superseded'
  )),
  effective_at timestamptz,
  expires_at timestamptz,
  permits_streaming boolean not null default false,
  permits_download boolean not null default false,
  permits_commercial_use boolean not null default false,
  notes text,
  version integer not null default 1 check (version > 0),
  created_by uuid not null,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or effective_at is null or expires_at > effective_at)
);

create table if not exists public.rights_license_scopes (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.rights_licenses(id) on delete restrict,
  content_types text[] not null default '{}',
  provider_ids uuid[] not null default '{}',
  uploader_ids uuid[] not null default '{}',
  source_keys text[] not null default '{}',
  import_batches text[] not null default '{}',
  owner_or_networks text[] not null default '{}',
  territories text[] not null default '{}',
  worldwide boolean not null default false,
  platforms text[] not null default '{}',
  content_date_from timestamptz,
  content_date_to timestamptz,
  permits_streaming boolean not null default true,
  permits_download boolean not null default false,
  permits_embed boolean not null default false,
  permits_relay boolean not null default false,
  permits_proxy boolean not null default false,
  permits_rehosting boolean not null default false,
  permits_commercial_use boolean not null default false,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (content_date_to is null or content_date_from is null or content_date_to >= content_date_from)
);

create table if not exists public.rights_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_type text not null check (evidence_type in (
    'provider_agreement','license','ownership_certificate','commercial_terms',
    'subscription_evidence','authorization_email','public_domain','other'
  )),
  provider_id uuid references public.rights_providers(id) on delete set null,
  license_id uuid references public.rights_licenses(id) on delete set null,
  content_type text,
  content_id text,
  private_object_key text,
  sha256 varchar(64) check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  effective_at timestamptz,
  expires_at timestamptz,
  territories text[] not null default '{}',
  platforms text[] not null default '{}',
  verification_status text not null default 'unverified' check (verification_status in (
    'unverified','verified','rejected','expired'
  )),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at is null or effective_at is null or expires_at > effective_at)
);

create table if not exists public.rights_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null check (char_length(policy_key) between 1 and 200),
  version integer not null check (version > 0),
  scope_type text not null check (scope_type in (
    'global','content_type','provider','uploader','source','batch','network',
    'hostname','country','filter','content'
  )),
  scope_value text,
  content_type text,
  rights_status text not null check (rights_status in ('green','amber','red','unknown')),
  platform_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_rules) = 'object'),
  territories text[] not null default '{}',
  worldwide boolean not null default false,
  effective_at timestamptz,
  expires_at timestamptz,
  license_id uuid references public.rights_licenses(id) on delete set null,
  legal_block boolean not null default false,
  active boolean not null default false,
  retired_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (policy_key, version),
  check (expires_at is null or effective_at is null or expires_at > effective_at)
);

create table if not exists public.rights_item_overrides (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  content_id text not null,
  rights_status text check (rights_status is null or rights_status in ('green','amber','red','unknown')),
  platform_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_rules) = 'object'),
  territories text[] not null default '{}',
  worldwide boolean not null default false,
  license_id uuid references public.rights_licenses(id) on delete set null,
  notes text[] not null default '{}',
  legal_block boolean not null default false,
  reason text not null check (char_length(reason) between 1 and 1000),
  effective_at timestamptz,
  expires_at timestamptz,
  version bigint not null default 1 check (version > 0),
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, content_id),
  check (expires_at is null or effective_at is null or expires_at > effective_at)
);

create table if not exists public.rights_effective_state (
  content_type text not null,
  content_id text not null,
  rights_status text not null default 'unknown' check (rights_status in ('green','amber','red','unknown')),
  platform_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(platform_rules) = 'object'),
  territories text[] not null default '{}',
  worldwide boolean not null default false,
  eligible boolean not null default false,
  decision_reason text not null,
  winning_scope text,
  winning_policy_id uuid,
  decision_hash varchar(64) not null check (decision_hash ~ '^[0-9a-f]{64}$'),
  policy_revision bigint not null default 0,
  evaluated_at timestamptz not null default now(),
  primary key (content_type, content_id)
);

create table if not exists public.rights_bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_email text,
  snapshot_id uuid not null references public.rights_filter_snapshots(id) on delete restrict,
  job_kind text not null check (job_kind in ('dry_run','execute','rollback','export','reconcile')),
  status text not null default 'queued' check (status in (
    'queued','preparing_targets','dry_running','running','completed','partial','failed',
    'cancelled','rollback_queued','rolling_back','rolled_back','rollback_conflicted','rollback_failed'
  )),
  action_payload jsonb not null check (jsonb_typeof(action_payload) = 'object'),
  action_hash varchar(64) not null check (action_hash ~ '^[0-9a-f]{64}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  dry_run_hash varchar(64) check (dry_run_hash is null or dry_run_hash ~ '^[0-9a-f]{64}$'),
  confirmation_expires_at timestamptz,
  expected_count bigint not null default 0,
  target_count bigint not null default 0,
  processed_count bigint not null default 0,
  succeeded_count bigint not null default 0,
  failed_count bigint not null default 0,
  unchanged_count bigint not null default 0,
  conflict_count bigint not null default 0,
  reason text not null check (char_length(reason) between 3 and 1000),
  changeset_id uuid,
  cancel_requested_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);

create table if not exists public.rights_bulk_job_targets (
  job_id uuid not null references public.rights_bulk_jobs(id) on delete restrict,
  ordinal bigint not null,
  catalog_item_id bigint not null references public.rights_catalog_items(id) on delete restrict,
  content_type text not null,
  content_id text not null,
  status text not null default 'pending' check (status in (
    'pending','processing','changed','unchanged','conflict','failed','cancelled'
  )),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  before_state jsonb,
  after_state jsonb,
  before_hash varchar(64),
  after_hash varchar(64),
  error_code text,
  error_message text,
  processed_at timestamptz,
  primary key (job_id, catalog_item_id),
  unique (job_id, content_type, content_id),
  unique (job_id, ordinal)
);

create table if not exists public.rights_changesets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references public.rights_bulk_jobs(id) on delete restrict,
  actor_id uuid not null,
  actor_email text,
  reason text not null,
  filter_snapshot jsonb not null,
  action_payload jsonb not null,
  affected_count bigint not null default 0,
  failure_count bigint not null default 0,
  status text not null default 'applied' check (status in (
    'applied','partially_applied','rolled_back','rollback_conflicted'
  )),
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  rolled_back_by uuid
);

alter table public.rights_bulk_jobs
  drop constraint if exists rights_bulk_jobs_changeset_id_fkey;
alter table public.rights_bulk_jobs
  add constraint rights_bulk_jobs_changeset_id_fkey
  foreign key (changeset_id) references public.rights_changesets(id) on delete set null
  deferrable initially deferred;

create table if not exists public.rights_changeset_entries (
  id bigint generated always as identity primary key,
  changeset_id uuid not null references public.rights_changesets(id) on delete restrict,
  content_type text not null,
  content_id text not null,
  field_name text not null,
  before_value jsonb,
  after_value jsonb,
  expected_version bigint,
  rolled_back_at timestamptz,
  rollback_conflict text,
  unique (changeset_id, content_type, content_id, field_name)
);

create table if not exists public.rights_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  reason text,
  filter_hash varchar(64),
  action_hash varchar(64),
  job_id uuid,
  changeset_id uuid,
  target_type text,
  affected_count bigint,
  result text not null,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 32768
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.rights_sync_checkpoints (
  content_type text primary key,
  source_cursor text,
  source_watermark timestamptz,
  indexed_count bigint not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists rights_catalog_type_sort_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id);
create index if not exists rights_catalog_status_sort_idx
  on public.rights_catalog_items (content_type, base_rights_status, sort_at desc, content_id);
create index if not exists rights_catalog_provider_idx
  on public.rights_catalog_items (provider_id, content_type, content_id);
create index if not exists rights_catalog_uploader_date_idx
  on public.rights_catalog_items (uploader_id, ingested_at desc, content_id);
create index if not exists rights_catalog_batch_idx
  on public.rights_catalog_items (import_batch, content_type, content_id);
create index if not exists rights_catalog_host_idx
  on public.rights_catalog_items (source_host, content_type, content_id);
create index if not exists rights_catalog_country_idx
  on public.rights_catalog_items (country_code, content_type, content_id);
create index if not exists rights_catalog_expiry_idx
  on public.rights_catalog_items (license_expires_at)
  where license_expires_at is not null;
create index if not exists rights_catalog_ios_enabled_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id) where ios_enabled;
create index if not exists rights_catalog_android_enabled_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id) where android_enabled;
create index if not exists rights_catalog_web_enabled_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id) where web_enabled;
create index if not exists rights_catalog_windows_enabled_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id) where windows_enabled;
create index if not exists rights_catalog_macos_enabled_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id) where macos_enabled;
create index if not exists rights_catalog_linux_enabled_idx
  on public.rights_catalog_items (content_type, sort_at desc, content_id) where linux_enabled;
create index if not exists rights_catalog_search_idx
  on public.rights_catalog_items using gin (search_document);
create index if not exists rights_catalog_title_trgm_idx
  on public.rights_catalog_items using gin (title gin_trgm_ops);
create index if not exists rights_policy_scope_active_idx
  on public.rights_policies (scope_type, scope_value, content_type, active, created_at desc);
create unique index if not exists rights_policy_one_active_version_idx
  on public.rights_policies (policy_key) where active;
create index if not exists rights_license_expiry_idx
  on public.rights_licenses (expires_at) where status = 'active' and expires_at is not null;
create index if not exists rights_job_queue_idx
  on public.rights_bulk_jobs (status, created_at, id);
create index if not exists rights_target_status_idx
  on public.rights_bulk_job_targets (job_id, status, ordinal);
create index if not exists rights_changeset_entry_lookup_idx
  on public.rights_changeset_entries (changeset_id, content_type, content_id);
create index if not exists rights_audit_created_idx
  on public.rights_audit_log (created_at desc, id desc);
create index if not exists rights_audit_actor_idx
  on public.rights_audit_log (actor_id, created_at desc);
create index if not exists rights_audit_job_idx
  on public.rights_audit_log (job_id, created_at desc);
create index if not exists rights_audit_changeset_idx
  on public.rights_audit_log (changeset_id, created_at desc);

create or replace function public.rights_deny_audit_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'rights audit records are append-only';
end;
$$;

drop trigger if exists rights_audit_append_only on public.rights_audit_log;
create trigger rights_audit_append_only
before update or delete on public.rights_audit_log
for each row execute function public.rights_deny_audit_mutation();

create or replace function public.rights_deny_snapshot_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'rights filter snapshots are immutable';
end;
$$;

drop trigger if exists rights_snapshot_immutable on public.rights_filter_snapshots;
create trigger rights_snapshot_immutable
before update or delete on public.rights_filter_snapshots
for each row execute function public.rights_deny_snapshot_mutation();

create or replace function public.rights_claim_job_targets(
  p_job_id uuid,
  p_limit integer default 500
) returns setof public.rights_bulk_job_targets
language sql
security definer
set search_path = public, pg_temp
as $$
  with claimed as (
    select job_id, catalog_item_id
    from public.rights_bulk_job_targets
    where job_id = p_job_id and status = 'pending'
    order by ordinal
    for update skip locked
    limit least(greatest(p_limit, 1), 2000)
  )
  update public.rights_bulk_job_targets t
     set status = 'processing', attempts = attempts + 1
    from claimed c
   where t.job_id = c.job_id and t.catalog_item_id = c.catalog_item_id
  returning t.*;
$$;

do $$
declare
  table_name text;
  sequence_name text;
begin
  foreach table_name in array array[
    'rights_providers','rights_catalog_items','rights_catalog_rollups',
    'rights_saved_filters','rights_filter_snapshots','rights_filter_exclusions',
    'rights_licenses','rights_license_scopes','rights_evidence','rights_policies',
    'rights_item_overrides','rights_effective_state','rights_bulk_jobs',
    'rights_bulk_job_targets','rights_changesets','rights_changeset_entries',
    'rights_audit_log','rights_sync_checkpoints'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
  for sequence_name in
    select sequencename from pg_sequences
     where schemaname = 'public' and sequencename like 'rights_%'
  loop
    execute format('revoke all on sequence public.%I from public, anon, authenticated', sequence_name);
    execute format('grant usage, select on sequence public.%I to service_role', sequence_name);
  end loop;
end;
$$;

revoke all on function public.rights_claim_job_targets(uuid, integer) from public, anon, authenticated;
grant execute on function public.rights_claim_job_targets(uuid, integer) to service_role;

create or replace function public.rights_claim_next_job(p_allow_execute boolean default false)
returns setof public.rights_bulk_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidate as (
    select id
      from public.rights_bulk_jobs
     where status in ('queued','rollback_queued')
       and (job_kind in ('dry_run','export','reconcile') or p_allow_execute)
     order by created_at, id
     for update skip locked
     limit 1
  )
  update public.rights_bulk_jobs j
     set status = 'preparing_targets', started_at = coalesce(started_at, now()), updated_at = now()
    from candidate c
   where j.id = c.id
  returning j.*;
$$;

revoke all on function public.rights_claim_next_job(boolean) from public, anon, authenticated;
grant execute on function public.rights_claim_next_job(boolean) to service_role;

comment on table public.rights_catalog_items is
  'Rights/search projection only; does not replace or mutate source catalog records.';
comment on table public.rights_bulk_jobs is
  'Isolated catalog-scale rights jobs. Public enforcement and execution gates default off.';
comment on table public.rights_audit_log is
  'Append-only sanitized rights administration audit log.';

commit;
