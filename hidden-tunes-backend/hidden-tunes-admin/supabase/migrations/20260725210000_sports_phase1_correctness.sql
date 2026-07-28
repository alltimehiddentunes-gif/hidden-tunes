-- Phase 1 Sports correctness support migration (NOT APPLIED YET)
-- Additive only. Safe to run multiple times.
-- Does not enable feature flags. Does not delete rows.

-- Broadcast classification + honesty fields
alter table public.sports_broadcasts
  add column if not exists stream_classification text;

alter table public.sports_broadcasts
  add column if not exists official_evidence jsonb not null default '{}'::jsonb;

alter table public.sports_broadcasts
  add column if not exists watch_external boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sports_broadcasts_stream_classification_check'
  ) then
    alter table public.sports_broadcasts
      add constraint sports_broadcasts_stream_classification_check
      check (
        stream_classification is null or stream_classification in (
          'event_specific_official',
          'official_broadcaster_page',
          'official_external_watch_link',
          'generic_sports_channel',
          'unverified_channel_mapping',
          'replay',
          'highlights',
          'expired',
          'quarantined',
          'rejected'
        )
      );
  end if;
end $$;

-- Multi-provider fixture identity map
create table if not exists public.sports_fixture_provider_ids (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_slug text not null,
  provider_external_id text not null,
  source_priority integer not null default 100,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_fixture_provider_ids_unique unique (provider_slug, provider_external_id)
);

create index if not exists sports_fixture_provider_ids_fixture_idx
  on public.sports_fixture_provider_ids (fixture_id);

-- Fixture status freshness
alter table public.sports_fixtures
  add column if not exists status_updated_at timestamptz;

alter table public.sports_fixtures
  add column if not exists provider_status_fresh_at timestamptz;

-- Indexes for common correctness / browse queries (evidence-backed needs)
create index if not exists sports_fixtures_status_starts_idx
  on public.sports_fixtures (status, starts_at);

create index if not exists sports_fixtures_sport_status_starts_idx
  on public.sports_fixtures (sport_id, status, starts_at);

create index if not exists sports_fixtures_playable_visible_idx
  on public.sports_fixtures (playable, visible)
  where playable = true and visible = true;

create index if not exists sports_broadcasts_publisher_quarantine_idx
  on public.sports_broadcasts (publisher_name, quarantined_at);

create index if not exists sports_broadcasts_validation_expires_idx
  on public.sports_broadcasts (validation_expires_at)
  where quarantined_at is null;

create index if not exists sports_broadcasts_classification_idx
  on public.sports_broadcasts (stream_classification)
  where stream_classification is not null;

-- Soft-quarantine backup tables used by Phase 1 scripts
create table if not exists public.sports_phase1_stale_live_backup (
  backed_up_at timestamptz not null default now(),
  fixture_id uuid not null,
  previous_status text not null,
  previous_availability_state text,
  previous_playable boolean,
  previous_metadata jsonb,
  previous_updated_at timestamptz
);

create table if not exists public.sports_phase1_broadcast_quarantine_backup (
  backed_up_at timestamptz not null default now(),
  broadcast_id uuid not null,
  previous_quarantined_at timestamptz,
  previous_is_official boolean,
  previous_verification_status text,
  previous_validation_status text,
  previous_availability_status text,
  previous_metadata jsonb,
  quarantine_reason text not null
);
