-- Hidden Tunes Verified Live Concerts — playback validation / session foundation.
-- Additive only. Hardens validation evidence and adds short-lived play sessions.
-- Safe to run multiple times. No seed or public catalogue records.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- concert_streams — additional validation scheduling columns
-- ---------------------------------------------------------------------------

alter table public.concert_streams
  add column if not exists validation_status text not null default 'candidate',
  add column if not exists health_score integer not null default 0,
  add column if not exists validation_expires_at timestamptz,
  add column if not exists next_validation_at timestamptz,
  add column if not exists priority integer not null default 100;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'concert_streams_validation_status_check'
  ) then
    alter table public.concert_streams
      add constraint concert_streams_validation_status_check
      check (
        validation_status in (
          'candidate',
          'validating',
          'validated',
          'degraded',
          'expired',
          'blocked',
          'failed',
          'disabled'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_streams_health_score_check'
  ) then
    alter table public.concert_streams
      add constraint concert_streams_health_score_check
      check (health_score >= -200 and health_score <= 200);
  end if;
end $$;

create index if not exists concert_streams_validation_schedule_idx
  on public.concert_streams (next_validation_at nulls first, priority asc, validation_status)
  where quarantined_at is null;

create index if not exists concert_streams_validation_status_idx
  on public.concert_streams (validation_status, health_score desc, priority asc)
  where quarantined_at is null;

-- ---------------------------------------------------------------------------
-- concert_items — next validation scheduling for live/upcoming workers
-- ---------------------------------------------------------------------------

alter table public.concert_items
  add column if not exists next_validation_at timestamptz,
  add column if not exists validation_expires_at timestamptz;

create index if not exists concert_items_next_validation_idx
  on public.concert_items (next_validation_at nulls first, visibility_status)
  where visibility_status in (
    'validation_pending',
    'verified_upcoming',
    'live',
    'replay_available'
  );

-- ---------------------------------------------------------------------------
-- concert_playback_sessions — opaque short-lived play tokens (server-only)
-- ---------------------------------------------------------------------------

create table if not exists public.concert_playback_sessions (
  id uuid primary key default gen_random_uuid(),
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  concert_stream_id uuid not null references public.concert_streams(id) on delete cascade,
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
  constraint concert_playback_sessions_token_unique unique (session_token_hash)
);

create index if not exists concert_playback_sessions_item_expires_idx
  on public.concert_playback_sessions (concert_item_id, expires_at desc);

create index if not exists concert_playback_sessions_expires_idx
  on public.concert_playback_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- concert_worker_checkpoints — resumable import/validation jobs
-- ---------------------------------------------------------------------------

create table if not exists public.concert_worker_checkpoints (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  source_id uuid references public.concert_sources(id) on delete set null,
  checkpoint_key text not null,
  cursor_value text,
  status text not null default 'idle',
  metadata jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_worker_checkpoints_unique unique (worker_name, checkpoint_key),
  constraint concert_worker_checkpoints_status_check check (
    status in ('idle', 'running', 'paused', 'failed', 'completed')
  )
);

create index if not exists concert_worker_checkpoints_status_idx
  on public.concert_worker_checkpoints (status, updated_at desc);

drop trigger if exists concert_worker_checkpoints_touch_updated_at
  on public.concert_worker_checkpoints;
create trigger concert_worker_checkpoints_touch_updated_at
  before update on public.concert_worker_checkpoints
  for each row execute function public.concerts_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — validation evidence + sessions + checkpoints never public
-- ---------------------------------------------------------------------------

alter table public.concert_playback_sessions enable row level security;
alter table public.concert_worker_checkpoints enable row level security;

drop policy if exists concert_playback_sessions_no_public on public.concert_playback_sessions;
create policy concert_playback_sessions_no_public
  on public.concert_playback_sessions for select
  using (false);

drop policy if exists concert_worker_checkpoints_no_public on public.concert_worker_checkpoints;
create policy concert_worker_checkpoints_no_public
  on public.concert_worker_checkpoints for select
  using (false);

-- Reaffirm validation_runs denial (idempotent with foundation migration).
drop policy if exists concert_validation_runs_no_public on public.concert_validation_runs;
create policy concert_validation_runs_no_public
  on public.concert_validation_runs for select
  using (false);

revoke all on public.concert_playback_sessions from anon, authenticated;
revoke all on public.concert_worker_checkpoints from anon, authenticated;
revoke all on public.concert_validation_runs from anon, authenticated;
revoke all on public.concert_streams from anon, authenticated;

notify pgrst, 'reload schema';
