\set ON_ERROR_STOP on
set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
create function pg_temp.assert_ok(value boolean,message text) returns void language plpgsql as $$begin if value is not true then raise exception '%',message; end if;end$$;
select (public.crossplay_register_device('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Mobile test','mobile','phone','test','{}')).id as device_a \gset
select (public.crossplay_register_device('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Mobile renamed','mobile','phone','test','{}')).id as device_a2 \gset
select pg_temp.assert_ok(:'device_a'=:'device_a2','registration not idempotent');
select (public.crossplay_write_progress(:'device_a'::uuid,'music','track-1','',42000,180000,'in_progress',0,'{"title":"Test track"}')).version as version1 \gset
do $$ begin begin perform public.crossplay_write_progress((select id from public.user_devices where device_public_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),'music','track-1','',45000,180000,'in_progress',0,'{}'); raise exception 'stale version accepted'; exception when others then if sqlerrm='stale version accepted' then raise; end if; end; end $$;
select (public.crossplay_write_progress(:'device_a'::uuid,'radio','radio-1','',999,999,'in_progress',0,'{"title":"Test radio"}')).position_ms is null as radio_null;
select (public.crossplay_write_progress(:'device_a'::uuid,'tv','tv-1','',999,999,'in_progress',0,'{"title":"Test TV"}')).position_ms is null as tv_null;
select (public.crossplay_dismiss_progress('music','track-1','',1)).completion_state='dismissed' as dismissed;
select public.crossplay_revoke_device(:'device_a'::uuid);
do $$ begin begin perform public.crossplay_write_progress((select id from public.user_devices where device_public_id='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),'podcast','episode-1','',1,2,'in_progress',0,'{}'); raise exception 'revoked device accepted'; exception when others then if sqlerrm='revoked device accepted' then raise; end if; end; end $$;
reset role; set role anon; set request.jwt.claim.sub='';
do $$ begin begin perform 1 from public.user_devices; raise exception 'anonymous read accepted'; exception when insufficient_privilege then null; end; begin perform public.crossplay_register_device('bbbbbbbbbbbbbbbb','bad','mobile','phone','x','{}'); raise exception 'anonymous rpc accepted'; exception when insufficient_privilege then null; end; end $$;
reset role; set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin if exists(select 1 from public.user_devices) or exists(select 1 from public.playback_progress) then raise exception 'cross-account read leaked'; end if; end $$;
reset role;
