-- Hidden Tunes Verified Live Concerts — Phase 2 database foundation.
-- Additive only. Parallel catalogue (no FKs into TV / Sports / Motivation / Lectures).
-- Metadata-first; playback URLs only via /play resolvers (later phases).
-- Safe to run multiple times (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- Does NOT insert any public seed or catalogue records.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Shared touch trigger
-- ---------------------------------------------------------------------------

create or replace function public.concerts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- concert_sources
-- ---------------------------------------------------------------------------

create table if not exists public.concert_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  provider_type text not null,
  official_url text not null,
  country_code text,
  language_code text,
  source_owner text not null,
  authorization_basis text not null default 'unclear',
  terms_url text,
  embed_permitted boolean not null default false,
  supported_countries text[] not null default '{}'::text[],
  expected_content_type text,
  validation_method text,
  enabled boolean not null default false,
  reliability_score integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_sources_provider_type_check check (
    provider_type in (
      'official_artist',
      'official_festival',
      'official_venue',
      'public_broadcaster',
      'orchestra',
      'university',
      'cultural_institution',
      'authorized_platform',
      'opera_house',
      'conservatory',
      'government_cultural'
    )
  ),
  constraint concert_sources_authorization_basis_check check (
    authorization_basis in (
      'official_owner',
      'institutional_mandate',
      'explicit_license',
      'public_broadcaster_terms',
      'platform_embed_terms',
      'unclear',
      'denied'
    )
  ),
  constraint concert_sources_reliability_score_check check (
    reliability_score >= 0 and reliability_score <= 100
  ),
  constraint concert_sources_enabled_requires_clear_auth_check check (
    enabled = false
    or authorization_basis not in ('unclear', 'denied')
  )
);

create unique index if not exists concert_sources_name_official_url_uidx
  on public.concert_sources (lower(name), lower(official_url));

create index if not exists concert_sources_enabled_reliability_idx
  on public.concert_sources (enabled, reliability_score desc)
  where enabled = true;

create index if not exists concert_sources_provider_type_idx
  on public.concert_sources (provider_type, enabled);

-- ---------------------------------------------------------------------------
-- concert_artists
-- ---------------------------------------------------------------------------

create table if not exists public.concert_artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  external_artist_id text,
  artwork_url text,
  country_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_artists_normalized_name_unique unique (normalized_name)
);

create index if not exists concert_artists_name_trgm_idx
  on public.concert_artists using gin (normalized_name gin_trgm_ops);

create index if not exists concert_artists_external_id_idx
  on public.concert_artists (external_artist_id)
  where external_artist_id is not null;

-- ---------------------------------------------------------------------------
-- concert_categories
-- ---------------------------------------------------------------------------

create table if not exists public.concert_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  artwork_url text,
  sort_order integer not null default 0,
  item_count integer not null default 0,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_categories_slug_unique unique (slug),
  constraint concert_categories_item_count_check check (item_count >= 0)
);

create index if not exists concert_categories_enabled_sort_idx
  on public.concert_categories (enabled, sort_order, slug)
  where enabled = true;

-- ---------------------------------------------------------------------------
-- concert_items
-- ---------------------------------------------------------------------------

create table if not exists public.concert_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.concert_sources(id) on delete restrict,
  source_item_id text not null,
  title text not null,
  normalized_title text not null,
  description text,
  primary_artist_name text,
  normalized_primary_artist text,
  event_name text,
  venue_name text,
  city text,
  region text,
  country_code text,
  language_code text,
  genre text,
  concert_type text not null default 'concert',
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  artwork_url text,
  official_page_url text,
  duration_seconds integer,
  is_live boolean not null default false,
  is_upcoming boolean not null default false,
  is_replay boolean not null default false,
  is_free boolean not null default true,
  is_public boolean not null default false,
  is_mature boolean not null default false,
  visibility_status text not null default 'discovered',
  rights_status text not null default 'rights_unknown',
  playback_status text not null default 'unchecked',
  health_score integer not null default 0,
  last_verified_at timestamptz,
  published_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_items_source_item_unique unique (source_id, source_item_id),
  constraint concert_items_concert_type_check check (
    concert_type in (
      'concert',
      'festival_set',
      'livestream',
      'orchestra',
      'opera',
      'recital',
      'venue_broadcast',
      'cultural_performance',
      'other'
    )
  ),
  constraint concert_items_visibility_status_check check (
    visibility_status in (
      'discovered',
      'validation_pending',
      'verified_upcoming',
      'live',
      'replay_available',
      'failed',
      'offline',
      'unavailable',
      'quarantined',
      'rights_unknown'
    )
  ),
  constraint concert_items_rights_status_check check (
    rights_status in (
      'rights_unknown',
      'pending_review',
      'authorized',
      'public_domain',
      'denied',
      'revoked'
    )
  ),
  constraint concert_items_playback_status_check check (
    playback_status in (
      'unchecked',
      'validation_pending',
      'playable',
      'degraded',
      'failed',
      'offline',
      'unavailable',
      'quarantined'
    )
  ),
  constraint concert_items_health_score_check check (
    health_score >= -200 and health_score <= 200
  ),
  constraint concert_items_duration_check check (
    duration_seconds is null or duration_seconds >= 0
  ),
  -- Public-eligible statuses only when explicitly published + free + not mature-gated later.
  -- Migration never seeds public rows; this guards accidental publish of non-eligible statuses.
  constraint concert_items_public_status_guard_check check (
    is_public = false
    or (
      visibility_status in ('verified_upcoming', 'live', 'replay_available')
      and rights_status in ('authorized', 'public_domain')
      and playback_status = 'playable'
      and published_at is not null
    )
  )
);

create index if not exists concert_items_public_status_start_idx
  on public.concert_items (visibility_status, start_at)
  where is_public = true
    and visibility_status in ('verified_upcoming', 'live', 'replay_available');

create index if not exists concert_items_live_idx
  on public.concert_items (is_live, start_at)
  where is_public = true and visibility_status = 'live';

create index if not exists concert_items_upcoming_start_idx
  on public.concert_items (start_at)
  where is_public = true and visibility_status = 'verified_upcoming';

create index if not exists concert_items_replay_published_idx
  on public.concert_items (published_at desc)
  where is_public = true and visibility_status = 'replay_available';

create index if not exists concert_items_source_idx
  on public.concert_items (source_id, visibility_status);

create index if not exists concert_items_validation_freshness_idx
  on public.concert_items (last_verified_at desc nulls last, visibility_status);

create index if not exists concert_items_quarantine_idx
  on public.concert_items (visibility_status, updated_at desc)
  where visibility_status = 'quarantined';

create index if not exists concert_items_dedupe_key_idx
  on public.concert_items (dedupe_key)
  where dedupe_key is not null;

create index if not exists concert_items_title_trgm_idx
  on public.concert_items using gin (normalized_title gin_trgm_ops);

create index if not exists concert_items_artist_trgm_idx
  on public.concert_items using gin (normalized_primary_artist gin_trgm_ops)
  where normalized_primary_artist is not null;

create index if not exists concert_items_event_venue_trgm_idx
  on public.concert_items using gin (
    (coalesce(event_name, '') || ' ' || coalesce(venue_name, '')) gin_trgm_ops
  );

-- ---------------------------------------------------------------------------
-- concert_streams
-- ---------------------------------------------------------------------------

create table if not exists public.concert_streams (
  id uuid primary key default gen_random_uuid(),
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  provider text not null,
  provider_content_id text not null,
  embed_url text,
  official_watch_url text,
  stream_type text not null default 'embed',
  mime_type text,
  embeddable boolean not null default false,
  requires_external_app boolean not null default false,
  geo_restrictions jsonb not null default '{}'::jsonb,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  playback_status text not null default 'unchecked',
  last_verified_at timestamptz,
  last_http_status integer,
  failure_count integer not null default 0,
  consecutive_failure_count integer not null default 0,
  quarantined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_streams_provider_content_unique unique (provider, provider_content_id),
  constraint concert_streams_stream_type_check check (
    stream_type in ('embed', 'hls', 'dash', 'external', 'webview')
  ),
  constraint concert_streams_playback_status_check check (
    playback_status in (
      'unchecked',
      'validation_pending',
      'playable',
      'degraded',
      'failed',
      'offline',
      'unavailable',
      'quarantined'
    )
  ),
  constraint concert_streams_failure_count_check check (
    failure_count >= 0 and consecutive_failure_count >= 0
  ),
  -- Reject obvious extracted progressive media URL patterns for YouTube.
  constraint concert_streams_no_extracted_youtube_media_check check (
    embed_url is null
    or (
      embed_url !~* 'googlevideo\\.com'
      and embed_url !~* '/videoplayback'
      and embed_url !~* 'mime=video'
    )
  )
);

create index if not exists concert_streams_item_status_idx
  on public.concert_streams (concert_item_id, playback_status);

create index if not exists concert_streams_quarantine_idx
  on public.concert_streams (quarantined_at desc nulls last)
  where quarantined_at is not null;

create index if not exists concert_streams_validation_freshness_idx
  on public.concert_streams (last_verified_at desc nulls last, playback_status);

create index if not exists concert_streams_scheduled_start_idx
  on public.concert_streams (scheduled_start_at)
  where scheduled_start_at is not null;

-- ---------------------------------------------------------------------------
-- concert_item_artists
-- ---------------------------------------------------------------------------

create table if not exists public.concert_item_artists (
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  concert_artist_id uuid not null references public.concert_artists(id) on delete cascade,
  role text not null default 'performer',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (concert_item_id, concert_artist_id),
  constraint concert_item_artists_role_check check (
    role in ('performer', 'headliner', 'opener', 'orchestra', 'conductor', 'featured', 'other')
  ),
  constraint concert_item_artists_position_check check (position >= 0)
);

create index if not exists concert_item_artists_artist_idx
  on public.concert_item_artists (concert_artist_id, position);

-- ---------------------------------------------------------------------------
-- concert_item_categories
-- ---------------------------------------------------------------------------

create table if not exists public.concert_item_categories (
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  concert_category_id uuid not null references public.concert_categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (concert_item_id, concert_category_id)
);

create index if not exists concert_item_categories_category_idx
  on public.concert_item_categories (concert_category_id, concert_item_id);

-- ---------------------------------------------------------------------------
-- concert_validation_runs (core evidence table; public denied in playback migration)
-- ---------------------------------------------------------------------------

create table if not exists public.concert_validation_runs (
  id uuid primary key default gen_random_uuid(),
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  concert_stream_id uuid references public.concert_streams(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text not null default 'pending',
  failure_reason text,
  http_status integer,
  provider_status text,
  embeddable boolean,
  is_available boolean,
  is_live boolean,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint concert_validation_runs_result_check check (
    result in (
      'pending',
      'passed',
      'failed',
      'blocked',
      'expired',
      'degraded',
      'skipped'
    )
  )
);

create index if not exists concert_validation_runs_item_started_idx
  on public.concert_validation_runs (concert_item_id, started_at desc);

create index if not exists concert_validation_runs_stream_started_idx
  on public.concert_validation_runs (concert_stream_id, started_at desc)
  where concert_stream_id is not null;

create index if not exists concert_validation_runs_result_idx
  on public.concert_validation_runs (result, started_at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'concert_sources',
    'concert_artists',
    'concert_categories',
    'concert_items',
    'concert_streams'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.concerts_touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — catalogue metadata public only for verified public-eligible rows
-- ---------------------------------------------------------------------------

alter table public.concert_sources enable row level security;
alter table public.concert_artists enable row level security;
alter table public.concert_categories enable row level security;
alter table public.concert_items enable row level security;
alter table public.concert_streams enable row level security;
alter table public.concert_item_artists enable row level security;
alter table public.concert_item_categories enable row level security;
alter table public.concert_validation_runs enable row level security;

drop policy if exists concert_sources_public_read on public.concert_sources;
create policy concert_sources_public_read on public.concert_sources for select
  using (
    enabled = true
    and authorization_basis not in ('unclear', 'denied')
  );

drop policy if exists concert_artists_public_read on public.concert_artists;
create policy concert_artists_public_read on public.concert_artists for select
  using (true);

drop policy if exists concert_categories_public_read on public.concert_categories;
create policy concert_categories_public_read on public.concert_categories for select
  using (enabled = true);

drop policy if exists concert_items_public_read on public.concert_items;
create policy concert_items_public_read on public.concert_items for select
  using (
    is_public = true
    and visibility_status in ('verified_upcoming', 'live', 'replay_available')
    and rights_status in ('authorized', 'public_domain')
    and playback_status = 'playable'
    and published_at is not null
  );

-- Streams are not browsable via PostgREST; play resolution is server-side only.
drop policy if exists concert_streams_no_public on public.concert_streams;
create policy concert_streams_no_public on public.concert_streams for select
  using (false);

drop policy if exists concert_item_artists_public_read on public.concert_item_artists;
create policy concert_item_artists_public_read on public.concert_item_artists for select
  using (
    exists (
      select 1
      from public.concert_items ci
      where ci.id = concert_item_id
        and ci.is_public = true
        and ci.visibility_status in ('verified_upcoming', 'live', 'replay_available')
        and ci.published_at is not null
    )
  );

drop policy if exists concert_item_categories_public_read on public.concert_item_categories;
create policy concert_item_categories_public_read on public.concert_item_categories for select
  using (
    exists (
      select 1
      from public.concert_items ci
      where ci.id = concert_item_id
        and ci.is_public = true
        and ci.visibility_status in ('verified_upcoming', 'live', 'replay_available')
        and ci.published_at is not null
    )
  );

drop policy if exists concert_validation_runs_no_public on public.concert_validation_runs;
create policy concert_validation_runs_no_public on public.concert_validation_runs for select
  using (false);

grant select on public.concert_sources to anon, authenticated;
grant select on public.concert_artists to anon, authenticated;
grant select on public.concert_categories to anon, authenticated;
grant select on public.concert_items to anon, authenticated;
grant select on public.concert_item_artists to anon, authenticated;
grant select on public.concert_item_categories to anon, authenticated;

revoke all on public.concert_streams from anon, authenticated;
revoke all on public.concert_validation_runs from anon, authenticated;

notify pgrst, 'reload schema';
