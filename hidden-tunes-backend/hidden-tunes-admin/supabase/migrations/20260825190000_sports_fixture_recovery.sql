-- Sports fixture recovery history + exact rollback support.
-- Additive only. Does not enable Sports, providers, schedulers, or playback.

create table if not exists public.sports_fixture_recovery_batches (
  id uuid primary key default gen_random_uuid(),
  batch_key text not null unique,
  operation text not null,
  status text not null default 'capturing',
  initiated_by text not null default current_user,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sports_fixture_recovery_batches_status_check check (
    status in ('capturing', 'captured', 'applied', 'rolling_back', 'rolled_back', 'failed')
  )
);

create table if not exists public.sports_fixture_recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.sports_fixture_recovery_batches(id) on delete cascade,
  root_fixture_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  existed_before boolean not null,
  row_data jsonb,
  captured_at timestamptz not null default now(),
  restored_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sports_fixture_recovery_snapshots_entity_check check (
    entity_type in (
      'competition', 'season', 'team', 'fixture',
      'participant', 'score', 'provider_mapping'
    )
  ),
  constraint sports_fixture_recovery_snapshots_row_check check (
    (existed_before = true and row_data is not null)
    or (existed_before = false and row_data is null)
  ),
  constraint sports_fixture_recovery_snapshots_unique
    unique (batch_id, entity_type, entity_id)
);

create index if not exists sports_fixture_recovery_snapshots_fixture_idx
  on public.sports_fixture_recovery_snapshots (root_fixture_id, captured_at desc);

create index if not exists sports_fixture_recovery_batches_status_idx
  on public.sports_fixture_recovery_batches (status, created_at desc);

alter table public.sports_fixture_recovery_batches enable row level security;
alter table public.sports_fixture_recovery_snapshots enable row level security;

revoke all on table public.sports_fixture_recovery_batches from public, anon, authenticated;
revoke all on table public.sports_fixture_recovery_snapshots from public, anon, authenticated;
grant all on table public.sports_fixture_recovery_batches to service_role;
grant all on table public.sports_fixture_recovery_snapshots to service_role;

create table if not exists public.sports_data_versions (
  key text primary key,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.sports_data_versions (key, version)
values ('fixture_catalog', 1)
on conflict (key) do nothing;
alter table public.sports_data_versions enable row level security;
revoke all on table public.sports_data_versions from public, anon, authenticated;
grant all on table public.sports_data_versions to service_role;

create or replace function public.sports_bump_fixture_data_version()
returns bigint
language sql
security definer
set search_path = public
as $$
  insert into public.sports_data_versions (key, version, updated_at)
  values ('fixture_catalog', 1, now())
  on conflict (key) do update
  set version = sports_data_versions.version + 1, updated_at = now()
  returning version;
$$;

create or replace function public.sports_fixture_scheduler_claim(
  p_worker_key text,
  p_now timestamptz,
  p_lock_seconds integer default 900
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean := false;
begin
  if p_lock_seconds < 60 or p_lock_seconds > 3600 then
    raise exception 'scheduler lock seconds out of range';
  end if;
  insert into public.sports_worker_checkpoints (
    worker_key, checkpoint, locked_until, last_run_at, last_status, updated_at
  ) values (
    p_worker_key, '{}'::jsonb, p_now + make_interval(secs => p_lock_seconds),
    p_now, 'running', p_now
  )
  on conflict (worker_key) do update
  set locked_until = excluded.locked_until,
      last_run_at = excluded.last_run_at,
      last_status = 'running',
      last_error = null,
      updated_at = excluded.updated_at
  where sports_worker_checkpoints.locked_until is null
     or sports_worker_checkpoints.locked_until <= p_now
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.sports_fixture_scheduler_finish(
  p_worker_key text,
  p_status text,
  p_error text,
  p_checkpoint jsonb,
  p_now timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('completed', 'failed', 'skipped') then
    raise exception 'unsupported scheduler status %', p_status;
  end if;
  update public.sports_worker_checkpoints
  set checkpoint = coalesce(p_checkpoint, '{}'::jsonb),
      locked_until = null,
      last_run_at = p_now,
      last_status = p_status,
      last_error = nullif(p_error, ''),
      updated_at = p_now
  where worker_key = p_worker_key;
  if not found then raise exception 'scheduler checkpoint not found: %', p_worker_key; end if;
end;
$$;

create or replace function public.sports_fixture_recovery_table_name(
  p_entity_type text
) returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  return case p_entity_type
    when 'competition' then 'sports_competitions'
    when 'season' then 'sports_competition_seasons'
    when 'team' then 'sports_teams'
    when 'fixture' then 'sports_fixtures'
    when 'participant' then 'sports_fixture_participants'
    when 'score' then 'sports_fixture_scores'
    when 'provider_mapping' then 'sports_fixture_provider_ids'
    else null
  end;
end;
$$;

create or replace function public.sports_fixture_recovery_begin(
  p_batch_key text,
  p_operation text,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
  v_status text;
begin
  if nullif(trim(p_batch_key), '') is null then
    raise exception 'batch_key is required';
  end if;
  if nullif(trim(p_operation), '') is null then
    raise exception 'operation is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('sports_fixture_recovery:' || p_batch_key));

  insert into public.sports_fixture_recovery_batches (
    batch_key, operation, status, metadata
  ) values (
    p_batch_key, p_operation, 'capturing', coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (batch_key) do nothing;

  select id, status into v_batch_id, v_status
  from public.sports_fixture_recovery_batches
  where batch_key = p_batch_key
  for update;

  if v_status not in ('capturing', 'captured') then
    raise exception 'recovery batch % is not capturable (status=%)', p_batch_key, v_status;
  end if;

  return v_batch_id;
end;
$$;

create or replace function public.sports_fixture_recovery_capture_fixture(
  p_batch_id uuid,
  p_fixture_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_count integer := 0;
  v_rows integer := 0;
begin
  select status into v_status
  from public.sports_fixture_recovery_batches
  where id = p_batch_id
  for update;
  if v_status not in ('capturing', 'captured') then
    raise exception 'batch % is not capturable', p_batch_id;
  end if;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select p_batch_id, p_fixture_id, 'fixture', p_fixture_id, true, to_jsonb(f)
  from public.sports_fixtures f where f.id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_count = row_count;

  if not exists (select 1 from public.sports_fixtures where id = p_fixture_id) then
    insert into public.sports_fixture_recovery_snapshots (
      batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
    ) values (p_batch_id, p_fixture_id, 'fixture', p_fixture_id, false, null)
    on conflict (batch_id, entity_type, entity_id) do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
    update public.sports_fixture_recovery_batches
    set status = 'captured', captured_at = coalesce(captured_at, now()), updated_at = now()
    where id = p_batch_id;
    return v_count;
  end if;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select p_batch_id, p_fixture_id, 'participant', p.id, true, to_jsonb(p)
  from public.sports_fixture_participants p where p.fixture_id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select p_batch_id, p_fixture_id, 'score', s.id, true, to_jsonb(s)
  from public.sports_fixture_scores s where s.fixture_id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select p_batch_id, p_fixture_id, 'provider_mapping', m.id, true, to_jsonb(m)
  from public.sports_fixture_provider_ids m where m.fixture_id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select p_batch_id, p_fixture_id, 'competition', c.id, true, to_jsonb(c)
  from public.sports_fixtures f
  join public.sports_competitions c on c.id = f.competition_id
  where f.id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select p_batch_id, p_fixture_id, 'season', s.id, true, to_jsonb(s)
  from public.sports_fixtures f
  join public.sports_competition_seasons s on s.id = f.season_id
  where f.id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  )
  select distinct p_batch_id, p_fixture_id, 'team', t.id, true, to_jsonb(t)
  from public.sports_fixture_participants fp
  join public.sports_teams t on t.id = fp.team_id
  where fp.fixture_id = p_fixture_id
  on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;

  update public.sports_fixture_recovery_batches
  set status = 'captured', captured_at = coalesce(captured_at, now()), updated_at = now()
  where id = p_batch_id;

  return v_count;
end;
$$;

create or replace function public.sports_fixture_recovery_register_new_entity(
  p_batch_id uuid,
  p_root_fixture_id uuid,
  p_entity_type text,
  p_entity_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_exists boolean;
  v_status text;
begin
  v_table := public.sports_fixture_recovery_table_name(p_entity_type);
  if v_table is null then raise exception 'unsupported entity type %', p_entity_type; end if;

  select status into v_status from public.sports_fixture_recovery_batches
  where id = p_batch_id for update;
  if v_status not in ('capturing', 'captured') then
    raise exception 'batch % is not capturable', p_batch_id;
  end if;

  execute format('select exists(select 1 from public.%I where id = $1)', v_table)
    into v_exists using p_entity_id;
  if v_exists then
    raise exception 'entity %.% already exists; capture it instead', p_entity_type, p_entity_id;
  end if;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  ) values (
    p_batch_id, p_root_fixture_id, p_entity_type, p_entity_id, false, null
  ) on conflict (batch_id, entity_type, entity_id) do nothing;

  update public.sports_fixture_recovery_batches
  set status = 'captured', captured_at = coalesce(captured_at, now()), updated_at = now()
  where id = p_batch_id;
end;
$$;

create or replace function public.sports_fixture_recovery_capture_entity(
  p_batch_id uuid,
  p_root_fixture_id uuid,
  p_entity_type text,
  p_entity_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text;
  v_status text;
  v_row jsonb;
  v_rows integer := 0;
begin
  v_table := public.sports_fixture_recovery_table_name(p_entity_type);
  if v_table is null then raise exception 'unsupported entity type %', p_entity_type; end if;

  select status into v_status from public.sports_fixture_recovery_batches
  where id = p_batch_id for update;
  if v_status not in ('capturing', 'captured') then
    raise exception 'batch % is not capturable', p_batch_id;
  end if;

  execute format('select to_jsonb(t) from public.%I t where id = $1', v_table)
    into v_row using p_entity_id;

  insert into public.sports_fixture_recovery_snapshots (
    batch_id, root_fixture_id, entity_type, entity_id, existed_before, row_data
  ) values (
    p_batch_id,
    p_root_fixture_id,
    p_entity_type,
    p_entity_id,
    v_row is not null,
    v_row
  ) on conflict (batch_id, entity_type, entity_id) do nothing;
  get diagnostics v_rows = row_count;

  update public.sports_fixture_recovery_batches
  set status = 'captured', captured_at = coalesce(captured_at, now()), updated_at = now()
  where id = p_batch_id;

  return v_rows;
end;
$$;

create or replace function public.sports_fixture_recovery_mark_applied(
  p_batch_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.sports_fixture_recovery_snapshots where batch_id = p_batch_id
  ) then raise exception 'batch % has no snapshots', p_batch_id; end if;

  update public.sports_fixture_recovery_batches
  set status = 'applied', applied_at = now(), updated_at = now(), failure_reason = null
  where id = p_batch_id and status = 'captured';
  if not found then raise exception 'batch % is not captured', p_batch_id; end if;
end;
$$;

create or replace function public.sports_fixture_recovery_rollback(
  p_batch_id uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_snapshot record;
  v_table text;
  v_assignments text;
  v_restored integer := 0;
begin
  select status into v_status from public.sports_fixture_recovery_batches
  where id = p_batch_id for update;
  if v_status not in ('captured', 'applied', 'failed') then
    raise exception 'batch % cannot roll back from status %', p_batch_id, v_status;
  end if;

  update public.sports_fixture_recovery_batches
  set status = 'rolling_back', updated_at = now() where id = p_batch_id;

  for v_snapshot in
    select * from public.sports_fixture_recovery_snapshots
    where batch_id = p_batch_id and existed_before = false
    order by case entity_type
      when 'participant' then 10 when 'score' then 11 when 'provider_mapping' then 12
      when 'fixture' then 20 when 'season' then 30 when 'team' then 31
      when 'competition' then 40 else 99 end
  loop
    v_table := public.sports_fixture_recovery_table_name(v_snapshot.entity_type);
    execute format('delete from public.%I where id = $1', v_table)
      using v_snapshot.entity_id;
  end loop;

  for v_snapshot in
    select * from public.sports_fixture_recovery_snapshots
    where batch_id = p_batch_id and existed_before = true
    order by case entity_type
      when 'competition' then 10 when 'season' then 20 when 'team' then 21
      when 'fixture' then 30 when 'participant' then 40 when 'score' then 41
      when 'provider_mapping' then 42 else 99 end
  loop
    v_table := public.sports_fixture_recovery_table_name(v_snapshot.entity_type);
    select string_agg(format('%I = excluded.%I', key, key), ', ' order by key)
      into v_assignments
    from jsonb_object_keys(v_snapshot.row_data) key
    where key <> 'id';

    execute format(
      'insert into public.%1$I select * from jsonb_populate_record(null::public.%1$I, $1) '
      || 'on conflict (id) do update set %2$s',
      v_table,
      v_assignments
    ) using v_snapshot.row_data;

    update public.sports_fixture_recovery_snapshots
    set restored_at = now() where id = v_snapshot.id;
    v_restored := v_restored + 1;
  end loop;

  update public.sports_fixture_recovery_batches
  set status = 'rolled_back', rolled_back_at = now(), updated_at = now()
  where id = p_batch_id;

  return v_restored;
exception when others then
  update public.sports_fixture_recovery_batches
  set status = 'failed', failed_at = now(), failure_reason = sqlerrm, updated_at = now()
  where id = p_batch_id;
  raise;
end;
$$;

revoke all on function public.sports_fixture_recovery_table_name(text) from public;
revoke all on function public.sports_bump_fixture_data_version() from public, anon, authenticated;
revoke all on function public.sports_fixture_scheduler_claim(text, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.sports_fixture_scheduler_finish(text, text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.sports_fixture_recovery_begin(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sports_fixture_recovery_capture_fixture(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sports_fixture_recovery_register_new_entity(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.sports_fixture_recovery_capture_entity(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.sports_fixture_recovery_mark_applied(uuid) from public, anon, authenticated;
revoke all on function public.sports_fixture_recovery_rollback(uuid) from public, anon, authenticated;

grant execute on function public.sports_fixture_recovery_begin(text, text, jsonb) to service_role;
grant execute on function public.sports_bump_fixture_data_version() to service_role;
grant execute on function public.sports_fixture_scheduler_claim(text, timestamptz, integer) to service_role;
grant execute on function public.sports_fixture_scheduler_finish(text, text, text, jsonb, timestamptz) to service_role;
grant execute on function public.sports_fixture_recovery_capture_fixture(uuid, uuid) to service_role;
grant execute on function public.sports_fixture_recovery_register_new_entity(uuid, uuid, text, uuid) to service_role;
grant execute on function public.sports_fixture_recovery_capture_entity(uuid, uuid, text, uuid) to service_role;
grant execute on function public.sports_fixture_recovery_mark_applied(uuid) to service_role;
grant execute on function public.sports_fixture_recovery_rollback(uuid) to service_role;

notify pgrst, 'reload schema';
