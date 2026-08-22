begin;
create table if not exists public.owner_alert_events(
 id uuid primary key default gen_random_uuid(), event_type text not null check(length(event_type) between 1 and 120),
 severity text not null check(severity in('critical','high','normal','info')), source text not null check(length(source) between 1 and 80),
 title text not null check(length(title)<=160), message text not null check(length(message)<=500), platform text, environment text not null default 'production',
 entity_type text, entity_id text, metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object' and pg_column_size(metadata)<=8192),
 fingerprint varchar(64) not null check(fingerprint~'^[0-9a-f]{64}$'), status text not null default 'open' check(status in('open','acknowledged','resolved')),
 occurrence_count integer not null default 1 check(occurrence_count>0), first_occurred_at timestamptz not null, last_occurred_at timestamptz not null,
 delivery_state text not null check(delivery_state in('pending','disabled','sent','failed','digest_pending','digested')),
 delivery_attempts smallint not null default 0 check(delivery_attempts between 0 and 3), last_delivery_error text, next_delivery_at timestamptz,
 notification_sent_at timestamptz, acknowledged_at timestamptz, acknowledged_by uuid, resolved_at timestamptz, resolved_by uuid,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists owner_alert_events_fingerprint_uq on public.owner_alert_events(fingerprint);
create index if not exists owner_alert_events_admin_idx on public.owner_alert_events(status,severity,last_occurred_at desc);
alter table public.owner_alert_events enable row level security;
revoke all on public.owner_alert_events from public,anon,authenticated;
grant all on public.owner_alert_events to service_role;

create or replace function public.owner_alert_record_occurrence(p_event_type text,p_severity text,p_source text,p_title text,p_message text,p_fingerprint text,p_platform text,p_environment text,p_entity_type text,p_entity_id text,p_metadata jsonb,p_delivery_state text,p_occurred_at timestamptz)
returns setof public.owner_alert_events language plpgsql security definer set search_path=public as $$
begin
 if p_metadata is null or jsonb_typeof(p_metadata)<>'object' or pg_column_size(p_metadata)>8192 then raise exception 'invalid alert metadata'; end if;
 return query insert into public.owner_alert_events(event_type,severity,source,title,message,fingerprint,platform,environment,entity_type,entity_id,metadata,delivery_state,first_occurred_at,last_occurred_at)
 values(p_event_type,p_severity,p_source,p_title,p_message,p_fingerprint,p_platform,coalesce(p_environment,'production'),p_entity_type,p_entity_id,p_metadata,p_delivery_state,p_occurred_at,p_occurred_at)
 on conflict(fingerprint) do update set occurrence_count=owner_alert_events.occurrence_count+1,last_occurred_at=greatest(owner_alert_events.last_occurred_at,excluded.last_occurred_at),
 severity=excluded.severity,title=excluded.title,message=excluded.message,metadata=excluded.metadata,status=case when owner_alert_events.status='resolved' and excluded.last_occurred_at>owner_alert_events.resolved_at then 'open' else owner_alert_events.status end,
 acknowledged_at=case when owner_alert_events.status='resolved' and excluded.last_occurred_at>owner_alert_events.resolved_at then null else owner_alert_events.acknowledged_at end,
 resolved_at=case when owner_alert_events.status='resolved' and excluded.last_occurred_at>owner_alert_events.resolved_at then null else owner_alert_events.resolved_at end,updated_at=now()
 returning *;
end$$;
revoke all on function public.owner_alert_record_occurrence(text,text,text,text,text,text,text,text,text,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.owner_alert_record_occurrence(text,text,text,text,text,text,text,text,text,text,jsonb,text,timestamptz) to service_role;
commit;
