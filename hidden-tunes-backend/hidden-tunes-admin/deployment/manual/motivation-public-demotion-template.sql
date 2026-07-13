-- =============================================================================
-- Hidden Tunes — Motivationals Public Demotion Template (MANUAL REVIEW ONLY)
-- =============================================================================
--
-- DO NOT RUN AS-IS.
-- 1. Run the PREVIEW query below.
-- 2. Uncomment and fill in only reviewed UUIDs in the CTE.
-- 3. Re-run PREVIEW to confirm affected rows.
-- 4. Uncomment and run the UPDATE block.
--
-- This template:
--   - Does NOT delete rows
--   - Does NOT modify motivation_files
--   - Does NOT affect IDs not explicitly listed
--   - Does NOT mass-update the catalog
--
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PREVIEW (read-only) — run first
-- ---------------------------------------------------------------------------

-- Replace the UUID list below with your reviewed items before uncommenting.

/*
with reviewed_items(id, decision, reason) as (
  values
    -- ('00000000-0000-4000-8000-000000000001'::uuid, 'route_lectures', 'Academic lecture content'),
    -- ('00000000-0000-4000-8000-000000000002'::uuid, 'reject', 'Machine-generated title'),
    -- ('00000000-0000-4000-8000-000000000003'::uuid, 'route_films', 'Film content')
    (null::uuid, 'hold', 'placeholder')
)
select
  mi.id,
  mi.title,
  mi.status as current_status,
  mi.is_active as current_is_active,
  mi.is_verified as current_is_verified,
  mi.playback_status,
  mi.content_classification as current_classification,
  ri.decision as proposed_decision,
  ri.reason as proposed_reason
from public.motivation_items mi
inner join reviewed_items ri on ri.id = mi.id
where ri.id is not null;
*/

-- ---------------------------------------------------------------------------
-- DEMOTION UPDATE — uncomment only after PREVIEW confirms correct rows
-- ---------------------------------------------------------------------------

/*
begin;

with reviewed_items(id, decision, reason) as (
  values
    -- ('00000000-0000-4000-8000-000000000001'::uuid, 'route_lectures', 'Academic lecture content'),
    -- ('00000000-0000-4000-8000-000000000002'::uuid, 'reject', 'Machine-generated title'),
    -- ('00000000-0000-4000-8000-000000000003'::uuid, 'route_films', 'Film content')
    (null::uuid, 'hold', 'placeholder')
)
update public.motivation_items mi
set
  is_active = false,
  is_verified = false,
  status = case
    when ri.decision in ('reject', 'route_lectures', 'route_podcasts', 'route_films', 'route_tv', 'route_audiobooks')
      then 'blocked'
    else 'pending'
  end,
  content_classification = ri.decision,
  content_classification_reason = ri.reason,
  updated_at = now()
from reviewed_items ri
where mi.id = ri.id
  and ri.id is not null;

commit;
*/

-- ---------------------------------------------------------------------------
-- POST-DEMOTION VERIFY (read-only)
-- ---------------------------------------------------------------------------

/*
select
  id,
  title,
  status,
  is_active,
  is_verified,
  playback_status,
  content_classification,
  content_classification_reason
from public.motivation_items
where id in (
  -- paste reviewed UUIDs here
  '00000000-0000-4000-8000-000000000001'::uuid
);
*/
