-- Cross Play Phase A: additive source only. Do not deploy without approval.
create table if not exists public.user_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  device_public_id text not null check (char_length(device_public_id) between 16 and 128),
  device_name text not null check (char_length(device_name) between 1 and 80),
  platform text not null check (platform in ('mobile','desktop')),
  device_class text not null check (device_class in ('phone','tablet','computer')),
  app_version text not null check (char_length(app_version) between 1 and 40),
  capabilities jsonb not null default '{}'::jsonb check (pg_column_size(capabilities) <= 2048),
  last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(),
  deactivated_at timestamptz, revoked_at timestamptz, unique(user_id, device_public_id)
);
create table if not exists public.playback_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  content_type text not null check (content_type in ('music','podcast','audiobook','lecture','motivational','radio','tv')),
  content_id text not null check (char_length(content_id) between 1 and 256), item_id text not null default '',
  position_ms bigint check (position_ms is null or position_ms >= 0), duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  completion_state text not null default 'in_progress' check (completion_state in ('in_progress','completed','dismissed')),
  last_device_id uuid not null references public.user_devices(id), version bigint not null default 1 check(version > 0),
  safe_metadata jsonb not null default '{}'::jsonb check (pg_column_size(safe_metadata) <= 8192),
  updated_at timestamptz not null default now(), primary key(user_id, content_type, content_id, item_id),
  check ((content_type in ('radio','tv') and position_ms is null) or content_type not in ('radio','tv'))
);
alter table public.user_devices enable row level security; alter table public.playback_progress enable row level security;
create policy crossplay_devices_read_own on public.user_devices for select using (user_id=auth.uid());
create policy crossplay_progress_read_own on public.playback_progress for select using (user_id=auth.uid());
create or replace function public.crossplay_register_device(p_public_id text,p_name text,p_platform text,p_class text,p_app_version text,p_capabilities jsonb default '{}'::jsonb)
returns public.user_devices language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.user_devices; begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 if p_platform not in ('mobile','desktop') or p_class not in ('phone','tablet','computer') or char_length(p_public_id) not between 16 and 128 or pg_column_size(coalesce(p_capabilities,'{}'))>2048 then raise exception 'invalid device'; end if;
 insert into public.user_devices(user_id,device_public_id,device_name,platform,device_class,app_version,capabilities)
 values(auth.uid(),p_public_id,left(p_name,80),p_platform,p_class,left(p_app_version,40),coalesce(p_capabilities,'{}'))
 on conflict(user_id,device_public_id) do update set device_name=excluded.device_name,platform=excluded.platform,device_class=excluded.device_class,app_version=excluded.app_version,capabilities=excluded.capabilities,last_seen_at=case when public.user_devices.last_seen_at<now()-interval '15 minutes' then now() else public.user_devices.last_seen_at end,deactivated_at=null
 where public.user_devices.revoked_at is null returning * into r; if r.id is null then raise exception 'device revoked'; end if; return r; end $$;
create or replace function public.crossplay_write_progress(p_device_id uuid,p_content_type text,p_content_id text,p_item_id text,p_position_ms bigint,p_duration_ms bigint,p_completion text,p_expected_version bigint,p_metadata jsonb default '{}'::jsonb)
returns public.playback_progress language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.playback_progress; begin
 if not exists(select 1 from public.user_devices d where d.id=p_device_id and d.user_id=auth.uid() and d.revoked_at is null and d.deactivated_at is null) then raise exception 'invalid device'; end if;
 if p_content_type not in ('music','podcast','audiobook','lecture','motivational','radio','tv') or char_length(p_content_id) not between 1 and 256 or p_completion not in ('in_progress','completed') or pg_column_size(coalesce(p_metadata,'{}'))>8192 then raise exception 'invalid progress'; end if;
 if p_content_type in ('radio','tv') then p_position_ms:=null; p_duration_ms:=null; end if;
 insert into public.playback_progress(user_id,content_type,content_id,item_id,position_ms,duration_ms,completion_state,last_device_id,version,safe_metadata)
 values(auth.uid(),p_content_type,p_content_id,coalesce(p_item_id,''),p_position_ms,p_duration_ms,p_completion,p_device_id,1,coalesce(p_metadata,'{}'))
 on conflict(user_id,content_type,content_id,item_id) do update set position_ms=excluded.position_ms,duration_ms=excluded.duration_ms,completion_state=excluded.completion_state,last_device_id=excluded.last_device_id,version=public.playback_progress.version+1,safe_metadata=excluded.safe_metadata,updated_at=now()
 where public.playback_progress.version=p_expected_version returning * into r;
 if r.version is null then raise exception 'progress version conflict'; end if; return r; end $$;
create or replace function public.crossplay_revoke_device(p_device_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin update public.user_devices set revoked_at=now(),deactivated_at=now() where id=p_device_id and user_id=auth.uid() and revoked_at is null; if not found then raise exception 'device not found'; end if; end $$;
create or replace function public.crossplay_dismiss_progress(p_content_type text,p_content_id text,p_item_id text,p_expected_version bigint) returns public.playback_progress language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.playback_progress; begin update public.playback_progress set completion_state='dismissed',version=version+1,updated_at=now() where user_id=auth.uid() and content_type=p_content_type and content_id=p_content_id and item_id=coalesce(p_item_id,'') and version=p_expected_version returning * into r; if r.version is null then raise exception 'progress version conflict'; end if; return r; end $$;
revoke all on public.user_devices,public.playback_progress from anon,authenticated;
grant select on public.user_devices,public.playback_progress to authenticated;
revoke all on function public.crossplay_register_device(text,text,text,text,text,jsonb),public.crossplay_write_progress(uuid,text,text,text,bigint,bigint,text,bigint,jsonb),public.crossplay_revoke_device(uuid),public.crossplay_dismiss_progress(text,text,text,bigint) from public,anon;
grant execute on function public.crossplay_register_device(text,text,text,text,text,jsonb),public.crossplay_write_progress(uuid,text,text,text,bigint,bigint,text,bigint,jsonb),public.crossplay_revoke_device(uuid),public.crossplay_dismiss_progress(text,text,text,bigint) to authenticated;
