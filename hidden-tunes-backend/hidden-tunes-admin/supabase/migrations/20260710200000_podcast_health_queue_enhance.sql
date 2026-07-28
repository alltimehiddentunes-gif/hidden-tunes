-- Podcast health queue enhancements for Phase B verification pipeline.

begin;

alter table if exists public.podcast_health_queue
  add column if not exists catalog text not null default 'general',
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists worker_id text;

alter table if exists public.podcast_health_queue
  drop constraint if exists podcast_health_queue_catalog_check;

alter table if exists public.podcast_health_queue
  add constraint podcast_health_queue_catalog_check check (
    catalog in ('general', 'mature')
  );

create index if not exists podcast_health_queue_catalog_status_idx
  on public.podcast_health_queue (catalog, status, scheduled_at);

create index if not exists podcast_health_queue_running_started_idx
  on public.podcast_health_queue (status, started_at)
  where status = 'running';

notify pgrst, 'reload schema';

commit;
