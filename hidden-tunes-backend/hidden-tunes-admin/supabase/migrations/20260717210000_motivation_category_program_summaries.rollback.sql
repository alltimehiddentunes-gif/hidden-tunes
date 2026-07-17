-- Rollback for 20260717210000_motivation_category_program_summaries.sql
-- Safe: drops only the objects added by that migration.

begin;

drop function if exists public.motivation_list_category_program_summaries(text, integer, integer);
drop function if exists public.motivation_program_key_from_item(uuid, text, text, text, text);
drop function if exists public.motivation_program_title_from_item(text);

drop index if exists public.motivation_items_category_program_browse_idx;
drop index if exists public.motivation_items_program_identity_key_idx;

commit;
