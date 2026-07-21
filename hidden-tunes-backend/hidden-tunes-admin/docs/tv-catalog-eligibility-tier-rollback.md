# Rollback — TV catalog eligibility tier

Migration: `supabase/migrations/20260721120000_tv_catalog_eligibility_tier.sql`

## Forward effect

- Adds `tv_videos.catalog_eligibility_tier` (`verified` | `search_only`), default `verified`
- Adds partial indexes for verified and search-only eligible rows
- Updates `sync_tv_videos_derived_columns` so `is_public` is true only for `verified` rows that already pass public playability gates

## Rollback (code)

Redeploy the previous backend revision that does not filter on `catalog_eligibility_tier`.

## Rollback (database)

```sql
-- Optional: move any search_only rows back to verified before dropping the column
-- update public.tv_videos set catalog_eligibility_tier = 'verified' where catalog_eligibility_tier = 'search_only';

drop index if exists public.tv_videos_search_discovery_eligible_idx;
drop index if exists public.tv_videos_verified_catalog_eligible_idx;

alter table public.tv_videos
  drop constraint if exists tv_videos_catalog_eligibility_tier_check;

alter table public.tv_videos
  drop column if exists catalog_eligibility_tier;

-- Restore previous sync_tv_videos_derived_columns from
-- supabase/migrations/20260712140000_tv_platform_quality_gate.sql
-- (or re-apply that migration's function body), then:
notify pgrst, 'reload schema';
```

## Notes

- Additive and reversible; no table rewrite
- Existing rows default to `verified` and keep Main Verified browse behavior
- Search-only rows never appear in browse once the column/filter is active
