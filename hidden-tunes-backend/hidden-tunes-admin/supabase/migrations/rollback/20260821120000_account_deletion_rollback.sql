begin;

revoke all on function public.account_deletion_mark_completed(text) from service_role;
revoke all on function public.account_delete_owned_data(uuid, text) from service_role;
revoke all on function public.account_deletion_consume_rate_limit(text, integer, integer) from service_role;
drop function if exists public.account_deletion_mark_completed(text);
drop function if exists public.account_delete_owned_data(uuid, text);
drop function if exists public.account_deletion_consume_rate_limit(text, integer, integer);
drop table if exists public.account_deletion_rate_limits;
drop table if exists public.account_deletion_receipts;

commit;

-- This removes the account-deletion feature schema only. Completed deletions
-- cannot and must not be reconstructed by rollback.
