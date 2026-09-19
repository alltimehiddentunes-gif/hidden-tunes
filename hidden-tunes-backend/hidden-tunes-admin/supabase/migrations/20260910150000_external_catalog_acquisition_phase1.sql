begin;
-- External catalog acquisition Phase 1. Additive staging/control-plane schema only.
create table if not exists public.external_catalog_sources (
  id uuid primary key default gen_random_uuid(), provider_id text not null unique, display_name text not null,
  status text not null default 'DISABLED' check (status in ('DISABLED','ENABLED','DO_NOT_REINGEST')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'), last_health_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.external_catalog_batches (
  id uuid primary key default gen_random_uuid(), provider_id text not null, requested_size integer not null check (requested_size between 1 and 5000),
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','PAUSED','COMPLETED','PARTIAL','FAILED','CANCELLED')),
  feature_flags jsonb not null default '{}'::jsonb check (jsonb_typeof(feature_flags) = 'object'), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.external_catalog_assets (
  id uuid primary key default gen_random_uuid(), source_id uuid not null references public.external_catalog_sources(id) on delete restrict,
  batch_id uuid references public.external_catalog_batches(id) on delete set null, source_item_id text not null, source_url text not null, direct_media_url text,
  title text, artist text, performer text, composer text, album text, collection text, duration_seconds integer check (duration_seconds is null or duration_seconds >= 0), language text,
  content_family text not null default 'MUSIC' check (content_family in ('MUSIC','FAITH_BIBLE','AUDIOBOOK')),
  original_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(original_metadata) = 'object'),
  state text not null default 'DISCOVERED' check (state in ('DISCOVERED','RIGHTS_PENDING','RIGHTS_APPROVED','DOWNLOAD_PENDING','DOWNLOADED','AUDIO_VALIDATED','DEDUPLICATED','TAXONOMY_PENDING','TAXONOMY_CLASSIFIED','READY_FOR_REVIEW','APPROVED_FOR_INGESTION','INGESTED','RIGHTS_REVIEW','RIGHTS_BLOCKED','DOWNLOAD_FAILED','QUALITY_REJECTED','DUPLICATE','METADATA_INVALID','INGESTION_FAILED')),
  state_changed_at timestamptz not null default now(), production_song_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (source_id, source_item_id)
);
create table if not exists public.external_catalog_rights (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null unique references public.external_catalog_assets(id) on delete cascade,
  recording_license_name text, recording_license_identifier text, recording_license_url text, recording_attribution_text text, recording_attribution_required boolean,
  recording_commercial_use_allowed boolean, recording_redistribution_allowed boolean, recording_derivative_works_allowed boolean, recording_jurisdiction text, recording_rights_statement text, recording_evidence_present boolean not null default false,
  composition_license_name text, composition_license_identifier text, composition_license_url text, composition_attribution_text text, composition_attribution_required boolean,
  composition_commercial_use_allowed boolean, composition_redistribution_allowed boolean, composition_derivative_works_allowed boolean, composition_jurisdiction text, composition_rights_statement text, composition_evidence_present boolean not null default false,
  rights_bucket text not null default 'RED' check (rights_bucket in ('GREEN','AMBER','RED')), rights_decision text not null default 'BLOCKED' check (rights_decision in ('APPROVED','REVIEW','BLOCKED')), decision_reason text not null, decided_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.external_catalog_evidence (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.external_catalog_assets(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('RIGHTS','METADATA','HEALTH','OTHER')), evidence_url text, private_object_key text, captured_at timestamptz not null default now(), evidence_hash varchar(64) not null check (evidence_hash ~ '^[0-9a-f]{64}$'), metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'), created_at timestamptz not null default now()
);
create table if not exists public.external_catalog_files (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.external_catalog_assets(id) on delete cascade,
  file_state text not null default 'RAW' check (file_state in ('RAW','VALIDATED','QUARANTINED','REJECTED')), storage_key text not null, content_type text, byte_size bigint check (byte_size is null or byte_size >= 0), sha256 varchar(64) check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'), codec text, sample_rate integer, bitrate integer, duration_seconds integer, validation_details jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_details) = 'object'), created_at timestamptz not null default now(), unique (asset_id, storage_key)
);
create table if not exists public.external_catalog_duplicates (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.external_catalog_assets(id) on delete cascade, compared_asset_id uuid references public.external_catalog_assets(id) on delete restrict, compared_production_song_id uuid,
  classification text not null check (classification in ('EXACT_FILE','SAME_RECORDING','LIKELY_SAME_RECORDING','SAME_COMPOSITION_DIFFERENT_RECORDING','METADATA_ONLY','NOT_DUPLICATE')), confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)), comparison_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(comparison_evidence) = 'object'), created_at timestamptz not null default now()
);
create table if not exists public.external_catalog_taxonomy (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null unique references public.external_catalog_assets(id) on delete cascade, classification_state text not null default 'PENDING' check (classification_state in ('PENDING','CLASSIFIED','UNRESOLVED')), candidate_terms jsonb not null default '[]'::jsonb check (jsonb_typeof(candidate_terms) = 'array'), confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)), unresolved_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.external_catalog_jobs (
  id uuid primary key default gen_random_uuid(), batch_id uuid references public.external_catalog_batches(id) on delete set null, asset_id uuid references public.external_catalog_assets(id) on delete set null,
  job_type text not null check (job_type in ('DISCOVER_SOURCE','FETCH_METADATA','EVALUATE_RIGHTS','DOWNLOAD_ASSET','VALIDATE_AUDIO','FINGERPRINT','DEDUPLICATE','CLASSIFY_TAXONOMY','PREPARE_INGESTION','EXECUTE_APPROVED_INGESTION')), status text not null default 'PENDING' check (status in ('PENDING','RUNNING','RETRY_WAIT','SUCCEEDED','FAILED','CANCELLED')), attempts integer not null default 0 check (attempts between 0 and 20), next_attempt_at timestamptz, idempotency_key text not null unique, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.external_catalog_events (
  id bigint generated always as identity primary key, asset_id uuid references public.external_catalog_assets(id) on delete restrict, batch_id uuid references public.external_catalog_batches(id) on delete restrict,
  event_name text not null, from_state text, to_state text, decision_reason text, evidence_id uuid references public.external_catalog_evidence(id) on delete restrict, metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'), created_at timestamptz not null default now()
);
create index if not exists external_catalog_assets_state_idx on public.external_catalog_assets(state, state_changed_at);
create index if not exists external_catalog_assets_source_idx on public.external_catalog_assets(source_id, created_at desc);
create index if not exists external_catalog_jobs_queue_idx on public.external_catalog_jobs(status, next_attempt_at, created_at);
create index if not exists external_catalog_events_asset_idx on public.external_catalog_events(asset_id, created_at desc);
create index if not exists external_catalog_evidence_asset_idx on public.external_catalog_evidence(asset_id, captured_at desc);
create or replace function public.external_catalog_deny_event_mutation() returns trigger language plpgsql as $$ begin raise exception 'external catalog events are append-only'; end $$;
drop trigger if exists external_catalog_events_append_only on public.external_catalog_events;
create trigger external_catalog_events_append_only before update or delete on public.external_catalog_events for each row execute function public.external_catalog_deny_event_mutation();
do $$ declare table_name text; begin foreach table_name in array array['external_catalog_sources','external_catalog_batches','external_catalog_assets','external_catalog_rights','external_catalog_evidence','external_catalog_files','external_catalog_duplicates','external_catalog_taxonomy','external_catalog_jobs','external_catalog_events'] loop execute format('alter table public.%I enable row level security', table_name); execute format('revoke all on table public.%I from public, anon, authenticated', table_name); execute format('grant all on table public.%I to service_role', table_name); end loop; end $$;
comment on table public.external_catalog_assets is 'Isolated external acquisition staging records; discovery never publishes to the production catalog.';
comment on table public.external_catalog_events is 'Append-only acquisition state and decision history.';
commit;
