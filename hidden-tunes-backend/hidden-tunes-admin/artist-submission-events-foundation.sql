-- Hidden Tunes artist submission audit trail foundation
-- Safe additive history table for artist submission review events.
--
-- Safety rules:
-- - Creates a new table only.
-- - Does not modify songs, albums, upload-track, R2, or playback.
-- - Does not publish submissions into the public catalog.
-- - Can be re-run safely.

create table if not exists public.artist_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.artist_submissions(id) on delete cascade,
  actor_user_id uuid references public.uploader_profiles(id) on delete set null,
  actor_role text,
  event_type text not null,
  previous_status text,
  new_status text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists artist_submission_events_submission_id_idx
  on public.artist_submission_events (submission_id);

create index if not exists artist_submission_events_created_at_idx
  on public.artist_submission_events (created_at desc);

create index if not exists artist_submission_events_actor_user_id_idx
  on public.artist_submission_events (actor_user_id);
