-- =============================================================================
-- Hidden Tunes — Motivationals Quality Migration (MANUAL PRODUCTION)
-- =============================================================================
--
-- PRODUCTION PROJECT ONLY
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query).
-- Safe to rerun: uses IF NOT EXISTS and idempotent backfill predicates.
-- Does NOT promote pending records.
-- Does NOT delete, reject, or auto-approve any row.
--
-- Source migration:
--   supabase/migrations/20260712180000_motivation_expansion_quality.sql
--
-- After running, verify with:
--   deployment/manual/motivation-expansion-quality-verify.sql
--
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Add quality columns (idempotent)
-- ---------------------------------------------------------------------------

alter table public.motivation_items
  add column if not exists content_classification text not null default 'hold',
  add column if not exists content_classification_reason text,
  add column if not exists content_classification_confidence integer,
  add column if not exists normalized_title_hash text,
  add column if not exists health_status text not null default 'unchecked',
  add column if not exists duplicate_status text not null default 'none',
  add column if not exists rights_status text not null default 'unchecked',
  add column if not exists media_probe_status text not null default 'unchecked';

-- ---------------------------------------------------------------------------
-- Backfill: only already-public rows that still hold default classification
-- ---------------------------------------------------------------------------

update public.motivation_items
set content_classification = 'accept'
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and content_classification = 'hold';

-- ---------------------------------------------------------------------------
-- Indexes (idempotent)
-- ---------------------------------------------------------------------------

create index if not exists motivation_items_content_classification_idx
  on public.motivation_items (content_classification, status, is_active)
  where status = 'approved';

create index if not exists motivation_items_normalized_title_hash_idx
  on public.motivation_items (normalized_title_hash)
  where normalized_title_hash is not null;

create index if not exists motivation_items_language_country_idx
  on public.motivation_items (language, region, category_slug)
  where status = 'approved' and is_active = true;

-- ---------------------------------------------------------------------------
-- Reload PostgREST schema cache
-- ---------------------------------------------------------------------------

notify pgrst, 'reload schema';

commit;
