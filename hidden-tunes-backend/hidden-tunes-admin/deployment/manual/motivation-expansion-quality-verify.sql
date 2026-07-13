-- 1. Verify all quality columns exist on public.motivation_items

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

-- 2. Verify indexes exist

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

-- 3. Database totals

select count(*) as database_total
from public.motivation_items;

-- 4. Approved count

select count(*) as approved
from public.motivation_items
where status = 'approved';

-- 5. Pending count

select count(*) as pending
from public.motivation_items
where status = 'pending';

-- 6. Active count

select count(*) as active
from public.motivation_items
where is_active = true;

-- 7. Verified count

select count(*) as verified
from public.motivation_items
where is_verified = true;

-- 8. Playable count

select count(*) as playable
from public.motivation_items
where playback_status = 'playable';

-- 9. Healthy count

select count(*) as healthy
from public.motivation_items
where health_status = 'healthy';

-- 10. accept count

select count(*) as accept
from public.motivation_items
where content_classification = 'accept';

-- 11. hold count

select count(*) as hold
from public.motivation_items
where content_classification = 'hold';

-- 12. reject count

select count(*) as reject
from public.motivation_items
where content_classification = 'reject';

-- 13. route_lectures count

select count(*) as route_lectures
from public.motivation_items
where content_classification = 'route_lectures';

-- 14. route_podcasts count

select count(*) as route_podcasts
from public.motivation_items
where content_classification = 'route_podcasts';

-- 15. route_films count

select count(*) as route_films
from public.motivation_items
where content_classification = 'route_films';

-- 16. Public rows violating approved + active + verified + playable + content_classification = accept

select
  id,
  title,
  status,
  is_active,
  is_verified,
  playback_status,
  content_classification,
  reliability_score,
  health_status,
  rights_status,
  media_probe_status,
  category_slug,
  source_key
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

-- 17. Full review query for watchlist titles

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
