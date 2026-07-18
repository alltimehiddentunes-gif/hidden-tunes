-- Additive Phase 5: Concerts scale hardening — dedupe, lifecycle, rejection memory, region.
-- Does NOT rewrite prior Concerts migrations. No public seed data.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- concert_items — lifecycle, fingerprint, region, canonical linking
-- ---------------------------------------------------------------------------

alter table public.concert_items
  add column if not exists performance_fingerprint text,
  add column if not exists lifecycle_status text not null default 'discovered',
  add column if not exists canonical_concert_id uuid,
  add column if not exists original_scheduled_content_id text,
  add column if not exists replay_content_id text,
  add column if not exists replay_available_at timestamptz,
  add column if not exists composer_work text,
  add column if not exists set_name text,
  add column if not exists region_availability text not null default 'unknown',
  add column if not exists region_allowed_countries text[] not null default '{}'::text[],
  add column if not exists region_blocked_countries text[] not null default '{}'::text[],
  add column if not exists region_evidence jsonb not null default '{}'::jsonb,
  add column if not exists last_region_check_at timestamptz,
  add column if not exists duplicate_status text not null default 'unique',
  add column if not exists duplicate_match_score numeric,
  add column if not exists duplicate_match_reasons text[] not null default '{}'::text[],
  add column if not exists metadata_hash text,
  add column if not exists last_provider_metadata_at timestamptz,
  add column if not exists validation_prep_status text not null default 'not_prepared';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'concert_items_lifecycle_status_check'
  ) then
    alter table public.concert_items
      add constraint concert_items_lifecycle_status_check
      check (
        lifecycle_status in (
          'discovered',
          'scheduled',
          'upcoming_verified',
          'live_candidate',
          'live_validated',
          'ended',
          'replay_pending',
          'replay_validated',
          'offline',
          'superseded'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_items_region_availability_check'
  ) then
    alter table public.concert_items
      add constraint concert_items_region_availability_check
      check (
        region_availability in (
          'worldwide',
          'allowlist',
          'blocklist',
          'unknown'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_items_duplicate_status_check'
  ) then
    alter table public.concert_items
      add constraint concert_items_duplicate_status_check
      check (
        duplicate_status in (
          'unique',
          'exact_duplicate',
          'probable_duplicate',
          'canonical',
          'alias',
          'merged'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_items_validation_prep_status_check'
  ) then
    alter table public.concert_items
      add constraint concert_items_validation_prep_status_check
      check (
        validation_prep_status in (
          'not_prepared',
          'ready_for_validation',
          'validation_queued',
          'validation_blocked'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_items_canonical_fk'
  ) then
    alter table public.concert_items
      add constraint concert_items_canonical_fk
      foreign key (canonical_concert_id) references public.concert_items(id)
      on delete set null;
  end if;
end $$;

create index if not exists concert_items_performance_fingerprint_idx
  on public.concert_items (performance_fingerprint)
  where performance_fingerprint is not null;

create index if not exists concert_items_lifecycle_idx
  on public.concert_items (lifecycle_status, updated_at desc);

create index if not exists concert_items_canonical_idx
  on public.concert_items (canonical_concert_id)
  where canonical_concert_id is not null;

create index if not exists concert_items_duplicate_status_idx
  on public.concert_items (duplicate_status, duplicate_match_score desc nulls last);

create index if not exists concert_items_region_availability_idx
  on public.concert_items (region_availability);

create index if not exists concert_items_metadata_hash_idx
  on public.concert_items (source_id, metadata_hash)
  where metadata_hash is not null;

-- ---------------------------------------------------------------------------
-- concert_streams — supersession / replacement links
-- ---------------------------------------------------------------------------

alter table public.concert_streams
  add column if not exists superseded_by_stream_id uuid,
  add column if not exists replaces_stream_id uuid,
  add column if not exists is_canonical_stream boolean not null default true,
  add column if not exists stream_role text not null default 'primary';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'concert_streams_stream_role_check'
  ) then
    alter table public.concert_streams
      add constraint concert_streams_stream_role_check
      check (
        stream_role in (
          'primary',
          'scheduled',
          'live',
          'replay',
          'simulcast',
          'alias',
          'superseded'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_streams_superseded_by_fk'
  ) then
    alter table public.concert_streams
      add constraint concert_streams_superseded_by_fk
      foreign key (superseded_by_stream_id) references public.concert_streams(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_streams_replaces_fk'
  ) then
    alter table public.concert_streams
      add constraint concert_streams_replaces_fk
      foreign key (replaces_stream_id) references public.concert_streams(id)
      on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- concert_item_aliases — canonical/alias relationships (no silent deletes)
-- ---------------------------------------------------------------------------

create table if not exists public.concert_item_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_concert_id uuid not null references public.concert_items(id) on delete cascade,
  alias_concert_id uuid not null references public.concert_items(id) on delete cascade,
  relation_type text not null,
  match_score numeric not null default 0,
  match_reasons text[] not null default '{}'::text[],
  auto_merged boolean not null default false,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_item_aliases_pair_unique unique (canonical_concert_id, alias_concert_id),
  constraint concert_item_aliases_not_self check (canonical_concert_id <> alias_concert_id),
  constraint concert_item_aliases_relation_check check (
    relation_type in (
      'exact_duplicate',
      'same_provider_item',
      'cross_source_same_stream',
      'scheduled_to_replay',
      'reupload',
      'title_variant',
      'excerpt_of_full',
      'simulcast',
      'localized_duplicate',
      'work_title_variant',
      'metadata_correction',
      'probable_duplicate'
    )
  )
);

create index if not exists concert_item_aliases_canonical_idx
  on public.concert_item_aliases (canonical_concert_id, relation_type);

create index if not exists concert_item_aliases_alias_idx
  on public.concert_item_aliases (alias_concert_id);

-- ---------------------------------------------------------------------------
-- concert_import_rejections — rejection memory / cooldown
-- ---------------------------------------------------------------------------

create table if not exists public.concert_import_rejections (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.concert_sources(id) on delete set null,
  provider text not null,
  provider_content_id text not null,
  source_item_id text,
  reason_code text not null,
  reason_detail text,
  metadata_hash text,
  embed_status text,
  visibility_status text,
  scheduled_start_at timestamptz,
  cooldown_until timestamptz,
  retry_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  manual_retry_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_import_rejections_provider_content_unique
    unique (provider, provider_content_id, reason_code),
  constraint concert_import_rejections_reason_check check (
    reason_code in (
      'not_concert',
      'studio_music_video',
      'interview',
      'trailer',
      'promo',
      'short_insufficient',
      'private',
      'members_only',
      'paid_only',
      'embed_disabled',
      'region_unresolved',
      'rights_unclear',
      'dead',
      'fake_live',
      'duplicate_exact',
      'duplicate_probable',
      'metadata_insufficient',
      'provider_error'
    )
  ),
  constraint concert_import_rejections_retry_count_check check (retry_count >= 0)
);

create index if not exists concert_import_rejections_cooldown_idx
  on public.concert_import_rejections (provider, provider_content_id, cooldown_until);

create index if not exists concert_import_rejections_source_idx
  on public.concert_import_rejections (source_id, last_seen_at desc);

create index if not exists concert_import_rejections_manual_retry_idx
  on public.concert_import_rejections (manual_retry_requested)
  where manual_retry_requested = true;

-- ---------------------------------------------------------------------------
-- concert_possible_duplicates — uncertain soft matches awaiting review
-- ---------------------------------------------------------------------------

create table if not exists public.concert_possible_duplicates (
  id uuid primary key default gen_random_uuid(),
  concert_item_id_a uuid not null references public.concert_items(id) on delete cascade,
  concert_item_id_b uuid not null references public.concert_items(id) on delete cascade,
  match_score numeric not null,
  match_reasons text[] not null default '{}'::text[],
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_possible_duplicates_pair_check check (concert_item_id_a <> concert_item_id_b),
  constraint concert_possible_duplicates_ordered check (concert_item_id_a::text < concert_item_id_b::text),
  constraint concert_possible_duplicates_unique unique (concert_item_id_a, concert_item_id_b),
  constraint concert_possible_duplicates_status_check check (
    status in ('open', 'confirmed_duplicate', 'confirmed_distinct', 'merged', 'dismissed')
  )
);

create index if not exists concert_possible_duplicates_status_idx
  on public.concert_possible_duplicates (status, match_score desc);

-- ---------------------------------------------------------------------------
-- concert_playback_validation_prep — Phase 6 contract scaffolding
-- ---------------------------------------------------------------------------

create table if not exists public.concert_playback_validation_prep (
  id uuid primary key default gen_random_uuid(),
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  concert_stream_id uuid references public.concert_streams(id) on delete set null,
  watch_page_ok boolean,
  embed_allowed boolean,
  provider_player_loads boolean,
  playback_starts boolean,
  is_currently_live boolean,
  scheduled_not_started boolean,
  replay_available boolean,
  region_blocked boolean,
  age_restricted boolean,
  login_required boolean,
  subscription_required boolean,
  members_only boolean,
  removed_or_private boolean,
  temporary_provider_error boolean,
  dead_stream boolean,
  fake_live_loop boolean,
  unsupported_player boolean,
  evidence jsonb not null default '{}'::jsonb,
  prepared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists concert_playback_validation_prep_item_idx
  on public.concert_playback_validation_prep (concert_item_id, prepared_at desc);

-- ---------------------------------------------------------------------------
-- RLS — internal tables never public
-- ---------------------------------------------------------------------------

alter table public.concert_item_aliases enable row level security;
alter table public.concert_import_rejections enable row level security;
alter table public.concert_possible_duplicates enable row level security;
alter table public.concert_playback_validation_prep enable row level security;

drop policy if exists concert_item_aliases_no_public on public.concert_item_aliases;
create policy concert_item_aliases_no_public on public.concert_item_aliases for select using (false);

drop policy if exists concert_import_rejections_no_public on public.concert_import_rejections;
create policy concert_import_rejections_no_public on public.concert_import_rejections for select using (false);

drop policy if exists concert_possible_duplicates_no_public on public.concert_possible_duplicates;
create policy concert_possible_duplicates_no_public on public.concert_possible_duplicates for select using (false);

drop policy if exists concert_playback_validation_prep_no_public on public.concert_playback_validation_prep;
create policy concert_playback_validation_prep_no_public
  on public.concert_playback_validation_prep for select using (false);

revoke all on public.concert_item_aliases from anon, authenticated;
revoke all on public.concert_import_rejections from anon, authenticated;
revoke all on public.concert_possible_duplicates from anon, authenticated;
revoke all on public.concert_playback_validation_prep from anon, authenticated;

drop trigger if exists concert_item_aliases_touch_updated_at on public.concert_item_aliases;
create trigger concert_item_aliases_touch_updated_at
  before update on public.concert_item_aliases
  for each row execute function public.concerts_touch_updated_at();

drop trigger if exists concert_import_rejections_touch_updated_at on public.concert_import_rejections;
create trigger concert_import_rejections_touch_updated_at
  before update on public.concert_import_rejections
  for each row execute function public.concerts_touch_updated_at();

drop trigger if exists concert_possible_duplicates_touch_updated_at on public.concert_possible_duplicates;
create trigger concert_possible_duplicates_touch_updated_at
  before update on public.concert_possible_duplicates
  for each row execute function public.concerts_touch_updated_at();

drop trigger if exists concert_playback_validation_prep_touch_updated_at
  on public.concert_playback_validation_prep;
create trigger concert_playback_validation_prep_touch_updated_at
  before update on public.concert_playback_validation_prep
  for each row execute function public.concerts_touch_updated_at();

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'concert_items_concert_type_check'
  ) then
    alter table public.concert_items drop constraint concert_items_concert_type_check;
  end if;

  alter table public.concert_items
    add constraint concert_items_concert_type_check
    check (
      concert_type in (
        'concert',
        'festival_set',
        'livestream',
        'orchestra',
        'opera',
        'recital',
        'venue_broadcast',
        'cultural_performance',
        'other',
        'full_concert',
        'live_artist_set',
        'live_session',
        'orchestra_concert',
        'choir_performance',
        'gospel_concert',
        'jazz_session',
        'classical_recital',
        'chamber_performance',
        'dj_festival_set',
        'acoustic_performance',
        'university_concert',
        'conservatory_performance',
        'venue_livestream',
        'public_broadcaster_concert',
        'government_cultural_performance',
        'official_concert_replay',
        'scheduled_concert_livestream',
        'substantial_single_live_performance'
      )
    );
end $$;

notify pgrst, 'reload schema';
