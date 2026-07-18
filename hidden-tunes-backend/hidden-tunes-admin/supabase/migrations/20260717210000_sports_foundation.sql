-- Hidden Tunes Sports foundation — Phase 1 infrastructure schema.
-- Additive only. Metadata-first public APIs; playback URLs only via /play resolvers.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP POLICY IF EXISTS).
-- No production content import. Test seed rows are clearly marked.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Shared touch trigger
-- ---------------------------------------------------------------------------

create or replace function public.sports_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Taxonomy
-- ---------------------------------------------------------------------------

create table if not exists public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  artwork_url text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_slug_unique unique (slug),
  constraint sports_status_check check (status in ('active', 'inactive', 'removed'))
);

create table if not exists public.sport_categories (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid references public.sports(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sport_categories_slug_unique unique (slug),
  constraint sport_categories_status_check check (status in ('active', 'inactive', 'removed'))
);

create table if not exists public.sports_countries (
  code text primary key,
  name text not null,
  region text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_countries_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.sports_providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  provider_type text not null default 'manual',
  official_domain text,
  kill_switch boolean not null default false,
  is_enabled boolean not null default false,
  rate_limit_per_minute integer not null default 30,
  timeout_ms integer not null default 15000,
  health_status text not null default 'unknown',
  last_health_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_providers_slug_unique unique (slug),
  constraint sports_providers_type_check check (
    provider_type in (
      'fifa', 'olympics', 'federation', 'club_tv', 'league', 'fast',
      'public_broadcaster', 'youtube_official', 'official_embed', 'manual_rights_partner', 'test'
    )
  ),
  constraint sports_providers_health_check check (
    health_status in ('unknown', 'healthy', 'degraded', 'unavailable', 'disabled')
  )
);

create table if not exists public.sports_competitions (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_external_id text,
  name text not null,
  slug text not null,
  short_name text,
  country_code text references public.sports_countries(code) on delete set null,
  competition_type text not null default 'league',
  gender text,
  age_group text,
  official_url text,
  artwork_url text,
  status text not null default 'discovered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_competitions_slug_unique unique (slug),
  constraint sports_competitions_type_check check (
    competition_type in (
      'league', 'cup', 'tournament', 'series', 'championship', 'friendly',
      'olympic', 'world_cup', 'grand_prix', 'fight_card', 'esports', 'other'
    )
  ),
  constraint sports_competitions_status_check check (
    status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed', 'active', 'inactive'
    )
  )
);

create table if not exists public.sports_competition_seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sports_competitions(id) on delete cascade,
  name text not null,
  slug text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_competition_seasons_slug_unique unique (competition_id, slug),
  constraint sports_competition_seasons_status_check check (
    status in ('upcoming', 'active', 'completed', 'cancelled', 'removed')
  )
);

create table if not exists public.sports_teams (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_external_id text,
  name text not null,
  slug text not null,
  short_name text,
  country_code text references public.sports_countries(code) on delete set null,
  competition_id uuid references public.sports_competitions(id) on delete set null,
  official_url text,
  artwork_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_teams_slug_unique unique (slug),
  constraint sports_teams_status_check check (status in ('active', 'inactive', 'removed'))
);

create table if not exists public.sports_team_aliases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.sports_teams(id) on delete cascade,
  alias text not null,
  locale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_team_aliases_unique unique (team_id, alias)
);

create table if not exists public.sports_athletes (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_external_id text,
  name text not null,
  slug text not null,
  short_name text,
  country_code text references public.sports_countries(code) on delete set null,
  team_id uuid references public.sports_teams(id) on delete set null,
  official_url text,
  artwork_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_athletes_slug_unique unique (slug),
  constraint sports_athletes_status_check check (status in ('active', 'inactive', 'removed'))
);

create table if not exists public.sports_venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  city text,
  country_code text references public.sports_countries(code) on delete set null,
  capacity integer,
  latitude double precision,
  longitude double precision,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_venues_slug_unique unique (slug),
  constraint sports_venues_status_check check (status in ('active', 'inactive', 'removed'))
);

create table if not exists public.sports_fixtures (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid not null references public.sports(id) on delete restrict,
  competition_id uuid references public.sports_competitions(id) on delete set null,
  season_id uuid references public.sports_competition_seasons(id) on delete set null,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_external_id text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'scheduled',
  venue_id uuid references public.sports_venues(id) on delete set null,
  country_code text references public.sports_countries(code) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_fixtures_status_check check (
    status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed',
      'completed', 'postponed', 'cancelled'
    )
  )
);

create table if not exists public.sports_fixture_participants (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  team_id uuid references public.sports_teams(id) on delete set null,
  athlete_id uuid references public.sports_athletes(id) on delete set null,
  side text,
  seed integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_fixture_participants_side_check check (
    side is null or side in ('home', 'away', 'neutral', 'player_a', 'player_b', 'other')
  )
);

create table if not exists public.sports_fixture_events (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz,
  minute integer,
  team_id uuid references public.sports_teams(id) on delete set null,
  athlete_id uuid references public.sports_athletes(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_fixture_scores (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  period text not null default 'full_time',
  home_score numeric,
  away_score numeric,
  score_payload jsonb not null default '{}'::jsonb,
  updated_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_fixture_scores_unique unique (fixture_id, period)
);

create table if not exists public.sports_standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.sports_competitions(id) on delete cascade,
  season_id uuid references public.sports_competition_seasons(id) on delete set null,
  team_id uuid not null references public.sports_teams(id) on delete cascade,
  rank integer,
  played integer not null default 0,
  won integer not null default 0,
  drawn integer not null default 0,
  lost integer not null default 0,
  points numeric not null default 0,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_standings_unique unique (competition_id, season_id, team_id)
);

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------

create table if not exists public.sports_rights_holders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  official_url text,
  contact_notes text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_rights_holders_slug_unique unique (slug),
  constraint sports_rights_holders_status_check check (status in ('active', 'inactive', 'removed'))
);

create table if not exists public.sports_rights_grants (
  id uuid primary key default gen_random_uuid(),
  rights_holder_id uuid not null references public.sports_rights_holders(id) on delete restrict,
  provider_id uuid references public.sports_providers(id) on delete set null,
  content_scope text not null default 'broadcast',
  sport_id uuid references public.sports(id) on delete set null,
  competition_id uuid references public.sports_competitions(id) on delete set null,
  team_id uuid references public.sports_teams(id) on delete set null,
  channel_id uuid,
  broadcast_id uuid,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  commercial_use_allowed boolean not null default false,
  aggregation_allowed boolean not null default false,
  embedding_allowed boolean not null default false,
  native_playback_allowed boolean not null default false,
  external_linking_allowed boolean not null default true,
  mobile_allowed boolean not null default false,
  desktop_allowed boolean not null default false,
  web_allowed boolean not null default false,
  smart_tv_allowed boolean not null default false,
  evidence_status text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_rights_grants_scope_check check (
    content_scope in ('sport', 'competition', 'team', 'channel', 'broadcast', 'video', 'fixture')
  ),
  constraint sports_rights_grants_evidence_check check (
    evidence_status in ('pending', 'approved', 'rejected', 'expired', 'revoked')
  )
);

create table if not exists public.sports_rights_territories (
  id uuid primary key default gen_random_uuid(),
  rights_grant_id uuid not null references public.sports_rights_grants(id) on delete cascade,
  country_code text not null references public.sports_countries(code) on delete restrict,
  availability text not null default 'unavailable',
  access_type text not null default 'none',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_rights_territories_unique unique (rights_grant_id, country_code),
  constraint sports_rights_territories_availability_check check (
    availability in (
      'available', 'unavailable', 'geo_blocked', 'external_only',
      'subscription_only', 'registration_required', 'metadata_only'
    )
  ),
  constraint sports_rights_territories_access_check check (
    access_type in ('none', 'free', 'registration', 'subscription', 'external')
  )
);

create table if not exists public.sports_platform_permissions (
  id uuid primary key default gen_random_uuid(),
  rights_grant_id uuid not null references public.sports_rights_grants(id) on delete cascade,
  platform text not null,
  allowed boolean not null default false,
  playback_modes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_platform_permissions_unique unique (rights_grant_id, platform),
  constraint sports_platform_permissions_platform_check check (
    platform in ('ios', 'android', 'desktop', 'web', 'smart_tv')
  )
);

create table if not exists public.sports_rights_evidence (
  id uuid primary key default gen_random_uuid(),
  rights_grant_id uuid not null references public.sports_rights_grants(id) on delete cascade,
  evidence_type text not null,
  evidence_url text,
  summary text,
  reviewed_by text,
  reviewed_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_rights_evidence_status_check check (
    status in ('pending', 'approved', 'rejected', 'expired')
  )
);

create table if not exists public.sports_provider_agreements (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.sports_providers(id) on delete cascade,
  rights_holder_id uuid references public.sports_rights_holders(id) on delete set null,
  title text not null,
  valid_from timestamptz,
  valid_until timestamptz,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_provider_agreements_status_check check (
    status in ('draft', 'active', 'expired', 'revoked')
  )
);

-- ---------------------------------------------------------------------------
-- Broadcast / channels / videos / streams
-- ---------------------------------------------------------------------------

create table if not exists public.sports_channels (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid references public.sports(id) on delete set null,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_external_id text,
  name text not null,
  slug text not null,
  description text,
  artwork_url text,
  country_code text references public.sports_countries(code) on delete set null,
  official_url text,
  status text not null default 'discovered',
  rights_grant_id uuid references public.sports_rights_grants(id) on delete set null,
  verification_status text not null default 'pending',
  last_verified_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  quarantined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_channels_slug_unique unique (slug),
  constraint sports_channels_status_check check (
    status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed'
    )
  )
);

create table if not exists public.sports_broadcasts (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references public.sports_fixtures(id) on delete set null,
  channel_id uuid references public.sports_channels(id) on delete set null,
  provider_id uuid references public.sports_providers(id) on delete set null,
  broadcast_type text not null,
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  availability_status text not null default 'discovered',
  access_type text not null default 'external',
  registration_required boolean not null default false,
  subscription_required boolean not null default false,
  rights_grant_id uuid references public.sports_rights_grants(id) on delete set null,
  territory_mode text not null default 'allowlist',
  official_status text not null default 'unconfirmed',
  verification_status text not null default 'pending',
  last_verified_at timestamptz,
  published_at timestamptz,
  unpublished_at timestamptz,
  quarantined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_broadcasts_type_check check (
    broadcast_type in (
      'live_match', 'live_event', 'pre_match', 'post_match', 'live_channel',
      'radio_commentary', 'replay', 'highlights', 'press_conference',
      'interview', 'documentary', 'external_watch'
    )
  ),
  constraint sports_broadcasts_availability_check check (
    availability_status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed'
    )
  ),
  constraint sports_broadcasts_access_check check (
    access_type in ('free', 'registration', 'subscription', 'external')
  ),
  constraint sports_broadcasts_territory_mode_check check (
    territory_mode in ('allowlist', 'blocklist', 'worldwide_unproven')
  ),
  constraint sports_broadcasts_official_check check (
    official_status in ('unconfirmed', 'official', 'rejected')
  )
);

-- Late FK for rights grants channel/broadcast refs (additive)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sports_rights_grants_channel_id_fkey'
  ) then
    alter table public.sports_rights_grants
      add constraint sports_rights_grants_channel_id_fkey
      foreign key (channel_id) references public.sports_channels(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'sports_rights_grants_broadcast_id_fkey'
  ) then
    alter table public.sports_rights_grants
      add constraint sports_rights_grants_broadcast_id_fkey
      foreign key (broadcast_id) references public.sports_broadcasts(id) on delete set null;
  end if;
end $$;

create table if not exists public.sports_stream_sources (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid references public.sports_broadcasts(id) on delete cascade,
  channel_id uuid references public.sports_channels(id) on delete cascade,
  provider_id uuid references public.sports_providers(id) on delete set null,
  source_type text not null,
  source_url_encrypted text,
  resolver_reference text,
  external_deep_link text,
  web_fallback_url text,
  referer_requirement text,
  user_agent_requirement text,
  drm_type text,
  license_server_reference text,
  token_strategy text,
  expires_at timestamptz,
  is_direct_play_allowed boolean not null default false,
  is_embed_allowed boolean not null default false,
  is_external_only boolean not null default true,
  priority integer not null default 100,
  status text not null default 'discovered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_stream_sources_type_check check (
    source_type in (
      'hls', 'dash', 'mp4', 'embed', 'deep_link', 'official_web', 'radio', 'test'
    )
  ),
  constraint sports_stream_sources_status_check check (
    status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed'
    )
  ),
  constraint sports_stream_sources_parent_check check (
    broadcast_id is not null or channel_id is not null
  )
);

create table if not exists public.sports_stream_variants (
  id uuid primary key default gen_random_uuid(),
  stream_source_id uuid not null references public.sports_stream_sources(id) on delete cascade,
  label text,
  resolution text,
  bitrate_kbps integer,
  codec text,
  language text,
  status text not null default 'verified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_channel_streams (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.sports_channels(id) on delete cascade,
  stream_source_id uuid not null references public.sports_stream_sources(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_channel_streams_unique unique (channel_id, stream_source_id)
);

create table if not exists public.sports_videos (
  id uuid primary key default gen_random_uuid(),
  sport_id uuid references public.sports(id) on delete set null,
  competition_id uuid references public.sports_competitions(id) on delete set null,
  fixture_id uuid references public.sports_fixtures(id) on delete set null,
  provider_id uuid references public.sports_providers(id) on delete set null,
  provider_external_id text,
  title text not null,
  slug text not null,
  description text,
  video_type text not null default 'highlights',
  artwork_url text,
  duration_seconds integer,
  rights_grant_id uuid references public.sports_rights_grants(id) on delete set null,
  status text not null default 'discovered',
  verification_status text not null default 'pending',
  published_at timestamptz,
  unpublished_at timestamptz,
  quarantined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_videos_slug_unique unique (slug),
  constraint sports_videos_type_check check (
    video_type in (
      'highlights', 'replay', 'documentary', 'interview', 'press_conference', 'other'
    )
  ),
  constraint sports_videos_status_check check (
    status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed'
    )
  )
);

create table if not exists public.sports_video_sources (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.sports_videos(id) on delete cascade,
  provider_id uuid references public.sports_providers(id) on delete set null,
  source_type text not null,
  source_url_encrypted text,
  resolver_reference text,
  external_deep_link text,
  web_fallback_url text,
  embed_url text,
  is_direct_play_allowed boolean not null default false,
  is_embed_allowed boolean not null default false,
  is_external_only boolean not null default true,
  expires_at timestamptz,
  status text not null default 'discovered',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_video_sources_type_check check (
    source_type in ('hls', 'dash', 'mp4', 'embed', 'deep_link', 'official_web', 'youtube_official', 'test')
  ),
  constraint sports_video_sources_status_check check (
    status in (
      'discovered', 'rights_pending', 'rights_approved', 'technical_pending',
      'verified', 'scheduled', 'live', 'degraded', 'external_only', 'geo_blocked',
      'expired', 'offline', 'quarantined', 'rights_revoked', 'removed'
    )
  )
);

-- ---------------------------------------------------------------------------
-- Verification / health / quarantine / play telemetry
-- ---------------------------------------------------------------------------

create table if not exists public.sports_stream_checks (
  id uuid primary key default gen_random_uuid(),
  stream_source_id uuid references public.sports_stream_sources(id) on delete cascade,
  video_source_id uuid references public.sports_video_sources(id) on delete cascade,
  stage text not null,
  result text not null,
  http_status integer,
  manifest_valid boolean,
  segment_available boolean,
  codec text,
  resolution text,
  bitrate_kbps integer,
  video_frame_activity boolean,
  audio_activity boolean,
  startup_ms integer,
  buffering_ratio numeric,
  failure_reason text,
  country_code text,
  platform text,
  provider_id uuid references public.sports_providers(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_stream_checks_stage_check check (
    stage in ('official', 'technical', 'content', 'event_window', 'real_user')
  ),
  constraint sports_stream_checks_result_check check (
    result in ('pass', 'fail', 'warn', 'skip')
  )
);

create table if not exists public.sports_stream_incidents (
  id uuid primary key default gen_random_uuid(),
  stream_source_id uuid references public.sports_stream_sources(id) on delete set null,
  broadcast_id uuid references public.sports_broadcasts(id) on delete set null,
  channel_id uuid references public.sports_channels(id) on delete set null,
  incident_type text not null,
  severity text not null default 'medium',
  message text not null,
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_stream_health (
  id uuid primary key default gen_random_uuid(),
  stream_source_id uuid not null references public.sports_stream_sources(id) on delete cascade,
  consecutive_failures integer not null default 0,
  consecutive_successes integer not null default 0,
  play_success_rate numeric not null default 100,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  reliability_score integer not null default 100,
  status text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_stream_health_unique unique (stream_source_id),
  constraint sports_stream_health_reliability_check check (
    reliability_score >= 0 and reliability_score <= 100
  ),
  constraint sports_stream_health_status_check check (
    status in ('unknown', 'healthy', 'degraded', 'offline', 'quarantined')
  )
);

create table if not exists public.sports_play_attempts (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid references public.sports_broadcasts(id) on delete set null,
  channel_id uuid references public.sports_channels(id) on delete set null,
  video_id uuid references public.sports_videos(id) on delete set null,
  stream_source_id uuid references public.sports_stream_sources(id) on delete set null,
  user_id uuid,
  device_id text,
  platform text,
  country_code text,
  playback_mode text,
  success boolean not null default false,
  startup_ms integer,
  watch_duration_ms integer,
  buffer_ratio numeric,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_play_failures (
  id uuid primary key default gen_random_uuid(),
  play_attempt_id uuid references public.sports_play_attempts(id) on delete set null,
  broadcast_id uuid references public.sports_broadcasts(id) on delete set null,
  channel_id uuid references public.sports_channels(id) on delete set null,
  video_id uuid references public.sports_videos(id) on delete set null,
  stream_source_id uuid references public.sports_stream_sources(id) on delete set null,
  error_code text not null,
  error_message text,
  platform text,
  country_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_provider_health (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.sports_providers(id) on delete cascade,
  status text not null default 'unknown',
  consecutive_failures integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_reason text,
  circuit_open_until timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_provider_health_unique unique (provider_id),
  constraint sports_provider_health_status_check check (
    status in ('unknown', 'healthy', 'degraded', 'unavailable', 'disabled')
  )
);

create table if not exists public.sports_quarantine_events (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  threshold_key text,
  auto_recoverable boolean not null default false,
  restored_at timestamptz,
  restored_by text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_quarantine_events_target_check check (
    target_type in ('stream_source', 'broadcast', 'channel', 'video', 'provider', 'competition')
  )
);

create table if not exists public.sports_rights_incidents (
  id uuid primary key default gen_random_uuid(),
  rights_grant_id uuid references public.sports_rights_grants(id) on delete set null,
  incident_type text not null,
  message text not null,
  severity text not null default 'high',
  resolved_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_worker_checkpoints (
  id uuid primary key default gen_random_uuid(),
  worker_key text not null,
  checkpoint jsonb not null default '{}'::jsonb,
  locked_until timestamptz,
  last_run_at timestamptz,
  last_status text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_worker_checkpoints_unique unique (worker_key)
);

create table if not exists public.sports_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- User-state (isolated from music/TV)
-- ---------------------------------------------------------------------------

create table if not exists public.sports_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_follows_unique unique (user_id, target_type, target_id),
  constraint sports_follows_target_check check (
    target_type in ('team', 'athlete', 'competition', 'channel', 'sport')
  )
);

create table if not exists public.sports_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_favorites_unique unique (user_id, target_type, target_id),
  constraint sports_favorites_target_check check (
    target_type in ('broadcast', 'channel', 'video', 'fixture', 'team', 'competition')
  )
);

create table if not exists public.sports_watch_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broadcast_id uuid references public.sports_broadcasts(id) on delete set null,
  channel_id uuid references public.sports_channels(id) on delete set null,
  video_id uuid references public.sports_videos(id) on delete set null,
  fixture_id uuid references public.sports_fixtures(id) on delete set null,
  position_ms integer not null default 0,
  duration_ms integer,
  completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_continue_watching (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broadcast_id uuid references public.sports_broadcasts(id) on delete cascade,
  channel_id uuid references public.sports_channels(id) on delete cascade,
  video_id uuid references public.sports_videos(id) on delete cascade,
  position_ms integer not null default 0,
  duration_ms integer,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint sports_continue_watching_parent_check check (
    broadcast_id is not null or channel_id is not null or video_id is not null
  )
);

create table if not exists public.sports_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  fixture_id uuid not null references public.sports_fixtures(id) on delete cascade,
  remind_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_reminders_unique unique (user_id, fixture_id),
  constraint sports_reminders_status_check check (
    status in ('scheduled', 'sent', 'cancelled')
  )
);

create table if not exists public.sports_preferences (
  user_id uuid primary key,
  preferred_country text references public.sports_countries(code) on delete set null,
  preferred_sports text[] not null default '{}',
  preferred_teams uuid[] not null default '{}',
  hide_mature boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sports_notification_preferences (
  user_id uuid primary key,
  fixtures_enabled boolean not null default true,
  live_enabled boolean not null default true,
  highlights_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists sports_active_sort_idx on public.sports (status, sort_order, slug);
create index if not exists sport_categories_active_sort_idx on public.sport_categories (status, sort_order, slug);
create index if not exists sports_competitions_sport_status_idx on public.sports_competitions (sport_id, status, name);
create index if not exists sports_teams_sport_status_idx on public.sports_teams (sport_id, status, name);
create index if not exists sports_athletes_sport_status_idx on public.sports_athletes (sport_id, status, name);
create index if not exists sports_fixtures_starts_status_idx on public.sports_fixtures (starts_at, status);
create index if not exists sports_fixtures_competition_starts_idx on public.sports_fixtures (competition_id, starts_at);
create index if not exists sports_fixtures_live_idx on public.sports_fixtures (status, starts_at)
  where status in ('live', 'scheduled', 'verified');
create index if not exists sports_broadcasts_public_idx on public.sports_broadcasts (availability_status, starts_at, published_at)
  where published_at is not null and unpublished_at is null and quarantined_at is null;
create index if not exists sports_broadcasts_fixture_idx on public.sports_broadcasts (fixture_id, availability_status);
create index if not exists sports_channels_public_idx on public.sports_channels (status, published_at)
  where published_at is not null and unpublished_at is null and quarantined_at is null;
create index if not exists sports_videos_public_idx on public.sports_videos (video_type, status, published_at)
  where published_at is not null and unpublished_at is null and quarantined_at is null;
create index if not exists sports_stream_sources_status_idx on public.sports_stream_sources (status, priority);
create index if not exists sports_rights_grants_validity_idx on public.sports_rights_grants (evidence_status, valid_from, valid_until);
create index if not exists sports_rights_territories_country_idx on public.sports_rights_territories (country_code, availability);
create index if not exists sports_quarantine_open_idx on public.sports_quarantine_events (target_type, target_id)
  where restored_at is null;
create index if not exists sports_play_failures_created_idx on public.sports_play_failures (created_at desc);
create index if not exists sports_follows_user_idx on public.sports_follows (user_id, created_at desc);
create index if not exists sports_favorites_user_idx on public.sports_favorites (user_id, created_at desc);
create index if not exists sports_watch_history_user_idx on public.sports_watch_history (user_id, last_watched_at desc);
create index if not exists sports_continue_watching_user_idx on public.sports_continue_watching (user_id, updated_at desc);

create index if not exists sports_fixtures_search_trgm_idx on public.sports_fixtures using gin (
  (coalesce(title, '')) gin_trgm_ops
);
create index if not exists sports_teams_search_trgm_idx on public.sports_teams using gin (
  (coalesce(name, '') || ' ' || coalesce(short_name, '')) gin_trgm_ops
);
create index if not exists sports_competitions_search_trgm_idx on public.sports_competitions using gin (
  (coalesce(name, '') || ' ' || coalesce(short_name, '')) gin_trgm_ops
);
create index if not exists sports_channels_search_trgm_idx on public.sports_channels using gin (
  (coalesce(name, '')) gin_trgm_ops
);
create index if not exists sports_videos_search_trgm_idx on public.sports_videos using gin (
  (coalesce(title, '') || ' ' || coalesce(description, '')) gin_trgm_ops
);
create index if not exists sports_team_aliases_alias_trgm_idx on public.sports_team_aliases using gin (
  alias gin_trgm_ops
);

-- ---------------------------------------------------------------------------
-- updated_at triggers (selected high-churn tables)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'sports', 'sport_categories', 'sports_countries', 'sports_providers',
    'sports_competitions', 'sports_competition_seasons', 'sports_teams',
    'sports_athletes', 'sports_venues', 'sports_fixtures', 'sports_broadcasts',
    'sports_channels', 'sports_stream_sources', 'sports_videos', 'sports_video_sources',
    'sports_rights_grants', 'sports_rights_territories', 'sports_stream_health',
    'sports_provider_health', 'sports_feature_flags', 'sports_worker_checkpoints'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.sports_touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — metadata public reads only for verified published content
-- ---------------------------------------------------------------------------

alter table public.sports enable row level security;
alter table public.sport_categories enable row level security;
alter table public.sports_competitions enable row level security;
alter table public.sports_teams enable row level security;
alter table public.sports_athletes enable row level security;
alter table public.sports_fixtures enable row level security;
alter table public.sports_broadcasts enable row level security;
alter table public.sports_channels enable row level security;
alter table public.sports_videos enable row level security;
alter table public.sports_follows enable row level security;
alter table public.sports_favorites enable row level security;
alter table public.sports_watch_history enable row level security;
alter table public.sports_continue_watching enable row level security;
alter table public.sports_reminders enable row level security;
alter table public.sports_preferences enable row level security;
alter table public.sports_notification_preferences enable row level security;

drop policy if exists sports_public_read on public.sports;
create policy sports_public_read on public.sports for select using (status = 'active');

drop policy if exists sport_categories_public_read on public.sport_categories;
create policy sport_categories_public_read on public.sport_categories for select using (status = 'active');

drop policy if exists sports_competitions_public_read on public.sports_competitions;
create policy sports_competitions_public_read on public.sports_competitions for select
  using (status in ('verified', 'scheduled', 'live', 'active', 'external_only'));

drop policy if exists sports_teams_public_read on public.sports_teams;
create policy sports_teams_public_read on public.sports_teams for select using (status = 'active');

drop policy if exists sports_athletes_public_read on public.sports_athletes;
create policy sports_athletes_public_read on public.sports_athletes for select using (status = 'active');

drop policy if exists sports_fixtures_public_read on public.sports_fixtures;
create policy sports_fixtures_public_read on public.sports_fixtures for select
  using (status in ('scheduled', 'live', 'verified', 'completed', 'external_only', 'geo_blocked'));

drop policy if exists sports_broadcasts_public_read on public.sports_broadcasts;
create policy sports_broadcasts_public_read on public.sports_broadcasts for select
  using (
    published_at is not null
    and unpublished_at is null
    and quarantined_at is null
    and availability_status in ('verified', 'scheduled', 'live', 'external_only', 'degraded')
  );

drop policy if exists sports_channels_public_read on public.sports_channels;
create policy sports_channels_public_read on public.sports_channels for select
  using (
    published_at is not null
    and unpublished_at is null
    and quarantined_at is null
    and status in ('verified', 'live', 'external_only', 'degraded')
  );

drop policy if exists sports_videos_public_read on public.sports_videos;
create policy sports_videos_public_read on public.sports_videos for select
  using (
    published_at is not null
    and unpublished_at is null
    and quarantined_at is null
    and status in ('verified', 'external_only', 'degraded')
  );

drop policy if exists sports_follows_owner on public.sports_follows;
create policy sports_follows_owner on public.sports_follows for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sports_favorites_owner on public.sports_favorites;
create policy sports_favorites_owner on public.sports_favorites for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sports_watch_history_owner on public.sports_watch_history;
create policy sports_watch_history_owner on public.sports_watch_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sports_continue_watching_owner on public.sports_continue_watching;
create policy sports_continue_watching_owner on public.sports_continue_watching for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sports_reminders_owner on public.sports_reminders;
create policy sports_reminders_owner on public.sports_reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sports_preferences_owner on public.sports_preferences;
create policy sports_preferences_owner on public.sports_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sports_notification_preferences_owner on public.sports_notification_preferences;
create policy sports_notification_preferences_owner on public.sports_notification_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.sports to anon, authenticated;
grant select on public.sport_categories to anon, authenticated;
grant select on public.sports_competitions to anon, authenticated;
grant select on public.sports_teams to anon, authenticated;
grant select on public.sports_athletes to anon, authenticated;
grant select on public.sports_fixtures to anon, authenticated;
grant select on public.sports_broadcasts to anon, authenticated;
grant select on public.sports_channels to anon, authenticated;
grant select on public.sports_videos to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Feature flags (disabled by default)
-- ---------------------------------------------------------------------------

insert into public.sports_feature_flags (key, enabled, description) values
  ('sports_enabled', false, 'Public Sports product surface'),
  ('sports_admin_enabled', true, 'Sports admin infrastructure'),
  ('sports_native_playback_enabled', false, 'Native in-app Sports playback'),
  ('sports_embedded_playback_enabled', false, 'Official embedded Sports playback'),
  ('sports_external_watch_enabled', true, 'Official external watch links'),
  ('sports_live_scores_enabled', false, 'Live scores surface'),
  ('sports_notifications_enabled', false, 'Sports notifications'),
  ('sports_provider_imports_enabled', false, 'Provider import workers')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Dev taxonomy seed (no playable streams)
-- ---------------------------------------------------------------------------

insert into public.sports_countries (code, name, region) values
  ('ZZ', 'Test Region', 'test'),
  ('US', 'United States', 'americas'),
  ('GB', 'United Kingdom', 'europe'),
  ('ZA', 'South Africa', 'africa'),
  ('AU', 'Australia', 'oceania')
on conflict (code) do nothing;

insert into public.sports (slug, name, description, status, sort_order) values
  ('football', 'Football', 'Association football / soccer', 'active', 10),
  ('basketball', 'Basketball', 'Basketball', 'active', 20),
  ('tennis', 'Tennis', 'Tennis', 'active', 30),
  ('cricket', 'Cricket', 'Cricket', 'active', 40),
  ('rugby', 'Rugby', 'Rugby union and league', 'active', 50),
  ('motorsport', 'Motorsport', 'Racing and motorsport', 'active', 60),
  ('combat', 'Combat Sports', 'Boxing, MMA, and combat sports', 'active', 70),
  ('athletics', 'Athletics', 'Track and field', 'active', 80),
  ('swimming', 'Swimming', 'Aquatic sports', 'active', 90),
  ('cycling', 'Cycling', 'Road and track cycling', 'active', 100),
  ('winter', 'Winter Sports', 'Snow and ice sports', 'active', 110),
  ('esports', 'Esports', 'Competitive gaming', 'active', 120)
on conflict (slug) do nothing;

insert into public.sports_providers (slug, name, provider_type, official_domain, is_enabled, health_status, notes)
values (
  'phase1-test-provider',
  'Phase 1 Test Provider',
  'test',
  'example.test',
  false,
  'disabled',
  'PHASE1_TEST_ONLY — not for production playback or import'
)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
