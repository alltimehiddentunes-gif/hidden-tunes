-- Hidden Tunes artist submissions foundation
-- Safe additive scaffold for future artist-submitted releases.
--
-- Safety rules:
-- - Creates a new table only.
-- - Does not modify songs, albums, artists, upload-track, R2, or playback.
-- - Does not publish submissions into the public catalog.
-- - Keeps admin/owner final authority for approval and future publishing.
-- - Can be re-run safely.

create table if not exists public.artist_submissions (
  id uuid primary key default gen_random_uuid(),
  artist_user_id uuid references public.uploader_profiles(id) on delete set null,
  title text not null,
  artist_name text not null,
  status text not null default 'draft',
  admin_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.uploader_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_submissions_status_check check (
    status in (
      'draft',
      'pending_review',
      'needs_changes',
      'approved',
      'rejected'
    )
  )
);

create index if not exists artist_submissions_artist_user_id_idx
  on public.artist_submissions (artist_user_id);

create index if not exists artist_submissions_status_idx
  on public.artist_submissions (status);

create index if not exists artist_submissions_submitted_at_idx
  on public.artist_submissions (submitted_at desc);

create index if not exists artist_submissions_reviewed_by_user_id_idx
  on public.artist_submissions (reviewed_by_user_id);

create or replace function public.set_artist_submissions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists artist_submissions_set_updated_at on public.artist_submissions;

create trigger artist_submissions_set_updated_at
before update on public.artist_submissions
for each row
execute function public.set_artist_submissions_updated_at();
