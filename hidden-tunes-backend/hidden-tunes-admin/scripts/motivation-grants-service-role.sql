-- Grants for Motivationals program platform tables
-- Intended for production when using supabase service_role key.

grant usage on schema public to service_role;

grant select, insert, update, delete on public.motivation_creators to service_role;
grant select, insert, update, delete on public.motivation_programs to service_role;
grant select, insert, update, delete on public.motivation_sources to service_role;
grant select, insert, update, delete on public.motivation_rights to service_role;
grant select, insert, update, delete on public.motivation_progress to service_role;
grant select, insert, update, delete on public.motivation_import_jobs to service_role;
grant select, insert, update, delete on public.motivation_import_failures to service_role;

