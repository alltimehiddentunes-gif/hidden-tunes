-- Hidden Tunes Verified Live Concerts — user-state tables.
-- Additive only. Follows Sports user-ownership RLS (auth.uid() = user_id).
-- No FKs into TV / Sports / Motivation / Lectures.
-- Safe to run multiple times. No seed records.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- saved_concerts
-- ---------------------------------------------------------------------------

create table if not exists public.saved_concerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint saved_concerts_user_item_unique unique (user_id, concert_item_id)
);

create index if not exists saved_concerts_user_created_idx
  on public.saved_concerts (user_id, created_at desc);

create index if not exists saved_concerts_item_idx
  on public.saved_concerts (concert_item_id);

-- ---------------------------------------------------------------------------
-- concert_reminders
-- ---------------------------------------------------------------------------

create table if not exists public.concert_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  remind_at timestamptz not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_reminders_user_item_unique unique (user_id, concert_item_id),
  constraint concert_reminders_status_check check (
    status in ('scheduled', 'sent', 'cancelled', 'failed')
  )
);

create index if not exists concert_reminders_user_remind_idx
  on public.concert_reminders (user_id, remind_at);

create index if not exists concert_reminders_due_idx
  on public.concert_reminders (remind_at, status)
  where status = 'scheduled';

-- ---------------------------------------------------------------------------
-- recently_watched_concerts
-- ---------------------------------------------------------------------------

create table if not exists public.recently_watched_concerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concert_item_id uuid not null references public.concert_items(id) on delete cascade,
  concert_stream_id uuid references public.concert_streams(id) on delete set null,
  position_ms integer not null default 0,
  duration_ms integer,
  completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recently_watched_concerts_user_item_unique unique (user_id, concert_item_id),
  constraint recently_watched_concerts_position_check check (position_ms >= 0),
  constraint recently_watched_concerts_duration_check check (
    duration_ms is null or duration_ms >= 0
  )
);

create index if not exists recently_watched_concerts_user_watched_idx
  on public.recently_watched_concerts (user_id, last_watched_at desc);

create index if not exists recently_watched_concerts_item_idx
  on public.recently_watched_concerts (concert_item_id);

-- ---------------------------------------------------------------------------
-- followed_concert_artists
-- ---------------------------------------------------------------------------

create table if not exists public.followed_concert_artists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  concert_artist_id uuid not null references public.concert_artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint followed_concert_artists_user_artist_unique unique (user_id, concert_artist_id)
);

create index if not exists followed_concert_artists_user_created_idx
  on public.followed_concert_artists (user_id, created_at desc);

create index if not exists followed_concert_artists_artist_idx
  on public.followed_concert_artists (concert_artist_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'saved_concerts',
    'concert_reminders',
    'recently_watched_concerts',
    'followed_concert_artists'
  ]
  loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_touch_updated_at before update on public.%I for each row execute function public.concerts_touch_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS — owner-only user data
-- ---------------------------------------------------------------------------

alter table public.saved_concerts enable row level security;
alter table public.concert_reminders enable row level security;
alter table public.recently_watched_concerts enable row level security;
alter table public.followed_concert_artists enable row level security;

drop policy if exists saved_concerts_owner on public.saved_concerts;
create policy saved_concerts_owner on public.saved_concerts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists concert_reminders_owner on public.concert_reminders;
create policy concert_reminders_owner on public.concert_reminders for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists recently_watched_concerts_owner on public.recently_watched_concerts;
create policy recently_watched_concerts_owner on public.recently_watched_concerts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists followed_concert_artists_owner on public.followed_concert_artists;
create policy followed_concert_artists_owner on public.followed_concert_artists for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.saved_concerts to authenticated;
grant select, insert, update, delete on public.concert_reminders to authenticated;
grant select, insert, update, delete on public.recently_watched_concerts to authenticated;
grant select, insert, update, delete on public.followed_concert_artists to authenticated;

revoke all on public.saved_concerts from anon;
revoke all on public.concert_reminders from anon;
revoke all on public.recently_watched_concerts from anon;
revoke all on public.followed_concert_artists from anon;

notify pgrst, 'reload schema';
