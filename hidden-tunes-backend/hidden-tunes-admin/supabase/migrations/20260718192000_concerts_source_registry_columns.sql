-- Additive corrective migration for Concerts Phase 3 source registry.
-- Does NOT rewrite Phase 2 migrations. Extends concert_sources only.
-- Required because Phase 2 lacked stable_key, embed_policy, import_enabled,
-- ownership evidence, provider channel identity, and Phase 3 auth vocabulary.

create extension if not exists pgcrypto;

alter table public.concert_sources
  add column if not exists stable_key text,
  add column if not exists media_channel_url text,
  add column if not exists provider text not null default 'youtube',
  add column if not exists provider_channel_id text,
  add column if not exists region text,
  add column if not exists language_codes text[] not null default '{}'::text[],
  add column if not exists ownership_evidence_url text,
  add column if not exists embed_policy text not null default 'unknown',
  add column if not exists content_scope text,
  add column if not exists expected_concert_formats text[] not null default '{}'::text[],
  add column if not exists geo_restrictions jsonb not null default '{}'::jsonb,
  add column if not exists mature_content_possible boolean not null default false,
  add column if not exists import_enabled boolean not null default false,
  add column if not exists last_reviewed_at date,
  add column if not exists review_notes text;

-- Backfill stable_key for any pre-existing rows (none expected in Phase 2).
update public.concert_sources
set stable_key = coalesce(
  stable_key,
  'legacy-' || replace(id::text, '-', '')
)
where stable_key is null;

alter table public.concert_sources
  alter column stable_key set not null;

create unique index if not exists concert_sources_stable_key_uidx
  on public.concert_sources (stable_key);

create unique index if not exists concert_sources_provider_channel_uidx
  on public.concert_sources (provider, provider_channel_id)
  where provider_channel_id is not null;

create index if not exists concert_sources_import_enabled_idx
  on public.concert_sources (import_enabled, enabled)
  where import_enabled = true and enabled = true;

create index if not exists concert_sources_review_idx
  on public.concert_sources (authorization_basis, embed_policy, enabled)
  where authorization_basis in ('unclear', 'denied')
     or embed_policy in ('unknown', 'prohibited')
     or enabled = false;

do $$
begin
  -- Expand authorization vocabulary: keep Phase 2 values + Phase 3 names.
  if exists (
    select 1 from pg_constraint where conname = 'concert_sources_authorization_basis_check'
  ) then
    alter table public.concert_sources drop constraint concert_sources_authorization_basis_check;
  end if;

  alter table public.concert_sources
    add constraint concert_sources_authorization_basis_check
    check (
      authorization_basis in (
        'official_owner',
        'explicitly_authorized',
        'institutional_official',
        'platform_permitted',
        'unclear',
        'denied',
        -- Phase 2 compatibility aliases (mapped by repository; not used by new seeds)
        'institutional_mandate',
        'explicit_license',
        'public_broadcaster_terms',
        'platform_embed_terms'
      )
    );

  if exists (
    select 1 from pg_constraint where conname = 'concert_sources_enabled_requires_clear_auth_check'
  ) then
    alter table public.concert_sources drop constraint concert_sources_enabled_requires_clear_auth_check;
  end if;

  alter table public.concert_sources
    add constraint concert_sources_enabled_requires_clear_auth_check
    check (
      enabled = false
      or authorization_basis in (
        'official_owner',
        'explicitly_authorized',
        'institutional_official',
        'platform_permitted',
        'institutional_mandate',
        'explicit_license',
        'public_broadcaster_terms',
        'platform_embed_terms'
      )
    );

  if not exists (
    select 1 from pg_constraint where conname = 'concert_sources_embed_policy_check'
  ) then
    alter table public.concert_sources
      add constraint concert_sources_embed_policy_check
      check (
        embed_policy in (
          'official_embed_allowed',
          'provider_player_required',
          'external_link_only',
          'region_limited',
          'age_restricted',
          'unknown',
          'prohibited'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_sources_import_policy_check'
  ) then
    alter table public.concert_sources
      add constraint concert_sources_import_policy_check
      check (
        import_enabled = false
        or (
          enabled = true
          and embed_policy in (
            'official_embed_allowed',
            'provider_player_required',
            'region_limited',
            'age_restricted'
          )
          and authorization_basis in (
            'official_owner',
            'explicitly_authorized',
            'institutional_official',
            'platform_permitted',
            'institutional_mandate',
            'explicit_license',
            'public_broadcaster_terms',
            'platform_embed_terms'
          )
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'concert_sources_provider_check'
  ) then
    alter table public.concert_sources
      add constraint concert_sources_provider_check
      check (
        provider in (
          'youtube',
          'official_website',
          'vimeo',
          'authorized_platform',
          'public_broadcaster_player'
        )
      );
  end if;
end $$;

-- Mirror language_code into language_codes when empty.
update public.concert_sources
set language_codes = array[language_code]
where coalesce(cardinality(language_codes), 0) = 0
  and language_code is not null
  and length(trim(language_code)) > 0;

notify pgrst, 'reload schema';
