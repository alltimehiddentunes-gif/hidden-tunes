-- Sports Phase 2 — broadcast validation, playback sessions, playability sync.
-- Additive only. Does not weaken existing sports_broadcasts browse/RLS model.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sports_broadcasts — validation / playback eligibility columns
-- ---------------------------------------------------------------------------

alter table public.sports_broadcasts
  add column if not exists provider_asset_id text,
  add column if not exists playback_kind text,
  add column if not exists publisher_name text,
  add column if not exists publisher_domain text,
  add column if not exists is_official boolean not null default false,
  add column if not exists is_embeddable boolean not null default false,
  add column if not exists is_free boolean not null default true,
  add column if not exists requires_login boolean not null default false,
  add column if not exists requires_subscription boolean not null default false,
  add column if not exists mobile_supported boolean not null default false,
  add column if not exists web_supported boolean not null default false,
  add column if not exists country_allowlist text[] not null default '{}'::text[],
  add column if not exists country_blocklist text[] not null default '{}'::text[],
  add column if not exists validation_status text not null default 'candidate',
  add column if not exists health_score integer not null default 0,
  add column if not exists last_validated_at timestamptz,
  add column if not exists validation_expires_at timestamptz,
  add column if not exists failure_count integer not null default 0,
  add column if not exists priority integer not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sports_broadcasts_playback_kind_check'
  ) then
    alter table public.sports_broadcasts
      add constraint sports_broadcasts_playback_kind_check
      check (
        playback_kind is null
        or playback_kind in ('iframe', 'webview', 'hls', 'dash', 'external')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sports_broadcasts_validation_status_check'
  ) then
    alter table public.sports_broadcasts
      add constraint sports_broadcasts_validation_status_check
      check (
        validation_status in (
          'candidate', 'validating', 'validated', 'degraded',
          'expired', 'blocked', 'failed', 'disabled'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'sports_broadcasts_health_score_check'
  ) then
    alter table public.sports_broadcasts
      add constraint sports_broadcasts_health_score_check
      check (health_score >= -200 and health_score <= 200);
  end if;
end $$;

create index if not exists sports_broadcasts_validation_idx
  on public.sports_broadcasts (validation_status, health_score desc, priority asc)
  where unpublished_at is null and quarantined_at is null;

create index if not exists sports_broadcasts_provider_asset_idx
  on public.sports_broadcasts (provider_id, provider_asset_id)
  where provider_asset_id is not null;

-- ---------------------------------------------------------------------------
-- sports_playback_validations
-- ---------------------------------------------------------------------------

create table if not exists public.sports_playback_validations (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.sports_broadcasts(id) on delete cascade,
  provider_id uuid references public.sports_providers(id) on delete set null,
  checked_at timestamptz not null default now(),
  status text not null,
  http_status integer,
  asset_exists boolean,
  embed_allowed boolean,
  mobile_supported boolean,
  country_result text,
  latency_ms integer,
  failure_reason text,
  response_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_playback_validations_status_check check (
    status in ('validated', 'failed', 'blocked', 'expired', 'degraded')
  )
);

create index if not exists sports_playback_validations_broadcast_idx
  on public.sports_playback_validations (broadcast_id, checked_at desc);

create index if not exists sports_playback_validations_provider_idx
  on public.sports_playback_validations (provider_id, checked_at desc);

-- ---------------------------------------------------------------------------
-- sports_provider_health — extend with Phase 2 metrics
-- ---------------------------------------------------------------------------

alter table public.sports_provider_health
  add column if not exists success_rate numeric not null default 100,
  add column if not exists validation_success_rate numeric not null default 100,
  add column if not exists average_latency_ms integer,
  add column if not exists paused_until timestamptz;

-- ---------------------------------------------------------------------------
-- sports_playback_sessions — short-lived opaque tokens
-- ---------------------------------------------------------------------------

create table if not exists public.sports_playback_sessions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  broadcast_id uuid not null references public.sports_broadcasts(id) on delete cascade,
  user_id uuid,
  session_token_hash text not null,
  country_code text,
  device_platform text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  started_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  constraint sports_playback_sessions_token_unique unique (session_token_hash)
);

create index if not exists sports_playback_sessions_fixture_idx
  on public.sports_playback_sessions (fixture_id, expires_at desc);

create index if not exists sports_playback_sessions_expires_idx
  on public.sports_playback_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- sports_fixtures — playability derived only by validation layer
-- ---------------------------------------------------------------------------

alter table public.sports_fixtures
  add column if not exists availability_state text not null default 'upcoming',
  add column if not exists playable boolean not null default false,
  add column if not exists playability_updated_at timestamptz,
  add column if not exists visible boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sports_fixtures_availability_state_check'
  ) then
    alter table public.sports_fixtures
      add constraint sports_fixtures_availability_state_check
      check (
        availability_state in (
          'live_in_app',
          'live_external',
          'live_subscription',
          'live_unavailable',
          'upcoming',
          'finished',
          'replay_available',
          'highlights_available'
        )
      );
  end if;
end $$;

create index if not exists sports_fixtures_playable_idx
  on public.sports_fixtures (playable, availability_state, starts_at)
  where visible = true;

-- ---------------------------------------------------------------------------
-- sports_playback_metrics — aggregate counters (no tokens / URLs)
-- ---------------------------------------------------------------------------

create table if not exists public.sports_playback_metrics (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  metric_value numeric not null default 0,
  provider_id uuid references public.sports_providers(id) on delete set null,
  window_start timestamptz not null default date_trunc('hour', now()),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_playback_metrics_unique unique (metric_key, provider_id, window_start)
);

-- ---------------------------------------------------------------------------
-- RLS / grants (service role writes; anon cannot read sessions or validations)
-- ---------------------------------------------------------------------------

alter table public.sports_playback_validations enable row level security;
alter table public.sports_playback_sessions enable row level security;
alter table public.sports_playback_metrics enable row level security;

drop policy if exists sports_playback_validations_no_public on public.sports_playback_validations;
create policy sports_playback_validations_no_public
  on public.sports_playback_validations for select
  using (false);

drop policy if exists sports_playback_sessions_no_public on public.sports_playback_sessions;
create policy sports_playback_sessions_no_public
  on public.sports_playback_sessions for select
  using (false);

drop policy if exists sports_playback_metrics_no_public on public.sports_playback_metrics;
create policy sports_playback_metrics_no_public
  on public.sports_playback_metrics for select
  using (false);

revoke all on public.sports_playback_validations from anon, authenticated;
revoke all on public.sports_playback_sessions from anon, authenticated;
revoke all on public.sports_playback_metrics from anon, authenticated;
