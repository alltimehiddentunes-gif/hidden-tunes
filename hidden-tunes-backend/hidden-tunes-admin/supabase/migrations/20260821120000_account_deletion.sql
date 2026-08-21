begin;

create table if not exists public.account_deletion_receipts (
  user_hash text primary key check (char_length(user_hash) = 64),
  status text not null check (status in ('data_deleted', 'completed')),
  deleted_counts jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.account_deletion_rate_limits (
  user_hash text not null check (char_length(user_hash) = 64),
  attempted_at timestamptz not null default now()
);

create index if not exists account_deletion_rate_limits_lookup_idx
  on public.account_deletion_rate_limits (user_hash, attempted_at desc);

alter table public.account_deletion_receipts enable row level security;
alter table public.account_deletion_rate_limits enable row level security;
revoke all on public.account_deletion_receipts, public.account_deletion_rate_limits
  from public, anon, authenticated;

create or replace function public.account_deletion_consume_rate_limit(
  p_user_hash text,
  p_max_attempts integer default 5,
  p_window_seconds integer default 3600
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recent_count integer;
begin
  if p_user_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts not between 1 and 20
     or p_window_seconds not between 60 and 86400 then
    raise exception 'invalid account deletion rate-limit input';
  end if;

  delete from public.account_deletion_rate_limits
   where attempted_at < now() - interval '2 days';

  select count(*) into recent_count
    from public.account_deletion_rate_limits
   where user_hash = p_user_hash
     and attempted_at >= now() - make_interval(secs => p_window_seconds);

  if recent_count >= p_max_attempts then
    return false;
  end if;

  insert into public.account_deletion_rate_limits(user_hash) values (p_user_hash);
  return true;
end;
$$;

create or replace function public.account_delete_owned_data(
  p_user_id uuid,
  p_user_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  table_name text;
  affected integer;
  counts jsonb := '{}'::jsonb;
  pseudonymous_user_id uuid;
  receipt_status text;
begin
  if p_user_id is null or p_user_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid account deletion input';
  end if;

  select status into receipt_status
    from public.account_deletion_receipts
   where user_hash = p_user_hash;
  if receipt_status in ('data_deleted', 'completed') then
    return jsonb_build_object('status', receipt_status, 'repeated', true);
  end if;

  -- Explicit account-owned allowlist. Catalog, artist, rights, and audit rows are
  -- intentionally excluded from destructive deletion.
  foreach table_name in array array[
    'artist_followers',
    'sports_follows', 'sports_favorites', 'sports_watch_history',
    'sports_continue_watching', 'sports_reminders', 'sports_preferences',
    'sports_notification_preferences', 'sports_play_attempts',
    'sports_playback_sessions',
    'saved_concerts', 'concert_reminders', 'recently_watched_concerts',
    'followed_concert_artists',
    'playback_progress', 'user_devices'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('delete from public.%I where user_id = $1', table_name)
        using p_user_id;
      get diagnostics affected = row_count;
      counts := counts || jsonb_build_object(table_name, affected);
    end if;
  end loop;

  if to_regclass('public.motivation_progress') is not null then
    delete from public.motivation_progress where user_id = p_user_id::text;
    get diagnostics affected = row_count;
    counts := counts || jsonb_build_object('motivation_progress', affected);
  end if;

  -- Retained catalog/rights records lose their direct account association.
  if to_regclass('public.albums') is not null then
    update public.albums set uploaded_by_user_id = null where uploaded_by_user_id = p_user_id;
  end if;
  if to_regclass('public.songs') is not null then
    update public.songs set uploaded_by_user_id = null where uploaded_by_user_id = p_user_id;
  end if;
  if to_regclass('public.synced_lyrics') is not null then
    update public.synced_lyrics set
      created_by_user_id = case when created_by_user_id = p_user_id then null else created_by_user_id end,
      updated_by_user_id = case when updated_by_user_id = p_user_id then null else updated_by_user_id end
    where created_by_user_id = p_user_id or updated_by_user_id = p_user_id;
  end if;
  if to_regclass('public.artist_merges') is not null then
    update public.artist_merges set merged_by_user_id = null where merged_by_user_id = p_user_id;
  end if;
  if to_regclass('public.artist_audit_logs') is not null then
    update public.artist_audit_logs set actor_user_id = null where actor_user_id = p_user_id;
  end if;

  -- Claims are legal/ownership evidence and remain, but the claimant identifier
  -- becomes a deterministic, non-reversible pseudonym not linked to auth.users.
  pseudonymous_user_id := (
    substr(p_user_hash, 1, 8) || '-' || substr(p_user_hash, 9, 4) || '-4' ||
    substr(p_user_hash, 14, 3) || '-a' || substr(p_user_hash, 18, 3) || '-' ||
    substr(p_user_hash, 21, 12)
  )::uuid;
  if to_regclass('public.artist_claims') is not null then
    update public.artist_claims
       set claimant_user_id = pseudonymous_user_id,
           reviewed_by_user_id = case when reviewed_by_user_id = p_user_id then null else reviewed_by_user_id end
     where claimant_user_id = p_user_id or reviewed_by_user_id = p_user_id;
  end if;

  insert into public.account_deletion_receipts(user_hash, status, deleted_counts)
  values (p_user_hash, 'data_deleted', counts)
  on conflict (user_hash) do update
    set status = 'data_deleted', deleted_counts = excluded.deleted_counts;

  return jsonb_build_object('status', 'data_deleted', 'repeated', false);
end;
$$;

create or replace function public.account_deletion_mark_completed(p_user_hash text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.account_deletion_receipts
     set status = 'completed', completed_at = coalesce(completed_at, now())
   where user_hash = p_user_hash;
  if not found then raise exception 'account deletion receipt missing'; end if;
end;
$$;

revoke all on function public.account_deletion_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.account_delete_owned_data(uuid, text) from public, anon, authenticated;
revoke all on function public.account_deletion_mark_completed(text) from public, anon, authenticated;
grant execute on function public.account_deletion_consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.account_delete_owned_data(uuid, text) to service_role;
grant execute on function public.account_deletion_mark_completed(text) to service_role;

comment on function public.account_delete_owned_data(uuid, text) is
  'Service-role-only transactional deletion of explicitly allowlisted account data; catalog and artist ownership evidence is anonymized, not deleted.';

commit;
