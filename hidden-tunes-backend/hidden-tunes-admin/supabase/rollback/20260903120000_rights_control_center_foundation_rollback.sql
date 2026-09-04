-- MANUAL DEVELOPMENT ROLLBACK ONLY.
-- Refuses to proceed when any rights catalog, job, changeset, license, or
-- evidence data exists. It never touches source catalog or media tables.
begin;

do $$
declare
  populated boolean;
begin
  select exists(select 1 from public.rights_catalog_items limit 1)
      or exists(select 1 from public.rights_bulk_jobs limit 1)
      or exists(select 1 from public.rights_changesets limit 1)
      or exists(select 1 from public.rights_licenses limit 1)
      or exists(select 1 from public.rights_evidence limit 1)
    into populated;
  if populated then
    raise exception 'rights foundation rollback refused: control-plane data exists';
  end if;
end;
$$;

drop function if exists public.rights_claim_job_targets(uuid, integer);
drop function if exists public.rights_claim_next_job(boolean);
drop trigger if exists rights_snapshot_immutable on public.rights_filter_snapshots;
drop function if exists public.rights_deny_snapshot_mutation();
drop trigger if exists rights_audit_append_only on public.rights_audit_log;
drop function if exists public.rights_deny_audit_mutation();
drop table if exists public.rights_audit_log;
drop table if exists public.rights_changeset_entries;
alter table if exists public.rights_bulk_jobs drop constraint if exists rights_bulk_jobs_changeset_id_fkey;
drop table if exists public.rights_changesets;
drop table if exists public.rights_bulk_job_targets;
drop table if exists public.rights_bulk_jobs;
drop table if exists public.rights_effective_state;
drop table if exists public.rights_item_overrides;
drop table if exists public.rights_policies;
drop table if exists public.rights_evidence;
drop table if exists public.rights_license_scopes;
drop table if exists public.rights_licenses;
drop table if exists public.rights_filter_exclusions;
drop table if exists public.rights_filter_snapshots;
drop table if exists public.rights_saved_filters;
drop table if exists public.rights_catalog_rollups;
drop table if exists public.rights_catalog_items;
drop table if exists public.rights_sync_checkpoints;
drop table if exists public.rights_providers;

commit;
