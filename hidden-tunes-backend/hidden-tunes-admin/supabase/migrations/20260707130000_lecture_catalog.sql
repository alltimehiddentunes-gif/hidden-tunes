begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.lecture_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  artwork_url text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  instructor_name text,
  speaker_name text,
  creator_name text,
  publisher_name text,
  category_id uuid,
  category_slug text,
  categories text[] default '{}',
  topic_tags text[] default '{}',
  difficulty text,
  lesson_count integer default 0,
  session_count integer default 0,
  total_duration_seconds integer,
  duration_seconds integer,
  artwork_url text,
  cover_url text,
  language text,
  content_type text default 'lecture',
  media_type text,
  source_name text,
  source_identifier text,
  source_type text default 'manual',
  source_url text,
  source_key text,
  license_type text,
  license_url text,
  rights text,
  rights_status text default 'pending_review',
  status text default 'pending',
  playable_status text default 'unchecked',
  playback_status text default 'unchecked',
  is_active boolean default false,
  is_public boolean default false,
  is_verified boolean default false,
  is_featured boolean default false,
  is_mature boolean default false,
  published_at timestamptz,
  sort_order integer default 0,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_files (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null,
  lecture_item_id uuid,
  title text,
  description text,
  position integer,
  lesson_number integer,
  audio_url text,
  video_url text,
  stream_url text,
  media_type text,
  mime_type text,
  duration_seconds integer,
  is_primary boolean default false,
  is_verified boolean default false,
  playable_status text default 'unchecked',
  playback_status text default 'unchecked',
  is_active boolean default true,
  source_file_identifier text,
  source_key text,
  language text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_name text not null,
  base_url text,
  license_type text,
  license_url text,
  rights_notes text,
  is_enabled boolean default true,
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_import_checkpoints (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lecture_sources(id) on delete cascade,
  job_key text not null,
  cursor text,
  page integer default 0,
  programs_seen integer default 0,
  programs_inserted integer default 0,
  programs_updated integer default 0,
  sessions_seen integer default 0,
  sessions_inserted integer default 0,
  sessions_updated integer default 0,
  duplicates_skipped integer default 0,
  invalid_skipped integer default 0,
  errors_count integer default 0,
  status text default 'pending',
  last_error text,
  started_at timestamptz default now(),
  updated_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.lecture_import_errors (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.lecture_sources(id) on delete set null,
  job_key text,
  source_identifier text,
  program_identifier text,
  session_identifier text,
  error_reason text not null,
  payload_summary jsonb,
  retryable boolean default true,
  created_at timestamptz default now()
);

alter table public.lecture_categories add column if not exists description text;
alter table public.lecture_categories add column if not exists artwork_url text;
alter table public.lecture_categories add column if not exists sort_order integer default 0;
alter table public.lecture_categories add column if not exists is_active boolean default true;
alter table public.lecture_categories add column if not exists created_at timestamptz default now();
alter table public.lecture_categories add column if not exists updated_at timestamptz default now();

alter table public.lecture_items add column if not exists subtitle text;
alter table public.lecture_items add column if not exists description text;
alter table public.lecture_items add column if not exists instructor_name text;
alter table public.lecture_items add column if not exists speaker_name text;
alter table public.lecture_items add column if not exists creator_name text;
alter table public.lecture_items add column if not exists publisher_name text;
alter table public.lecture_items add column if not exists category_id uuid;
alter table public.lecture_items add column if not exists category_slug text;
alter table public.lecture_items add column if not exists categories text[] default '{}';
alter table public.lecture_items add column if not exists topic_tags text[] default '{}';
alter table public.lecture_items add column if not exists difficulty text;
alter table public.lecture_items add column if not exists lesson_count integer default 0;
alter table public.lecture_items add column if not exists session_count integer default 0;
alter table public.lecture_items add column if not exists total_duration_seconds integer;
alter table public.lecture_items add column if not exists duration_seconds integer;
alter table public.lecture_items add column if not exists artwork_url text;
alter table public.lecture_items add column if not exists cover_url text;
alter table public.lecture_items add column if not exists language text;
alter table public.lecture_items add column if not exists content_type text default 'lecture';
alter table public.lecture_items add column if not exists media_type text;
alter table public.lecture_items add column if not exists source_name text;
alter table public.lecture_items add column if not exists source_identifier text;
alter table public.lecture_items add column if not exists source_type text default 'manual';
alter table public.lecture_items add column if not exists source_url text;
alter table public.lecture_items add column if not exists source_key text;
alter table public.lecture_items add column if not exists license_type text;
alter table public.lecture_items add column if not exists license_url text;
alter table public.lecture_items add column if not exists rights text;
alter table public.lecture_items add column if not exists rights_status text default 'pending_review';
alter table public.lecture_items add column if not exists status text default 'pending';
alter table public.lecture_items add column if not exists playable_status text default 'unchecked';
alter table public.lecture_items add column if not exists playback_status text default 'unchecked';
alter table public.lecture_items add column if not exists is_active boolean default false;
alter table public.lecture_items add column if not exists is_public boolean default false;
alter table public.lecture_items add column if not exists is_verified boolean default false;
alter table public.lecture_items add column if not exists is_featured boolean default false;
alter table public.lecture_items add column if not exists is_mature boolean default false;
alter table public.lecture_items add column if not exists published_at timestamptz;
alter table public.lecture_items add column if not exists sort_order integer default 0;
alter table public.lecture_items add column if not exists last_checked_at timestamptz;
alter table public.lecture_items add column if not exists created_at timestamptz default now();
alter table public.lecture_items add column if not exists updated_at timestamptz default now();

alter table public.lecture_files add column if not exists title text;
alter table public.lecture_files add column if not exists lecture_item_id uuid;
alter table public.lecture_files add column if not exists description text;
alter table public.lecture_files add column if not exists position integer;
alter table public.lecture_files add column if not exists lesson_number integer;
alter table public.lecture_files add column if not exists audio_url text;
alter table public.lecture_files add column if not exists video_url text;
alter table public.lecture_files add column if not exists stream_url text;
alter table public.lecture_files add column if not exists media_type text;
alter table public.lecture_files add column if not exists mime_type text;
alter table public.lecture_files add column if not exists duration_seconds integer;
alter table public.lecture_files add column if not exists is_primary boolean default false;
alter table public.lecture_files add column if not exists is_verified boolean default false;
alter table public.lecture_files add column if not exists playable_status text default 'unchecked';
alter table public.lecture_files add column if not exists playback_status text default 'unchecked';
alter table public.lecture_files add column if not exists is_active boolean default true;
alter table public.lecture_files add column if not exists source_file_identifier text;
alter table public.lecture_files add column if not exists source_key text;
alter table public.lecture_files add column if not exists language text;
alter table public.lecture_files add column if not exists created_at timestamptz default now();
alter table public.lecture_files add column if not exists updated_at timestamptz default now();

insert into public.lecture_categories (name, slug, description, sort_order, is_active)
values
  ('Business', 'business', 'Business talks, seminars, and practical lessons', 10, true),
  ('Programming', 'programming', 'Software development lectures and tutorials', 20, true),
  ('Design', 'design', 'Design education, process, and critique', 30, true),
  ('Music Production', 'music-production', 'Production, mixing, and creative audio lessons', 40, true),
  ('Language Learning', 'language-learning', 'Language study and learning resources', 50, true),
  ('Study Skills', 'study-skills', 'Learning strategies, focus, and student skills', 60, true),
  ('Personal Finance', 'personal-finance', 'Money, budgeting, and finance education', 70, true),
  ('Entrepreneurship', 'entrepreneurship', 'Founder talks and startup education', 80, true),
  ('Marketing', 'marketing', 'Marketing, branding, and growth tutorials', 90, true),
  ('Productivity', 'productivity', 'Workflow, habits, and productivity lessons', 100, true),
  ('Health Education', 'health-education', 'Public health and wellness education', 110, true),
  ('Faith Teaching', 'faith-teaching', 'Faith-centered teaching and lectures', 120, true),
  ('Academic Lectures', 'academic-lectures', 'Open academic lectures and classes', 130, true),
  ('Tutorials', 'tutorials', 'Practical how-to tutorials', 140, true)
on conflict do nothing;

update public.lecture_categories
set
  name = seed.name,
  description = coalesce(public.lecture_categories.description, seed.description),
  sort_order = seed.sort_order,
  is_active = true,
  updated_at = now()
from (
  values
    ('business', 'Business', 'Business talks, seminars, and practical lessons', 10),
    ('programming', 'Programming', 'Software development lectures and tutorials', 20),
    ('design', 'Design', 'Design education, process, and critique', 30),
    ('music-production', 'Music Production', 'Production, mixing, and creative audio lessons', 40),
    ('language-learning', 'Language Learning', 'Language study and learning resources', 50),
    ('study-skills', 'Study Skills', 'Learning strategies, focus, and student skills', 60),
    ('personal-finance', 'Personal Finance', 'Money, budgeting, and finance education', 70),
    ('entrepreneurship', 'Entrepreneurship', 'Founder talks and startup education', 80),
    ('marketing', 'Marketing', 'Marketing, branding, and growth tutorials', 90),
    ('productivity', 'Productivity', 'Workflow, habits, and productivity lessons', 100),
    ('health-education', 'Health Education', 'Public health and wellness education', 110),
    ('faith-teaching', 'Faith Teaching', 'Faith-centered teaching and lectures', 120),
    ('academic-lectures', 'Academic Lectures', 'Open academic lectures and classes', 130),
    ('tutorials', 'Tutorials', 'Practical how-to tutorials', 140)
) as seed(slug, name, description, sort_order)
where public.lecture_categories.slug = seed.slug
  and (
    public.lecture_categories.name is distinct from seed.name
    or public.lecture_categories.description is null
    or public.lecture_categories.sort_order is distinct from seed.sort_order
    or public.lecture_categories.is_active is distinct from true
  );

update public.lecture_items
set categories = array[category_slug]
where category_slug is not null
  and (categories is null or cardinality(categories) = 0);

update public.lecture_items item
set lesson_count = counts.file_count
from (
  select item_id, count(*)::integer as file_count
  from public.lecture_files
  where is_active is true
    and (audio_url is not null or video_url is not null)
  group by item_id
) counts
where item.id = counts.item_id
  and coalesce(item.lesson_count, 0) is distinct from counts.file_count;

update public.lecture_files
set media_type = case
    when audio_url is not null then 'audio'
    when video_url is not null then 'video'
    else media_type
  end
where media_type is null
  and (audio_url is not null or video_url is not null);

update public.lecture_files
set lecture_item_id = item_id
where lecture_item_id is null;

update public.lecture_files
set position = coalesce(position, lesson_number, 1)
where position is null;

update public.lecture_items
set session_count = coalesce(nullif(session_count, 0), lesson_count),
    total_duration_seconds = coalesce(total_duration_seconds, duration_seconds),
    source_identifier = coalesce(source_identifier, source_key),
    source_name = coalesce(source_name, creator_name, source_type),
    license_type = coalesce(license_type, rights),
    rights_status = coalesce(rights_status, rights, 'pending_review'),
    playable_status = coalesce(nullif(playable_status, 'unchecked'), playback_status)
where true;

update public.lecture_files
set source_file_identifier = coalesce(source_file_identifier, source_key),
    playable_status = coalesce(nullif(playable_status, 'unchecked'), playback_status)
where true;

update public.lecture_files
set playback_status = 'playable'
where is_active is true
  and playback_status is distinct from 'playable'
  and (audio_url like 'https://%' or video_url like 'https://%');

update public.lecture_files
set playable_status = playback_status
where playable_status is distinct from playback_status;

update public.lecture_items item
set playback_status = 'playable',
    playable_status = 'playable',
    is_active = true,
    is_public = true,
    is_verified = true,
    status = case when status = 'pending' then 'approved' else status end,
    updated_at = now()
where exists (
  select 1
  from public.lecture_files file
  where file.item_id = item.id
    and file.is_active is true
    and file.playback_status = 'playable'
    and (file.audio_url is not null or file.video_url is not null)
)
and (
  item.playback_status is distinct from 'playable'
  or item.is_active is distinct from true
  or item.status = 'pending'
);

with ranked_files as (
  select
    id,
    item_id,
    row_number() over (
      partition by item_id
      order by is_primary desc, lesson_number asc nulls last, created_at asc, id asc
    ) as rn
  from public.lecture_files
  where is_active is true
    and playback_status = 'playable'
    and (audio_url is not null or video_url is not null)
)
update public.lecture_files file
set is_primary = (ranked_files.rn = 1)
from ranked_files
where file.id = ranked_files.id
  and file.is_primary is distinct from (ranked_files.rn = 1);

create unique index if not exists lecture_categories_slug_key
  on public.lecture_categories (slug);

create unique index if not exists lecture_items_slug_key
  on public.lecture_items (slug);

create unique index if not exists lecture_items_source_key_key
  on public.lecture_items (source_key)
  where source_key is not null;

create unique index if not exists lecture_files_source_key_key
  on public.lecture_files (source_key)
  where source_key is not null;

create unique index if not exists lecture_sources_source_key_key
  on public.lecture_sources (source_key);

create unique index if not exists lecture_import_checkpoints_source_job_key
  on public.lecture_import_checkpoints (source_id, job_key);

create unique index if not exists lecture_files_item_position_key
  on public.lecture_files (item_id, position)
  where position is not null;

create index if not exists lecture_categories_active_sort_idx
  on public.lecture_categories (is_active, sort_order);

create index if not exists lecture_items_public_catalog_idx
  on public.lecture_items (
    is_mature,
    is_public,
    is_verified,
    status,
    is_active,
    playback_status,
    playable_status,
    category_slug,
    sort_order,
    published_at desc,
    id desc
  );

create index if not exists lecture_items_categories_gin_idx
  on public.lecture_items using gin (categories);

create index if not exists lecture_items_search_trgm_idx
  on public.lecture_items using gin (
    (coalesce(title, '') || ' ' || coalesce(instructor_name, '') || ' ' || coalesce(speaker_name, '') || ' ' || coalesce(creator_name, '') || ' ' || coalesce(description, '')) gin_trgm_ops
  );

create index if not exists lecture_files_play_idx
  on public.lecture_files (
    item_id,
    is_active,
    is_verified,
    playback_status,
    playable_status,
    is_primary desc,
    position,
    id
  );

create index if not exists lecture_import_checkpoints_status_idx
  on public.lecture_import_checkpoints (status, updated_at desc);

create index if not exists lecture_import_errors_source_job_idx
  on public.lecture_import_errors (source_id, job_key, created_at desc);

do $$
begin
  alter table public.lecture_items
    add constraint lecture_items_status_check
    check (status in ('pending', 'approved', 'rejected', 'blocked', 'archived'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_items
    add constraint lecture_items_playable_status_check
    check (playable_status in ('unchecked', 'pending_review', 'playable', 'failed', 'blocked'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.lecture_files
    add constraint lecture_files_playable_status_check
    check (playable_status in ('unchecked', 'pending_review', 'playable', 'failed', 'blocked'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lecture_files_item_id_fkey'
      and conrelid = 'public.lecture_files'::regclass
  ) then
    alter table public.lecture_files
      add constraint lecture_files_item_id_fkey
      foreign key (item_id)
      references public.lecture_items(id)
      on delete cascade;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.lecture_categories to anon, authenticated, service_role;
grant select on public.lecture_items to anon, authenticated, service_role;
grant select on public.lecture_files to anon, authenticated, service_role;
grant all on public.lecture_sources to service_role;
grant all on public.lecture_import_checkpoints to service_role;
grant all on public.lecture_import_errors to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
