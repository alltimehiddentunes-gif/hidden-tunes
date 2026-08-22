begin;
drop function if exists public.owner_alert_record_occurrence(text,text,text,text,text,text,text,text,text,text,jsonb,text,timestamptz);
drop table if exists public.owner_alert_events;
commit;
