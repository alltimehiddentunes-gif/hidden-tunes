-- Hidden Tunes Artist Profile infrastructure
-- Extends existing artists catalog; safe to run once (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- artists extensions
-- ---------------------------------------------------------------------------

alter table public.artists
  add column if not exists status text not null default 'published',
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_suspended boolean not null default false,
  add column if not exists explicit_rating text not null default 'unknown',
  add column if not exists country_code text,
  add column if not exists hometown text,
  add column if not exists debut_year integer,
  add column if not exists website_url text,
  add column if not exists profile_published_at timestamptz,
  add column if not exists merged_into_artist_id uuid references public.artists(id) on delete set null,
  add column if not exists featured_release_id uuid,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists artists_slug_idx on public.artists (slug) where slug is not null;
create index if not exists artists_status_published_idx on public.artists (status, is_suspended) where status = 'published';
create index if not exists artists_merged_into_idx on public.artists (merged_into_artist_id) where merged_into_artist_id is not null;

-- ---------------------------------------------------------------------------
-- artist_aliases
-- ---------------------------------------------------------------------------

create table if not exists public.artist_aliases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  alias text not null,
  alias_normalized text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (artist_id, alias_normalized)
);

create index if not exists artist_aliases_artist_idx on public.artist_aliases (artist_id);

-- ---------------------------------------------------------------------------
-- artist_external_ids
-- ---------------------------------------------------------------------------

create table if not exists public.artist_external_ids (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  provider text not null,
  external_id text not null,
  external_url text,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);

create index if not exists artist_external_ids_artist_idx on public.artist_external_ids (artist_id);

-- ---------------------------------------------------------------------------
-- artist_images
-- ---------------------------------------------------------------------------

create table if not exists public.artist_images (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  image_url text not null,
  image_type text not null default 'profile',
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_images_artist_sort_idx on public.artist_images (artist_id, sort_order);

-- ---------------------------------------------------------------------------
-- artist_genres
-- ---------------------------------------------------------------------------

create table if not exists public.artist_genres (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  genre text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (artist_id, genre)
);

create index if not exists artist_genres_artist_idx on public.artist_genres (artist_id, sort_order);

-- ---------------------------------------------------------------------------
-- artist_statistics (precomputed snapshots)
-- ---------------------------------------------------------------------------

create table if not exists public.artist_statistics (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  song_count integer not null default 0,
  release_count integer not null default 0,
  single_count integer not null default 0,
  video_count integer not null default 0,
  follower_count integer not null default 0,
  monthly_listeners integer not null default 0,
  total_plays bigint not null default 0,
  collaboration_count integer not null default 0,
  refreshed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- artist_followers
-- ---------------------------------------------------------------------------

create table if not exists public.artist_followers (
  artist_id uuid not null references public.artists(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (artist_id, user_id)
);

create index if not exists artist_followers_user_idx on public.artist_followers (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- artist_biography_sections
-- ---------------------------------------------------------------------------

create table if not exists public.artist_biography_sections (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  section_key text not null,
  title text,
  body text not null default '',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, section_key)
);

-- ---------------------------------------------------------------------------
-- artist_external_links
-- ---------------------------------------------------------------------------

create table if not exists public.artist_external_links (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  label text not null,
  url text not null,
  link_type text not null default 'website',
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists artist_external_links_artist_idx on public.artist_external_links (artist_id, sort_order);

-- ---------------------------------------------------------------------------
-- artist_profile_sections (backend-driven section config)
-- ---------------------------------------------------------------------------

create table if not exists public.artist_profile_sections (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  section_key text not null,
  title_override text,
  display_style text not null default 'list',
  sort_order integer not null default 0,
  is_enabled boolean not null default true,
  endpoint_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artist_id, section_key)
);

create index if not exists artist_profile_sections_artist_sort_idx
  on public.artist_profile_sections (artist_id, sort_order)
  where is_enabled = true;

-- ---------------------------------------------------------------------------
-- artist_collaborations
-- ---------------------------------------------------------------------------

create table if not exists public.artist_collaborations (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  collaborator_artist_id uuid not null references public.artists(id) on delete cascade,
  collaboration_score numeric(10,4) not null default 0,
  song_count integer not null default 0,
  is_published boolean not null default true,
  refreshed_at timestamptz not null default now(),
  unique (artist_id, collaborator_artist_id)
);

create index if not exists artist_collaborations_artist_score_idx
  on public.artist_collaborations (artist_id, collaboration_score desc);

-- ---------------------------------------------------------------------------
-- artist_relationships
-- ---------------------------------------------------------------------------

create table if not exists public.artist_relationships (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  related_artist_id uuid not null references public.artists(id) on delete cascade,
  relationship_type text not null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (artist_id, related_artist_id, relationship_type)
);

-- ---------------------------------------------------------------------------
-- artist_similar_scores
-- ---------------------------------------------------------------------------

create table if not exists public.artist_similar_scores (
  artist_id uuid not null references public.artists(id) on delete cascade,
  similar_artist_id uuid not null references public.artists(id) on delete cascade,
  similarity_score numeric(10,4) not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (artist_id, similar_artist_id)
);

create index if not exists artist_similar_scores_rank_idx
  on public.artist_similar_scores (artist_id, similarity_score desc);

-- ---------------------------------------------------------------------------
-- artist_song_rankings (precomputed top songs)
-- ---------------------------------------------------------------------------

create table if not exists public.artist_song_rankings (
  artist_id uuid not null references public.artists(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  rank_position integer not null,
  play_score numeric(14,4) not null default 0,
  refreshed_at timestamptz not null default now(),
  primary key (artist_id, song_id)
);

create index if not exists artist_song_rankings_artist_rank_idx
  on public.artist_song_rankings (artist_id, rank_position);

-- ---------------------------------------------------------------------------
-- artist_videos
-- ---------------------------------------------------------------------------

create table if not exists public.artist_videos (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  title text not null,
  slug text,
  description text,
  thumbnail_url text,
  video_source_type text not null default 'external',
  video_source_id text,
  duration_seconds integer,
  is_explicit boolean not null default false,
  is_published boolean not null default true,
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_videos_artist_sort_idx
  on public.artist_videos (artist_id, sort_order)
  where is_published = true;

-- ---------------------------------------------------------------------------
-- artist_credits
-- ---------------------------------------------------------------------------

create table if not exists public.artist_credits (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  credit_type text not null,
  credit_title text not null,
  related_song_id uuid references public.songs(id) on delete set null,
  related_album_id uuid references public.albums(id) on delete set null,
  related_artist_id uuid references public.artists(id) on delete set null,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists artist_credits_artist_idx on public.artist_credits (artist_id, sort_order);

-- ---------------------------------------------------------------------------
-- artist_emotional_worlds
-- ---------------------------------------------------------------------------

create table if not exists public.artist_emotional_worlds (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  world_key text not null,
  title text not null,
  description text,
  song_count integer not null default 0,
  artwork_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  refreshed_at timestamptz not null default now(),
  unique (artist_id, world_key)
);

-- ---------------------------------------------------------------------------
-- artist_related_content (cross-catalog links)
-- ---------------------------------------------------------------------------

create table if not exists public.artist_related_content (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  content_type text not null,
  content_id text not null,
  title text not null,
  subtitle text,
  artwork_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  unique (artist_id, content_type, content_id)
);

-- ---------------------------------------------------------------------------
-- artist_merges
-- ---------------------------------------------------------------------------

create table if not exists public.artist_merges (
  id uuid primary key default gen_random_uuid(),
  source_artist_id uuid not null references public.artists(id) on delete cascade,
  target_artist_id uuid not null references public.artists(id) on delete cascade,
  merged_by_user_id uuid,
  merge_reason text,
  created_at timestamptz not null default now(),
  unique (source_artist_id)
);

-- ---------------------------------------------------------------------------
-- artist_claims
-- ---------------------------------------------------------------------------

create table if not exists public.artist_claims (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  claimant_user_id uuid not null,
  status text not null default 'pending',
  evidence text,
  reviewed_by_user_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artist_claims_status_idx on public.artist_claims (status, created_at desc);

-- ---------------------------------------------------------------------------
-- artist_audit_logs
-- ---------------------------------------------------------------------------

create table if not exists public.artist_audit_logs (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid references public.artists(id) on delete set null,
  actor_user_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists artist_audit_logs_artist_idx on public.artist_audit_logs (artist_id, created_at desc);

-- ---------------------------------------------------------------------------
-- artist_rights_availability
-- ---------------------------------------------------------------------------

create table if not exists public.artist_rights_availability (
  artist_id uuid primary key references public.artists(id) on delete cascade,
  territory_mode text not null default 'worldwide',
  allowed_territories text[] not null default '{}',
  blocked_territories text[] not null default '{}',
  subscription_tier text,
  license_notes text,
  takedown_status text not null default 'none',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: artist_followers (user-specific)
-- ---------------------------------------------------------------------------

alter table public.artist_followers enable row level security;

drop policy if exists artist_followers_select_own on public.artist_followers;
create policy artist_followers_select_own on public.artist_followers
  for select using (auth.uid() = user_id);

drop policy if exists artist_followers_insert_own on public.artist_followers;
create policy artist_followers_insert_own on public.artist_followers
  for insert with check (auth.uid() = user_id);

drop policy if exists artist_followers_delete_own on public.artist_followers;
create policy artist_followers_delete_own on public.artist_followers
  for delete using (auth.uid() = user_id);

notify pgrst, 'reload schema';

commit;
