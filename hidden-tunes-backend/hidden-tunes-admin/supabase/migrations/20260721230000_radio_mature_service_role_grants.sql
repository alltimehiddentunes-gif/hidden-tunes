-- Fix missing service_role grants for mature radio support tables.
-- The original mature catalog migration created these tables without grants,
-- which caused permission-denied failures during mature expansion queueing.

grant select, insert, update, delete on public.radio_mature_review_queue to service_role;
grant select, insert, update, delete on public.radio_mature_source_registry to service_role;
