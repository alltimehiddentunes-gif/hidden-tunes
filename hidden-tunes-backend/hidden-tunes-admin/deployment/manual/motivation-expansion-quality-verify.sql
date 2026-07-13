-- =============================================================================
-- Hidden Tunes — Motivationals Quality Migration Verification (READ-ONLY)
-- =============================================================================
-- Run in Supabase SQL Editor AFTER motivation-expansion-quality-production.sql
-- All queries are read-only. Safe to rerun.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column existence (all eight quality columns)
-- ---------------------------------------------------------------------------

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'motivation_items'
  and column_name in (
    'content_classification',
    'content_classification_reason',
    'content_classification_confidence',
    'normalized_title_hash',
    'health_status',
    'duplicate_status',
    'rights_status',
    'media_probe_status'
  )
order by column_name;

-- Expect 8 rows.

-- ---------------------------------------------------------------------------
-- 2. Index existence
-- ---------------------------------------------------------------------------

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'motivation_items'
  and indexname in (
    'motivation_items_content_classification_idx',
    'motivation_items_normalized_title_hash_idx',
    'motivation_items_language_country_idx'
  )
order by indexname;

-- Expect 3 rows.

-- ---------------------------------------------------------------------------
-- 3. Status counts
-- ---------------------------------------------------------------------------

select
  count(*) as database_total,
  count(*) filter (where status = 'approved') as approved,
  count(*) filter (where status = 'pending') as pending,
  count(*) filter (where is_active = true) as active,
  count(*) filter (where is_verified = true) as verified,
  count(*) filter (where playback_status = 'playable') as playable,
  count(*) filter (where health_status = 'healthy') as healthy,
  count(*) filter (where content_classification = 'accept') as content_classification_accept,
  count(*) filter (where content_classification = 'hold') as content_classification_hold,
  count(*) filter (where content_classification = 'reject') as content_classification_reject,
  count(*) filter (where content_classification = 'route_lectures') as route_lectures,
  count(*) filter (where content_classification = 'route_podcasts') as route_podcasts,
  count(*) filter (where content_classification = 'route_films') as route_films
from public.motivation_items;

-- ---------------------------------------------------------------------------
-- 4. Healthy public count (milestone metric)
-- ---------------------------------------------------------------------------

select count(*) as healthy_public_total
from public.motivation_items
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and is_mature = false
  and content_classification = 'accept'
  and reliability_score >= 60;

-- ---------------------------------------------------------------------------
-- 5. Unsafe public rows (browse-visible but failing quality gates)
-- ---------------------------------------------------------------------------

select
  id,
  title,
  status,
  is_active,
  is_verified,
  playback_status,
  content_classification,
  reliability_score
from public.motivation_items
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and (
    content_classification is distinct from 'accept'
    or content_classification is null
  )
order by title;

-- Expect 0 rows after manual demotion of misclassified public items.

-- ---------------------------------------------------------------------------
-- 6. Questionable existing public items (watchlist)
-- ---------------------------------------------------------------------------

select
  id,
  title,
  status,
  is_active,
  is_verified,
  playback_status,
  content_classification,
  content_classification_reason,
  content_classification_confidence,
  health_status,
  rights_status,
  media_probe_status,
  category_slug,
  source_key
from public.motivation_items
where title ilike '%MIT15.969F04%'
   or title ilike '%MIT How To Speak, IAP 2018%'
   or title ilike '%MIT MAS.S62 Cryptocurrency Engineering and Design, Spring 2018%'
   or title ilike '%The Light Of Faith%'
   or title ilike '%Mindwarz Videos%'
order by title;
