create schema if not exists auth;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login password 'local-only-crossplay'; exception when duplicate_object then null; end $$;
grant anon,authenticated to authenticator;
create table if not exists auth.users(id uuid primary key,email text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated; grant select on auth.users to authenticated;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','mobile@example.invalid'),('00000000-0000-4000-8000-000000000002','other@example.invalid') on conflict do nothing;
