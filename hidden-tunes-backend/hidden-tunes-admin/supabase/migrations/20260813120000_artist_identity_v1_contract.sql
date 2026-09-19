-- Artist identity v1: additive metadata only. No data backfill, merge, delete, or table rewrite.
-- Existing `artists.id` UUID remains the immutable canonical identifier.

begin;

alter table public.artists
  add column if not exists canonical_name text,
  add column if not exists sort_name text,
  add column if not exists biography text,
  add column if not exists avatar_url text,
  add column if not exists hero_image_url text,
  add column if not exists verification_state text,
  add column if not exists profile_state text;

alter table public.artist_aliases
  add column if not exists alias_type text not null default 'alternate',
  add column if not exists locale text,
  add column if not exists source text,
  add column if not exists status text not null default 'active';

alter table public.artist_external_ids
  add column if not exists source text,
  add column if not exists confidence numeric(5,4),
  add column if not exists status text not null default 'active',
  add column if not exists is_public boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.artist_credits
  add column if not exists content_type text,
  add column if not exists content_id text,
  add column if not exists credit_role text,
  add column if not exists display_name text,
  add column if not exists position integer,
  add column if not exists source text,
  add column if not exists status text not null default 'active';

create table if not exists public.artist_moods (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references public.artists(id) on delete cascade,
  mood text not null,
  sort_order integer not null default 0,
  source text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (artist_id, mood)
);

create index if not exists artist_aliases_normalized_status_idx
  on public.artist_aliases (alias_normalized, status);
create index if not exists artist_external_ids_artist_status_idx
  on public.artist_external_ids (artist_id, status);
create index if not exists artist_credits_content_idx
  on public.artist_credits (content_type, content_id, position);
create index if not exists artist_moods_artist_sort_idx
  on public.artist_moods (artist_id, sort_order) where status = 'active';

-- Deliberately NOT added until collision reports are clean:
-- unique canonical-name, normalized-alias, or slug constraints.
-- Existing unique(provider, external_id) remains authoritative for provider identity.

notify pgrst, 'reload schema';
commit;
