# Hidden Tunes Lectures Expansion Manual Runbook

This runbook is the manual start-to-finish operations package for the Lectures expansion worker.

Active backend workspace:

```text
C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin
```

Current known state:

```text
branch: main
local HEAD at runbook creation: 8d4d7cd
required baseline in history: 17880e0 Complete scalable Lectures backend and playback API
production lecture seed before expansion: 8 programs, 82 lessons
pending migration: supabase/migrations/20260712210000_lecture_expansion_worker.sql
```

Do not modify mobile code for this runbook. Do not touch playback, Home, Radio, TV, Podcasts, Audiobooks, MiniPlayer, Queue, PlayerContext, HiddenAudio, package versions, Expo, Metro, or Babel.

## 1. Prerequisites Checklist

Collect these before starting.

| Item | Placeholder | How to locate or verify |
| --- | --- | --- |
| Supabase project URL | `<SUPABASE_URL>` | Supabase Dashboard -> Project Settings -> API -> Project URL. Also check backend `.env.production` or `.env.local`. |
| Supabase project ref | `<PROJECT_REF>` | The host prefix in `https://<PROJECT_REF>.supabase.co`; also Supabase Dashboard URL. |
| Supabase database password | `<SUPABASE_DB_PASSWORD>` | Supabase Dashboard -> Project Settings -> Database -> Connection string/password. |
| Supabase service-role key | `<SUPABASE_SERVICE_ROLE_KEY>` | Supabase Dashboard -> Project Settings -> API -> service_role key. Secret. |
| Supabase access token | `<SUPABASE_ACCESS_TOKEN>` | Supabase account -> Access Tokens. Needed for Management API/CLI. Secret. |
| VPS host/IP | `<PRODUCTION_HOST>` | Hosting provider panel or existing SSH config. |
| SSH username | `<SSH_USER>` | Existing deployment notes or `whoami` after SSH. |
| VPS backend path | `<VPS_BACKEND_PATH>` | Usually `/var/www/hidden-tunes/hidden-tunes-backend/hidden-tunes-admin`; verify with `pwd` and `git rev-parse --show-toplevel`. |
| Production branch | `main` | Verify locally and on VPS with `git branch --show-current`. |
| Node version | record actual | Run `node --version` locally and on VPS. |
| Package manager | npm | `package-lock.json` exists; use `npm ci`. |
| Process manager | `<PROCESS_MANAGER>` | Discover with `pm2 list`, `systemctl`, and Docker commands below. |
| Backend service name | `<PM2_APP_NAME>` or `<SERVICE_NAME>` | Discover, do not assume. |
| Backend public URL | `https://admin.hiddentunes.com` | Verify with `curl -i https://admin.hiddentunes.com/api/lectures/categories`. |
| Scheduler method | systemd timer preferred, cron fallback | Discover with `systemctl list-timers --all` and `crontab -l`. |
| Existing env file location | `<ENV_FILE>` | Common: `<VPS_BACKEND_PATH>/.env.production`; verify with `ls -la .env*`. |
| DB backup method | Supabase managed backups and/or `pg_dump` | Check Supabase Dashboard -> Backups before activation. |

Local discovery commands:

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin
node --version
npm --version
git remote -v
git branch --show-current
git rev-parse HEAD
git log --oneline -10
```

VPS discovery commands:

```bash
ssh <SSH_USER>@<PRODUCTION_HOST>
hostname
whoami
node --version
npm --version
pwd
git remote -v
git branch --show-current
pm2 list
systemctl list-units --type=service
systemctl list-timers --all
crontab -l
docker ps
```

## 2. Local Safety Snapshot

Run before making any manual operational change:

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin

git status
git branch --show-current
git rev-parse HEAD
git log --oneline -10
git diff --stat
git diff --check
```

Save current uncommitted diffs without resetting anything:

```powershell
git diff > lectures-expansion-predeploy.patch
git diff --cached > lectures-expansion-predeploy-staged.patch
```

List untracked files without deleting them:

```powershell
git ls-files --others --exclude-standard
```

Do not run `git reset --hard`, `git clean -fd`, or `git checkout .`.

## 3. Full Supabase Migration

Run this in Supabase SQL Editor for project `<PROJECT_REF>`.

Migration file represented here:

```text
supabase/migrations/20260712210000_lecture_expansion_worker.sql
```

### Migration SQL

```sql
begin;

alter table public.lecture_sources add column if not exists terms_url text;
alter table public.lecture_sources add column if not exists robots_url text;
alter table public.lecture_sources add column if not exists legal_notes text;
alter table public.lecture_sources add column if not exists allowed_media_types text[] default '{}';
alter table public.lecture_sources add column if not exists requires_attribution boolean default true;
alter table public.lecture_sources add column if not exists commercial_use_allowed boolean default false;
alter table public.lecture_sources add column if not exists metadata_indexing_allowed boolean default false;
alter table public.lecture_sources add column if not exists direct_streaming_allowed boolean default false;
alter table public.lecture_sources add column if not exists importer_version text;

alter table public.lecture_items add column if not exists source_external_id text;
alter table public.lecture_items add column if not exists source_fingerprint text;
alter table public.lecture_items add column if not exists attribution text;
alter table public.lecture_items add column if not exists provenance jsonb default '{}'::jsonb;
alter table public.lecture_items add column if not exists importer_version text;
alter table public.lecture_items add column if not exists verification_state text default 'unchecked';
alter table public.lecture_items add column if not exists verified_media_count integer default 0;
alter table public.lecture_items add column if not exists quarantined_at timestamptz;
alter table public.lecture_items add column if not exists quarantine_reason text;

alter table public.lecture_files add column if not exists source_external_id text;
alter table public.lecture_files add column if not exists source_fingerprint text;
alter table public.lecture_files add column if not exists canonical_url text;
alter table public.lecture_files add column if not exists final_url text;
alter table public.lecture_files add column if not exists final_host text;
alter table public.lecture_files add column if not exists validation_state text default 'unchecked';
alter table public.lecture_files add column if not exists validated_at timestamptz;
alter table public.lecture_files add column if not exists validation_error text;
alter table public.lecture_files add column if not exists importer_version text;

alter table public.lecture_import_jobs add column if not exists source_key text;
alter table public.lecture_import_jobs add column if not exists checkpoint jsonb default '{}'::jsonb;
alter table public.lecture_import_jobs add column if not exists lease_expires_at timestamptz;
alter table public.lecture_import_jobs add column if not exists completed_programs integer default 0;
alter table public.lecture_import_jobs add column if not exists failed_programs integer default 0;
alter table public.lecture_import_jobs add column if not exists quarantined_programs integer default 0;
alter table public.lecture_import_jobs add column if not exists validation_failures integer default 0;
alter table public.lecture_import_jobs add column if not exists importer_version text;

create table if not exists public.lecture_expansion_quarantine (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lecture_sources(id) on delete set null,
  job_id uuid references public.lecture_import_jobs(id) on delete set null,
  source_key text,
  source_program_id text,
  source_lesson_id text,
  source_url text,
  reason_code text not null,
  reason text not null,
  retryable boolean default true,
  payload_summary jsonb default '{}'::jsonb,
  status text not null default 'open',
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_verification_history (
  id uuid primary key default gen_random_uuid(),
  lecture_item_id uuid references public.lecture_items(id) on delete cascade,
  lecture_file_id uuid references public.lecture_files(id) on delete cascade,
  job_id uuid references public.lecture_import_jobs(id) on delete set null,
  source_key text,
  source_url text,
  final_url text,
  final_host text,
  status text not null,
  http_status integer,
  mime_type text,
  content_length bigint,
  supports_ranges boolean,
  error_code text,
  error_message text,
  checked_at timestamptz default now(),
  importer_version text
);

alter table public.lecture_media_validations add column if not exists lecture_item_id uuid references public.lecture_items(id) on delete cascade;
alter table public.lecture_media_validations add column if not exists source_key text;
alter table public.lecture_media_validations add column if not exists source_url text;
alter table public.lecture_media_validations add column if not exists final_url text;
alter table public.lecture_media_validations add column if not exists final_host text;
alter table public.lecture_media_validations add column if not exists mime_type text;
alter table public.lecture_media_validations add column if not exists error_code text;
alter table public.lecture_media_validations add column if not exists importer_version text;

create index if not exists lecture_sources_legal_ready_idx
  on public.lecture_sources (is_enabled, rights_status, commercial_use_allowed, metadata_indexing_allowed, direct_streaming_allowed, priority);

create index if not exists lecture_items_expansion_public_idx
  on public.lecture_items (is_public, is_verified, verification_state, verified_media_count, status, source_type, source_external_id);

create unique index if not exists lecture_items_source_fingerprint_key
  on public.lecture_items (source_fingerprint)
  where source_fingerprint is not null;

create unique index if not exists lecture_files_source_fingerprint_key
  on public.lecture_files (source_fingerprint)
  where source_fingerprint is not null;

create index if not exists lecture_files_validation_state_idx
  on public.lecture_files (validation_state, validated_at, final_host);

create index if not exists lecture_import_jobs_expansion_claim_idx
  on public.lecture_import_jobs (status, lease_expires_at, next_run_at, priority, updated_at);

create index if not exists lecture_expansion_quarantine_status_idx
  on public.lecture_expansion_quarantine (status, retryable, next_retry_at, source_key, created_at);

create index if not exists lecture_verification_history_file_idx
  on public.lecture_verification_history (lecture_file_id, checked_at desc);

do $$
begin
  alter table public.lecture_expansion_quarantine
    add constraint lecture_expansion_quarantine_status_check
    check (status in ('open', 'retry_wait', 'resolved', 'ignored'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_items
    add constraint lecture_items_verification_state_check
    check (verification_state in ('unchecked', 'pending', 'verified', 'failed', 'quarantined'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_files
    add constraint lecture_files_validation_state_check
    check (validation_state in ('unchecked', 'pending', 'verified', 'failed', 'quarantined'));
exception
  when duplicate_object then null;
end $$;

create or replace function public.claim_lecture_import_job(
  worker_id text,
  stale_after interval default interval '5 minutes'
)
returns setof public.lecture_import_jobs
language sql
security definer
set search_path = public
as $$
  update public.lecture_import_jobs job
  set
    status = 'running',
    locked_by = worker_id,
    locked_at = now(),
    heartbeat_at = now(),
    lease_expires_at = now() + stale_after,
    started_at = coalesce(job.started_at, now()),
    attempt_count = job.attempt_count + 1,
    updated_at = now()
  where job.id = (
    select candidate.id
    from public.lecture_import_jobs candidate
    where (
        candidate.status = 'queued'
        or candidate.status = 'retry_wait'
        or (
          candidate.status = 'running'
          and (
            candidate.lease_expires_at < now()
            or candidate.locked_at < now() - stale_after
          )
        )
      )
      and coalesce(candidate.next_run_at, now()) <= now()
      and candidate.attempt_count < candidate.max_attempts
    order by candidate.priority asc, candidate.next_run_at asc nulls first, candidate.updated_at asc
    for update skip locked
    limit 1
  )
  returning job.*;
$$;

insert into public.lecture_sources (
  source_key,
  source_name,
  source_type,
  base_url,
  api_url,
  terms_url,
  robots_url,
  license_type,
  license_url,
  rights_status,
  rights_notes,
  legal_notes,
  attribution_template,
  default_language,
  allowed_media_types,
  requires_attribution,
  commercial_use_allowed,
  metadata_indexing_allowed,
  direct_streaming_allowed,
  is_enabled,
  priority,
  requests_per_minute,
  max_concurrency,
  importer_version
)
values (
  'internet_archive_public_domain',
  'Internet Archive public-domain education',
  'internet_archive',
  'https://archive.org',
  'https://archive.org/advancedsearch.php',
  'https://archive.org/about/terms.php',
  'https://archive.org/developers/bots.html',
  'public_domain',
  'https://creativecommons.org/publicdomain/mark/1.0/',
  'approved',
  'Only public-domain or public-domain-mark educational records are eligible for automatic publication. Non-public-domain, unclear-rights, restricted, or malformed records are quarantined.',
  'Internet Archive automated access requires bounded requests, descriptive client identity, retry-after handling, caching where possible, and respectful concurrency.',
  'Source: Internet Archive public-domain metadata.',
  'English',
  array['audio', 'video'],
  true,
  true,
  true,
  true,
  true,
  10,
  30,
  2,
  'lecture-expansion-v1'
)
on conflict (source_key) do update
set
  source_name = excluded.source_name,
  source_type = excluded.source_type,
  base_url = excluded.base_url,
  api_url = excluded.api_url,
  terms_url = excluded.terms_url,
  robots_url = excluded.robots_url,
  license_type = excluded.license_type,
  license_url = excluded.license_url,
  rights_status = excluded.rights_status,
  rights_notes = excluded.rights_notes,
  legal_notes = excluded.legal_notes,
  attribution_template = excluded.attribution_template,
  default_language = excluded.default_language,
  allowed_media_types = excluded.allowed_media_types,
  requires_attribution = excluded.requires_attribution,
  commercial_use_allowed = excluded.commercial_use_allowed,
  metadata_indexing_allowed = excluded.metadata_indexing_allowed,
  direct_streaming_allowed = excluded.direct_streaming_allowed,
  is_enabled = excluded.is_enabled,
  priority = excluded.priority,
  requests_per_minute = excluded.requests_per_minute,
  max_concurrency = excluded.max_concurrency,
  importer_version = excluded.importer_version,
  updated_at = now();

update public.lecture_import_jobs job
set
  source_key = coalesce(job.source_key, source.source_key),
  checkpoint = coalesce(job.checkpoint, '{}'::jsonb),
  importer_version = coalesce(job.importer_version, 'lecture-expansion-v1'),
  updated_at = now()
from public.lecture_sources source
where job.source_id = source.id
  and job.source_key is null;

grant select, insert, update, delete on public.lecture_expansion_quarantine to service_role;
grant select, insert, update, delete on public.lecture_verification_history to service_role;
grant execute on function public.claim_lecture_import_job(text, interval) to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
```

### PostgREST Reload

Run last if the migration did not already reload schema:

```sql
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
```

### Migration Verification SQL

Expected: `lecture_items` count remains at least `8`; `lecture_files` count remains at least `82`.

```sql
select count(*) as lecture_items_count from public.lecture_items;
select count(*) as lecture_files_count from public.lecture_files;
select count(*) as public_verified_playable
from public.lecture_items
where status = 'approved'
  and is_active is true
  and is_public is true
  and is_verified is true
  and playback_status = 'playable'
  and playable_status = 'playable'
  and is_mature is false;
```

Expected: these tables exist.

```sql
select to_regclass('public.lecture_expansion_quarantine') as quarantine_table;
select to_regclass('public.lecture_verification_history') as verification_history_table;
select to_regclass('public.lecture_import_jobs') as import_jobs_table;
select to_regclass('public.lecture_media_validations') as media_validations_table;
```

Expected: every column listed in the `in (...)` clauses appears.

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('lecture_sources', 'lecture_items', 'lecture_files', 'lecture_import_jobs', 'lecture_media_validations')
  and column_name in (
    'terms_url',
    'robots_url',
    'legal_notes',
    'allowed_media_types',
    'requires_attribution',
    'commercial_use_allowed',
    'metadata_indexing_allowed',
    'direct_streaming_allowed',
    'importer_version',
    'source_external_id',
    'source_fingerprint',
    'attribution',
    'provenance',
    'verification_state',
    'verified_media_count',
    'quarantined_at',
    'quarantine_reason',
    'canonical_url',
    'final_url',
    'final_host',
    'validation_state',
    'validated_at',
    'validation_error',
    'source_key',
    'checkpoint',
    'lease_expires_at',
    'completed_programs',
    'failed_programs',
    'quarantined_programs',
    'validation_failures',
    'lecture_item_id',
    'source_url',
    'mime_type',
    'error_code'
  )
order by table_name, column_name;
```

Expected indexes:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'lecture_sources_legal_ready_idx',
    'lecture_items_expansion_public_idx',
    'lecture_items_source_fingerprint_key',
    'lecture_files_source_fingerprint_key',
    'lecture_files_validation_state_idx',
    'lecture_import_jobs_expansion_claim_idx',
    'lecture_expansion_quarantine_status_idx',
    'lecture_verification_history_file_idx'
  )
order by indexname;
```

Expected constraints:

```sql
select conname, conrelid::regclass as table_name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'lecture_expansion_quarantine_status_check',
  'lecture_items_verification_state_check',
  'lecture_files_validation_state_check'
)
order by conname;
```

Expected claim function:

```sql
select proname, oid::regprocedure
from pg_proc
where proname = 'claim_lecture_import_job'
order by oid::regprocedure::text;
```

Expected source row:

```sql
select
  source_key,
  source_name,
  source_type,
  rights_status,
  license_type,
  license_url,
  terms_url,
  robots_url,
  commercial_use_allowed,
  metadata_indexing_allowed,
  direct_streaming_allowed,
  is_enabled,
  requests_per_minute,
  max_concurrency,
  importer_version
from public.lecture_sources
where source_key = 'internet_archive_public_domain';
```

Expected service-role access through PostgREST:

```powershell
$env:SUPABASE_URL="<SUPABASE_URL>"
$env:SUPABASE_SERVICE_ROLE_KEY="<SUPABASE_SERVICE_ROLE_KEY>"
$headers = @{ apikey=$env:SUPABASE_SERVICE_ROLE_KEY; Authorization="Bearer $env:SUPABASE_SERVICE_ROLE_KEY" }
Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri "$env:SUPABASE_URL/rest/v1/lecture_expansion_quarantine?select=id&limit=1"
Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri "$env:SUPABASE_URL/rest/v1/lecture_verification_history?select=id&limit=1"
```

Expected: HTTP `200`.

### Rollback Guidance

Safe before any worker data exists:

```sql
-- Only if no canary/import has run:
select count(*) from public.lecture_expansion_quarantine;
select count(*) from public.lecture_verification_history;
select count(*) from public.lecture_import_jobs where importer_version = 'lecture-expansion-v1' and status in ('running', 'queued', 'retry_wait');
```

If all counts are `0`, it is generally safe to disable the source and leave schema in place:

```sql
update public.lecture_sources
set is_enabled = false, updated_at = now()
where source_key = 'internet_archive_public_domain';
notify pgrst, 'reload schema';
```

After worker data exists, do not drop tables without a backup. Preserve:

```text
lecture_import_jobs
lecture_expansion_quarantine
lecture_verification_history
lecture_media_validations
lecture_items
lecture_files
lecture_sources
```

Do not use destructive `drop table` or broad deletes unless a database backup exists and the exact affected rows are reviewed.

## 4. Supabase Credential Setup Options

### Option A: Supabase SQL Editor

1. Open Supabase Dashboard.
2. Select project `<PROJECT_REF>`.
3. Go to SQL Editor.
4. Paste the migration SQL from section 3.
5. Run it.
6. Run the verification SQL from section 3.

### Option B: Supabase CLI

PowerShell:

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin
npx supabase --version
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

Required token: `<SUPABASE_ACCESS_TOKEN>`, from Supabase account settings -> Access Tokens.

### Option C: Direct PostgreSQL Connection

Do not put the password in shell history.

PowerShell:

```powershell
$env:PGPASSWORD="<SUPABASE_DB_PASSWORD>"
psql "host=db.<PROJECT_REF>.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" -f "supabase/migrations/20260712210000_lecture_expansion_worker.sql"
Remove-Item Env:\PGPASSWORD
```

Alternative URL format:

```text
postgresql://postgres:<SUPABASE_DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require
```

## 5. Required Environment Variables

Actual variables read by the current implementation:

| Name | Required | Default | Safe initial production value | Hard max | Secret | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPABASE_URL` | yes unless `NEXT_PUBLIC_SUPABASE_URL` set | none | `<SUPABASE_URL>` | n/a | no | `lib/supabaseAdmin.ts`, migration scripts |
| `NEXT_PUBLIC_SUPABASE_URL` | fallback | none | `<SUPABASE_URL>` | n/a | no | `lib/supabaseAdmin.ts` fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | none | `<SUPABASE_SERVICE_ROLE_KEY>` | n/a | yes | all DB worker scripts |
| `DATABASE_URL` | optional for migration automation | none | do not set unless using direct migration | n/a | yes | `scripts/apply-lecture-migration.mjs` |
| `SUPABASE_DB_URL` | optional fallback for migration automation | none | do not set unless using direct migration | n/a | yes | `scripts/apply-lecture-migration.mjs` |
| `SUPABASE_ACCESS_TOKEN` | optional for Management API migration | none | `<SUPABASE_ACCESS_TOKEN>` | n/a | yes | `scripts/apply-lecture-migration.mjs` |
| `LECTURE_EXPANSION_BATCH_SIZE` | optional | `20` | `5` canary | `100` | no | worker batch page size |
| `LECTURE_EXPANSION_SOURCE_CONCURRENCY` | optional | `2` | `1` canary | `3` | no | worker options |
| `LECTURE_EXPANSION_PROGRAM_CONCURRENCY` | optional | `4` | `1` canary | `6` | no | program processing |
| `LECTURE_EXPANSION_MEDIA_CONCURRENCY` | optional | `4` | `1` canary | `6` | no | media validation |
| `LECTURE_EXPANSION_REQUEST_TIMEOUT_MS` | optional | `15000` | `15000` | `30000` | no | fetch/probe timeout |
| `LECTURE_EXPANSION_JOB_LEASE_SECONDS` | optional | `300` | `300` | `900` | no | DB lease duration |
| `LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN` | optional | `100` | `10` canary | `500` | no | max processed per run |
| `LECTURE_EXPANSION_TARGET_PROGRAMS` | optional | `200000` | `200000` | `200000` | no | target stop |
| `LECTURE_EXPANSION_DRY_RUN` | optional | false | unset for real worker | n/a | no | dry-run safety |
| `LECTURE_EXPANSION_WORKER_ID` | optional | random UUID worker id | `hidden-tunes-lectures-vps-1` | n/a | no | DB claim ownership |
| `LECTURE_EXPANSION_USER_AGENT` | optional | Hidden Tunes default | include admin contact URL/email | n/a | no | Internet Archive requests |
| `LECTURE_EXPANSION_CRON_SECRET` | optional runbook-only | none | `<CRON_SECRET>` | n/a | yes | cron wrapper guard, not read by worker code |
| `LECTURE_VERIFY_BASE_URL` | optional | `https://admin.hiddentunes.com` | `https://admin.hiddentunes.com` | n/a | no | `scripts/verify-lecture-production.ts` |
| `NEXT_PUBLIC_ADMIN_BASE_URL` | optional fallback | none | `https://admin.hiddentunes.com` | n/a | no | verification scripts |

`.env.local` example for local read-only checks:

```text
SUPABASE_URL=<SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
LECTURE_VERIFY_BASE_URL=https://admin.hiddentunes.com
LECTURE_EXPANSION_BATCH_SIZE=5
LECTURE_EXPANSION_PROGRAM_CONCURRENCY=1
LECTURE_EXPANSION_MEDIA_CONCURRENCY=1
LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN=10
LECTURE_EXPANSION_REQUEST_TIMEOUT_MS=15000
LECTURE_EXPANSION_JOB_LEASE_SECONDS=300
LECTURE_EXPANSION_WORKER_ID=hidden-tunes-lectures-local
LECTURE_EXPANSION_USER_AGENT=HiddenTunesLecturesExpansion/1.0 (+https://admin.hiddentunes.com)
```

`.env.production` canary example on VPS:

```text
SUPABASE_URL=<SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
LECTURE_VERIFY_BASE_URL=https://admin.hiddentunes.com
LECTURE_EXPANSION_BATCH_SIZE=5
LECTURE_EXPANSION_SOURCE_CONCURRENCY=1
LECTURE_EXPANSION_PROGRAM_CONCURRENCY=1
LECTURE_EXPANSION_MEDIA_CONCURRENCY=1
LECTURE_EXPANSION_REQUEST_TIMEOUT_MS=15000
LECTURE_EXPANSION_JOB_LEASE_SECONDS=300
LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN=10
LECTURE_EXPANSION_TARGET_PROGRAMS=200000
LECTURE_EXPANSION_WORKER_ID=hidden-tunes-lectures-vps-1
LECTURE_EXPANSION_USER_AGENT=HiddenTunesLecturesExpansion/1.0 (+https://admin.hiddentunes.com)
```

PM2 ecosystem env example:

```js
module.exports = {
  apps: [
    {
      name: "<PM2_APP_NAME>",
      cwd: "<VPS_BACKEND_PATH>",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        SUPABASE_URL: "<SUPABASE_URL>",
        NEXT_PUBLIC_SUPABASE_URL: "<SUPABASE_URL>",
        SUPABASE_SERVICE_ROLE_KEY: "<SUPABASE_SERVICE_ROLE_KEY>",
        LECTURE_EXPANSION_BATCH_SIZE: "5",
        LECTURE_EXPANSION_PROGRAM_CONCURRENCY: "1",
        LECTURE_EXPANSION_MEDIA_CONCURRENCY: "1",
        LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN: "10"
      }
    }
  ]
};
```

systemd EnvironmentFile:

```text
SUPABASE_URL=<SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
LECTURE_EXPANSION_BATCH_SIZE=5
LECTURE_EXPANSION_PROGRAM_CONCURRENCY=1
LECTURE_EXPANSION_MEDIA_CONCURRENCY=1
LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN=10
LECTURE_EXPANSION_WORKER_ID=hidden-tunes-lectures-vps-1
```

Cron wrapper env is shown in section 12.

Stable bounded settings after multiple successful canaries:

```text
LECTURE_EXPANSION_BATCH_SIZE=20
LECTURE_EXPANSION_PROGRAM_CONCURRENCY=2
LECTURE_EXPANSION_MEDIA_CONCURRENCY=2
LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN=50
LECTURE_EXPANSION_REQUEST_TIMEOUT_MS=15000
LECTURE_EXPANSION_JOB_LEASE_SECONDS=300
```

## 6. Local Validation Commands

Actual package scripts:

```text
typecheck: npm.cmd run typecheck
build: npm.cmd run build
```

Install dependencies:

```powershell
cd C:\Users\Wills\Desktop\HiddenTunes\hidden-tunes-backend\hidden-tunes-admin
npm ci
```

Focused no-write tests:

```powershell
npx.cmd tsx scripts/test-lecture-expansion-foundation.ts
git diff --check -- lib\lectureExpansion.ts scripts\apply-lecture-migration.mjs scripts\run-lecture-import-worker.ts scripts\lecture-expand-enqueue.ts scripts\lecture-expand-retry.ts scripts\lecture-expand-reverify.ts scripts\test-lecture-expansion-foundation.ts supabase\migrations\20260712210000_lecture_expansion_worker.sql LECTURES_EXPANSION_MANUAL_RUNBOOK.md
```

TypeScript:

```powershell
npx.cmd tsc --noEmit
```

Known current blocker at runbook creation: repo-wide typecheck fails in unrelated Motivationals files:

```text
lib/motivationBatchImport.ts
scripts/audit-public-motivationals.ts
```

Build:

```powershell
npm.cmd run build
```

### No-Write Dry Run

Requires `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and network access.

This writes no database rows:

```powershell
npx.cmd tsx scripts/run-lecture-import-worker.ts --dry-run --source internet_archive_public_domain --max-programs=1 --batch-size=1 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000
```

Expected safe result:

```text
"success": true
"dry_run": true
"inserted": 0
"updated": 0
"published": 0
```

Failure indicators:

```text
source not found
rights rejected for all candidates
mediaValidated = 0 and mediaFailed > 0
Supabase 404 for worker tables after migration
```

### Database-Write Canary Commands

Do not run until migration and deployment are complete.

Enqueue a paused canary job:

```powershell
npx.cmd tsx scripts/lecture-expand-enqueue.ts --source internet_archive_public_domain --target-programs=5 --batch-size=5 --priority=5
```

Enqueue an active canary job:

```powershell
npx.cmd tsx scripts/lecture-expand-enqueue.ts --source internet_archive_public_domain --target-programs=5 --batch-size=5 --priority=5 --activate
```

Run worker without publishing:

```powershell
npx.cmd tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000 --validate-media
```

Run worker with publishing after verification:

```powershell
npx.cmd tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000 --validate-media --publish-valid
```

Status:

```powershell
npx.cmd tsx scripts/lecture-import-status.ts
```

Retry quarantine:

```powershell
npx.cmd tsx scripts/lecture-expand-retry.ts --limit=25
```

Revalidation candidate report:

```powershell
npx.cmd tsx scripts/lecture-expand-reverify.ts --limit=50
```

Interruption/resume simulation:

1. Enqueue active canary with `--target-programs=5`.
2. Run worker with `--max-programs=1 --batch-size=1 --publish-valid`.
3. Run status.
4. Run worker again with same flags.
5. Verify no duplicate source keys with SQL in section 11.

Idempotent second run:

```powershell
npx.cmd tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --validate-media --publish-valid
```

Expected: previously imported source keys are updated, not duplicated.

## 7. Git Commit and Push

Before staging:

```powershell
git status
git diff --stat
git diff --check
git diff --name-only
git diff --name-only | Select-String -Pattern "hidden-tunes-app|PlayerContext|HiddenAudio|MiniPlayer|Queue|app/music-feed|package.json|package-lock.json|babel.config"
```

Expected: no protected mobile/playback/package files in the Lectures commit.

Stage exact files only:

```powershell
git add lib/lectureExpansion.ts
git add scripts/apply-lecture-migration.mjs
git add scripts/run-lecture-import-worker.ts
git add scripts/lecture-expand-enqueue.ts
git add scripts/lecture-expand-retry.ts
git add scripts/lecture-expand-reverify.ts
git add scripts/test-lecture-expansion-foundation.ts
git add supabase/migrations/20260712210000_lecture_expansion_worker.sql
git add LECTURES_EXPANSION_MANUAL_RUNBOOK.md
```

Commit and push:

```powershell
git status
git commit -m "Add resumable Lectures expansion worker"
git push origin main
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
```

Do not use `git add .` unless a fresh `git status --short` proves the repository has only the intended files.

## 8. VPS Deployment

Connect:

```bash
ssh <SSH_USER>@<PRODUCTION_HOST>
```

Enter backend:

```bash
cd <VPS_BACKEND_PATH>
pwd
git status
git branch --show-current
git rev-parse HEAD
git remote -v
```

If production contains uncommitted files, stop and record:

```bash
git diff --stat
git diff > lectures-vps-before-deploy.patch
git diff --cached > lectures-vps-before-deploy-staged.patch
git ls-files --others --exclude-standard > lectures-vps-untracked.txt
```

Back up env/config/process state:

```bash
date -u +"%Y-%m-%dT%H:%M:%SZ" > lectures-deploy-timestamp.txt
git rev-parse HEAD > lectures-vps-previous-commit.txt
mkdir -p ~/hidden-tunes-lectures-backups
cp -a .env .env.local .env.production ~/hidden-tunes-lectures-backups/ 2>/dev/null || true
pm2 save
pm2 list > ~/hidden-tunes-lectures-backups/pm2-list-before.txt 2>/dev/null || true
crontab -l > ~/hidden-tunes-lectures-backups/crontab-before.txt 2>/dev/null || true
systemctl list-timers --all > ~/hidden-tunes-lectures-backups/systemd-timers-before.txt 2>/dev/null || true
```

Deploy:

```bash
git fetch origin
git log -1 --oneline origin/main
git pull --ff-only origin main
git rev-parse HEAD
npm ci
npm run typecheck
npm run build
```

If `npm run typecheck` fails only with the known unrelated Motivationals errors, do not restart until you explicitly accept that known baseline. If new Lectures errors appear, stop.

## 9. Process Manager Discovery and Restart

Discovery:

```bash
pm2 list
pm2 describe <PM2_APP_NAME>
systemctl list-units --type=service | grep -i hidden
systemctl status <SERVICE_NAME>
ps aux | grep -i hidden-tunes
docker ps
```

Restart only the confirmed backend service serving `admin.hiddentunes.com`.

### PM2

```bash
pm2 restart <PM2_APP_NAME> --update-env
pm2 save
pm2 status
pm2 logs <PM2_APP_NAME> --lines 100
```

### systemd

```bash
sudo systemctl daemon-reload
sudo systemctl restart <SERVICE_NAME>
sudo systemctl status <SERVICE_NAME> --no-pager
sudo journalctl -u <SERVICE_NAME> -n 100 --no-pager
```

### Docker

Discovery:

```bash
docker ps
docker compose ps
docker inspect <CONTAINER_NAME>
```

Restart only confirmed backend:

```bash
docker compose restart <SERVICE_NAME>
docker logs --tail 100 <CONTAINER_NAME>
```

## 10. Production Schema and API Verification

HTTP checks:

```bash
curl -sS -i "https://admin.hiddentunes.com/api/lectures/categories"
curl -sS -i "https://admin.hiddentunes.com/api/lectures/category/academic-lectures?page=1&limit=3"
curl -sS -i "https://admin.hiddentunes.com/api/lectures/search?q=history&page=1&limit=3"
```

Expected: HTTP `200`.

Find a program id:

```bash
curl -sS "https://admin.hiddentunes.com/api/lectures/category/academic-lectures?page=1&limit=1" | jq -r '.lectures[0].id'
```

Detail:

```bash
PROGRAM_ID="<PROGRAM_ID_FROM_PREVIOUS_COMMAND>"
curl -sS -i "https://admin.hiddentunes.com/api/lectures/items/${PROGRAM_ID}?page=1&limit=3"
```

Tap-only play:

```bash
curl -sS -i "https://admin.hiddentunes.com/api/lectures/items/${PROGRAM_ID}/play"
```

Forbidden browse/search field check:

```bash
curl -sS "https://admin.hiddentunes.com/api/lectures/search?q=history&page=1&limit=3" | jq '.. | objects | keys[]?' | grep -E 'audio_url|video_url|stream_url|playback_url|signed_url|final_url|canonical_url' && echo "FAILED: forbidden field found" || echo "OK: metadata-only"
curl -sS "https://admin.hiddentunes.com/api/lectures/category/academic-lectures?page=1&limit=3" | jq '.. | objects | keys[]?' | grep -E 'audio_url|video_url|stream_url|playback_url|signed_url|final_url|canonical_url' && echo "FAILED: forbidden field found" || echo "OK: metadata-only"
```

Expected: `OK: metadata-only`.

Production script:

```bash
npx tsx scripts/verify-lecture-production.ts
```

## 11. Production Canary

Initial dry-run, no writes:

```bash
cd <VPS_BACKEND_PATH>
npx tsx scripts/run-lecture-import-worker.ts --dry-run --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000
```

Expected:

```text
"dry_run": true
"inserted": 0
"published": 0
```

Enqueue active canary:

```bash
npx tsx scripts/lecture-expand-enqueue.ts --source internet_archive_public_domain --target-programs=5 --batch-size=5 --priority=5 --activate
```

Status:

```bash
npx tsx scripts/lecture-import-status.ts
```

Worker without publication:

```bash
npx tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000 --validate-media
```

Worker with publication:

```bash
npx tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000 --validate-media --publish-valid
```

Database verification SQL:

```sql
select status, count(*) from public.lecture_import_jobs group by status order by status;
select status, count(*) from public.lecture_expansion_quarantine group by status order by status;
select count(*) from public.lecture_verification_history;
select count(*) from public.lecture_items where importer_version = 'lecture-expansion-v1';
select count(*) from public.lecture_files where importer_version = 'lecture-expansion-v1';
select source_key, count(*) from public.lecture_items where source_key is not null group by source_key having count(*) > 1;
select source_key, count(*) from public.lecture_files where source_key is not null group by source_key having count(*) > 1;
select id, job_key, status, cursor, checkpoint, completed_programs, failed_programs, quarantined_programs
from public.lecture_import_jobs
where importer_version = 'lecture-expansion-v1'
order by updated_at desc
limit 5;
```

Second idempotent run:

```bash
npx tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=5 --batch-size=5 --max-pages=1 --program-concurrency=1 --media-concurrency=1 --request-timeout-ms=15000 --validate-media --publish-valid
```

Expected: duplicate SQL returns no rows; source keys remain unique.

API browse and playback checks: use section 10.

## 12. Scheduler Installation

Do not enable the scheduler before the canary succeeds.

### Preferred systemd timer

Create environment file:

```bash
sudo tee /etc/hidden-tunes-lecture-expansion.env >/dev/null <<'EOF'
SUPABASE_URL=<SUPABASE_URL>
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_URL>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
LECTURE_EXPANSION_BATCH_SIZE=20
LECTURE_EXPANSION_PROGRAM_CONCURRENCY=2
LECTURE_EXPANSION_MEDIA_CONCURRENCY=2
LECTURE_EXPANSION_MAX_PROGRAMS_PER_RUN=50
LECTURE_EXPANSION_REQUEST_TIMEOUT_MS=15000
LECTURE_EXPANSION_JOB_LEASE_SECONDS=300
LECTURE_EXPANSION_WORKER_ID=hidden-tunes-lectures-vps-1
LECTURE_EXPANSION_USER_AGENT=HiddenTunesLecturesExpansion/1.0 (+https://admin.hiddentunes.com)
EOF
sudo chmod 600 /etc/hidden-tunes-lecture-expansion.env
```

Service:

```bash
sudo tee /etc/systemd/system/hidden-tunes-lecture-expansion.service >/dev/null <<'EOF'
[Unit]
Description=Hidden Tunes Lectures expansion bounded worker
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=<VPS_BACKEND_PATH>
EnvironmentFile=/etc/hidden-tunes-lecture-expansion.env
ExecStart=/usr/bin/flock -n /tmp/hidden-tunes-lecture-expansion.lock /usr/bin/env npx tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=50 --batch-size=20 --max-pages=1 --program-concurrency=2 --media-concurrency=2 --request-timeout-ms=15000 --validate-media --publish-valid
TimeoutStartSec=1800
Nice=5
IOSchedulingClass=best-effort
IOSchedulingPriority=6

[Install]
WantedBy=multi-user.target
EOF
```

Timer:

```bash
sudo tee /etc/systemd/system/hidden-tunes-lecture-expansion.timer >/dev/null <<'EOF'
[Unit]
Description=Run Hidden Tunes Lectures expansion worker every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
AccuracySec=1min
Persistent=false
Unit=hidden-tunes-lecture-expansion.service

[Install]
WantedBy=timers.target
EOF
```

Install but start manually only after canary:

```bash
sudo systemctl daemon-reload
sudo systemctl enable hidden-tunes-lecture-expansion.timer
sudo systemctl list-timers --all | grep hidden-tunes-lecture
sudo systemctl start hidden-tunes-lecture-expansion.service
sudo journalctl -u hidden-tunes-lecture-expansion.service -n 100 --no-pager
sudo systemctl start hidden-tunes-lecture-expansion.timer
```

Disable/pause:

```bash
sudo systemctl stop hidden-tunes-lecture-expansion.timer
sudo systemctl disable hidden-tunes-lecture-expansion.timer
sudo systemctl stop hidden-tunes-lecture-expansion.service
```

### Cron fallback

Wrapper:

```bash
sudo tee /usr/local/bin/hidden-tunes-lecture-expansion.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
LOCK=/tmp/hidden-tunes-lecture-expansion.lock
LOG=/var/log/hidden-tunes-lecture-expansion.log
cd <VPS_BACKEND_PATH>
set -a
source <ENV_FILE>
set +a
exec flock -n "$LOCK" npx tsx scripts/run-lecture-import-worker.ts --source internet_archive_public_domain --max-programs=50 --batch-size=20 --max-pages=1 --program-concurrency=2 --media-concurrency=2 --request-timeout-ms=15000 --validate-media --publish-valid >> "$LOG" 2>&1
EOF
sudo chmod 750 /usr/local/bin/hidden-tunes-lecture-expansion.sh
```

Cron entries:

```bash
crontab -e
```

Paste after canary succeeds:

```cron
*/15 * * * * /usr/local/bin/hidden-tunes-lecture-expansion.sh
5 * * * * cd <VPS_BACKEND_PATH> && . <ENV_FILE> && npx tsx scripts/lecture-expand-enqueue.ts --source internet_archive_public_domain --target-programs=50 --batch-size=20 --priority=10 --activate >> /var/log/hidden-tunes-lecture-enqueue.log 2>&1
20 * * * * cd <VPS_BACKEND_PATH> && . <ENV_FILE> && npx tsx scripts/lecture-expand-retry.ts --limit=25 >> /var/log/hidden-tunes-lecture-retry.log 2>&1
30 2 * * * cd <VPS_BACKEND_PATH> && . <ENV_FILE> && npx tsx scripts/lecture-expand-reverify.ts --limit=50 >> /var/log/hidden-tunes-lecture-reverify.log 2>&1
*/30 * * * * cd <VPS_BACKEND_PATH> && . <ENV_FILE> && npx tsx scripts/lecture-import-status.ts >> /var/log/hidden-tunes-lecture-status.log 2>&1
```

Disable cron:

```bash
crontab -l > ~/hidden-tunes-cron-before-disable.txt
crontab -l | grep -v 'hidden-tunes-lecture' | crontab -
```

## 13. Expansion Controls

Verified-public count:

```sql
select count(*) from public.lecture_items
where status = 'approved'
  and is_active is true
  and is_public is true
  and is_verified is true
  and playback_status = 'playable'
  and playable_status = 'playable'
  and is_mature is false;
```

Pending/running/expired jobs:

```sql
select status, count(*) from public.lecture_import_jobs group by status;
select id, job_key, status, locked_by, locked_at, lease_expires_at, heartbeat_at
from public.lecture_import_jobs
where status = 'running'
order by updated_at desc;
select id, job_key, locked_by, lease_expires_at
from public.lecture_import_jobs
where status = 'running'
  and lease_expires_at < now();
```

Quarantine:

```sql
select status, reason_code, count(*)
from public.lecture_expansion_quarantine
group by status, reason_code
order by count(*) desc;
```

Source health:

```sql
select source_key, is_enabled, rights_status, last_success_at, last_failure_at, consecutive_failures
from public.lecture_sources
where source_key = 'internet_archive_public_domain';
```

Remaining capacity:

```sql
select 200000 - count(*) as remaining
from public.lecture_items
where status = 'approved'
  and is_active is true
  and is_public is true
  and is_verified is true
  and playback_status = 'playable'
  and playable_status = 'playable'
  and is_mature is false;
```

Pause new enqueueing and disable source without deleting data:

```sql
update public.lecture_sources
set is_enabled = false, updated_at = now()
where source_key = 'internet_archive_public_domain';

update public.lecture_import_jobs
set status = 'paused', updated_at = now()
where source_key = 'internet_archive_public_domain'
  and status in ('queued', 'retry_wait');
```

Clear only an expired lease:

```sql
update public.lecture_import_jobs
set status = 'retry_wait',
    locked_by = null,
    locked_at = null,
    lease_expires_at = null,
    heartbeat_at = null,
    next_run_at = now(),
    updated_at = now()
where status = 'running'
  and lease_expires_at < now()
returning id, job_key, status;
```

Reduce concurrency:

```bash
sudo sed -i 's/LECTURE_EXPANSION_PROGRAM_CONCURRENCY=.*/LECTURE_EXPANSION_PROGRAM_CONCURRENCY=1/' /etc/hidden-tunes-lecture-expansion.env
sudo sed -i 's/LECTURE_EXPANSION_MEDIA_CONCURRENCY=.*/LECTURE_EXPANSION_MEDIA_CONCURRENCY=1/' /etc/hidden-tunes-lecture-expansion.env
sudo systemctl restart hidden-tunes-lecture-expansion.timer
```

## 14. Monitoring and Logs

Systemd:

```bash
journalctl -u hidden-tunes-lecture-expansion.service -n 200 --no-pager
journalctl -u hidden-tunes-lecture-expansion.service --since "1 hour ago" --no-pager
journalctl -u hidden-tunes-lecture-expansion.service --since "1 hour ago" --no-pager | grep -Ei '429|timeout|quarantine|ssrf|private|failed|error|lease|mime'
```

PM2:

```bash
pm2 logs <PM2_APP_NAME> --lines 200
pm2 logs <PM2_APP_NAME> --lines 200 | grep -Ei 'lecture|429|timeout|quarantine|ssrf|mime|database|error'
```

Files:

```bash
tail -n 200 /var/log/hidden-tunes-lecture-expansion.log
grep -Ei '429|timeout|quarantine|ssrf|mime|database|error|lease' /var/log/hidden-tunes-lecture-expansion.log | tail -n 100
```

Pause thresholds:

```text
HTTP 429 repeatedly for more than 10 minutes
quarantine > 50% of candidates in a run
media validation failure > 70% for two runs
any SSRF/private-network rejection spike
same job lease expires repeatedly
worker crashes twice in one hour
public API exposes playable URLs in browse/search
existing 8/82 seed disappears or public count drops unexpectedly
```

## 15. Database Backup and Recovery

Supabase dashboard:

1. Open Supabase Dashboard -> Project `<PROJECT_REF>`.
2. Go to Backups.
3. Confirm a recent backup exists.
4. Record backup timestamp before activation.

Full pg_dump:

```bash
export PGPASSWORD='<SUPABASE_DB_PASSWORD>'
pg_dump "host=db.<PROJECT_REF>.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" -Fc -f hidden-tunes-before-lecture-expansion.dump
unset PGPASSWORD
```

Schema-only:

```bash
export PGPASSWORD='<SUPABASE_DB_PASSWORD>'
pg_dump "host=db.<PROJECT_REF>.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" --schema-only -f hidden-tunes-schema-before-lecture-expansion.sql
unset PGPASSWORD
```

Lecture-related data:

```bash
export PGPASSWORD='<SUPABASE_DB_PASSWORD>'
pg_dump "host=db.<PROJECT_REF>.supabase.co port=5432 dbname=postgres user=postgres sslmode=require" -t public.lecture_items -t public.lecture_files -t public.lecture_sources -t public.lecture_import_jobs -t public.lecture_expansion_quarantine -t public.lecture_verification_history -f hidden-tunes-lectures-before-expansion.sql
unset PGPASSWORD
```

Do not restore over production without a confirmed backup and maintenance window.

Disable expansion without deleting data:

```sql
update public.lecture_sources
set is_enabled = false, updated_at = now()
where source_key = 'internet_archive_public_domain';

update public.lecture_import_jobs
set status = 'paused', updated_at = now()
where source_key = 'internet_archive_public_domain'
  and status in ('queued', 'retry_wait', 'running');
```

## 16. Emergency Stop

Systemd:

```bash
sudo systemctl stop hidden-tunes-lecture-expansion.timer
sudo systemctl disable hidden-tunes-lecture-expansion.timer
sudo systemctl stop hidden-tunes-lecture-expansion.service
sudo journalctl -u hidden-tunes-lecture-expansion.service -n 300 --no-pager > ~/hidden-tunes-lecture-emergency-logs.txt
```

Cron:

```bash
crontab -l > ~/hidden-tunes-cron-emergency-before.txt
crontab -l | grep -v 'hidden-tunes-lecture' | crontab -
tail -n 300 /var/log/hidden-tunes-lecture-expansion.log > ~/hidden-tunes-lecture-emergency-logs.txt
```

Database stop:

```sql
update public.lecture_sources
set is_enabled = false, updated_at = now()
where source_key = 'internet_archive_public_domain';

update public.lecture_import_jobs
set status = 'paused',
    locked_by = null,
    locked_at = null,
    lease_expires_at = null,
    heartbeat_at = null,
    updated_at = now()
where source_key = 'internet_archive_public_domain'
  and status in ('queued', 'retry_wait', 'running');
```

Verify APIs still work:

```bash
curl -sS -i "https://admin.hiddentunes.com/api/lectures/categories"
curl -sS -i "https://admin.hiddentunes.com/api/lectures/category/academic-lectures?page=1&limit=3"
curl -sS -i "https://admin.hiddentunes.com/api/lectures/search?q=history&page=1&limit=3"
```

## 17. Final Stable Expansion Settings

Canary settings:

```text
batch size: 5
program concurrency: 1
media concurrency: 1
max programs per run: 5-10
cadence: manual only
maximum per hour: manual
maximum per day: manual
```

Stable bounded settings:

```text
batch size: 20
program concurrency: 2
media concurrency: 2
max programs per run: 50
cadence: every 15 minutes
maximum per worker run: 50
maximum per hour: 200
maximum per day: 4800
```

The worker exits after each run. Do not configure an infinite foreground process.

## 18. Automatic Target Stop Verification

Production target SQL:

```sql
select count(*) as verified_public_programs
from public.lecture_items
where status = 'approved'
  and is_active is true
  and is_public is true
  and is_verified is true
  and playback_status = 'playable'
  and playable_status = 'playable'
  and is_mature is false;
```

Dry-run lower target test in non-production only:

```powershell
$env:LECTURE_EXPANSION_TARGET_PROGRAMS="8"
npx.cmd tsx scripts/run-lecture-import-worker.ts --dry-run --source internet_archive_public_domain --max-programs=1 --batch-size=1
Remove-Item Env:\LECTURE_EXPANSION_TARGET_PROGRAMS
```

Expected if current verified-public count is at least `8`:

```text
"target_reached": true
"action": "target reached; discovery not started"
```

Maintenance after target:

```bash
npx tsx scripts/lecture-expand-reverify.ts --limit=50
npx tsx scripts/lecture-expand-retry.ts --limit=25
```

These commands do not enqueue new expansion work.

## 19. Final End-to-End Checklist

- [ ] Prerequisites collected.
- [ ] Local safety snapshot saved.
- [ ] Migration applied.
- [ ] Schema verified.
- [ ] Environment configured.
- [ ] Local focused test passed.
- [ ] TypeScript result reviewed.
- [ ] Build passed.
- [ ] Commit created.
- [ ] Push completed.
- [ ] VPS updated.
- [ ] Backend restarted.
- [ ] Existing 8/82 baseline preserved.
- [ ] Dry run passed.
- [ ] Production canary passed.
- [ ] Second canary idempotent.
- [ ] Playback resolver verified after tap only.
- [ ] Metadata-only browse verified.
- [ ] Metadata-only search verified.
- [ ] Quarantine verified.
- [ ] Scheduler installed.
- [ ] Scheduler enabled after canary.
- [ ] Automatic stop verified.
- [ ] Monitoring commands tested.
- [ ] Emergency stop tested.
- [ ] Final Git status clean for committed Lectures work.

