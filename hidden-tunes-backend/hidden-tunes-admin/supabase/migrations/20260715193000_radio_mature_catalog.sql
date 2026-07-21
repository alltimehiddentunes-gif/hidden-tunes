-- Mature (+18) radio catalog isolation — additive, backward compatible.

alter table public.radio_stations
  add column if not exists mature_review_status text not null default 'pending',
  add column if not exists mature_review_reason text,
  add column if not exists mature_evidence_url text,
  add column if not exists mature_evidence_type text,
  add column if not exists mature_reviewed_at timestamptz,
  add column if not exists mature_reviewed_by text,
  add column if not exists rights_status text not null default 'pending',
  add column if not exists rights_evidence_url text,
  add column if not exists rights_notes text,
  add column if not exists source_authorization_status text not null default 'pending',
  add column if not exists mature_source_approved boolean not null default false,
  add column if not exists is_free boolean not null default true,
  add column if not exists requires_account boolean not null default false,
  add column if not exists requires_payment boolean not null default false,
  add column if not exists requires_drm boolean not null default false,
  add column if not exists allowed_countries text[],
  add column if not exists blocked_countries text[],
  add column if not exists geo_status text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'radio_stations_mature_review_status_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_mature_review_status_check
      check (mature_review_status in ('pending', 'confirmed', 'borderline', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'radio_stations_rights_status_check'
      and conrelid = 'public.radio_stations'::regclass
  ) then
    alter table public.radio_stations
      add constraint radio_stations_rights_status_check
      check (rights_status in ('approved', 'pending', 'permission_required', 'partnership_required', 'blocked', 'rejected'));
  end if;
end $$;

create index if not exists radio_stations_mature_public_idx
  on public.radio_stations (
    status,
    is_active,
    is_verified,
    playback_status,
    reliability_score desc,
    created_at desc,
    id
  )
  where is_mature = true
    and mature_source_approved = true
    and mature_review_status = 'confirmed'
    and rights_status = 'approved'
    and quarantined_at is null
    and disabled_at is null;

create table if not exists public.radio_mature_review_queue (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_name text not null,
  station_name text not null,
  country_code text,
  language text,
  tags text[] not null default '{}',
  description text,
  homepage_url text,
  stream_url_redacted text,
  classification text not null,
  classification_reason text not null,
  mature_evidence text,
  rights_evidence text,
  duplicate_match text,
  review_status text not null default 'pending',
  review_notes text,
  source_station_uuid text,
  station_fingerprint text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists radio_mature_review_queue_status_idx
  on public.radio_mature_review_queue (review_status, created_at desc);

create table if not exists public.radio_mature_source_registry (
  source_key text primary key,
  source_name text not null,
  provider_name text,
  official_url text,
  discovery_url text,
  country_or_region text,
  languages text,
  rights_status text not null default 'pending',
  rights_notes text,
  automation_status text not null default 'blocked',
  embedding_status text,
  playback_status text not null default 'unknown',
  approval_status text not null default 'discovered',
  requires_manual_review boolean not null default false,
  adapter_name text,
  cursor_offset integer not null default 0,
  cursor_complete boolean not null default false,
  last_discovery_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  candidate_count integer not null default 0,
  imported_count integer not null default 0,
  rejected_count integer not null default 0,
  published_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.radio_mature_review_queue to service_role;
grant select, insert, update, delete on public.radio_mature_source_registry to service_role;
