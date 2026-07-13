-- Motivationals program platform: creators, programs, rights, progress, import jobs.
-- Preserves existing motivation_items / motivation_files data.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- motivation_creators
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_creators (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  display_name text,
  bio text,
  creator_type text not null default 'speaker',
  website_url text,
  artwork_url text,
  country_code text,
  language_code text,
  verification_status text not null default 'pending',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_creators_slug_unique unique (slug),
  constraint motivation_creators_verification_status_check check (
    verification_status in ('pending', 'verified', 'rejected', 'disabled')
  )
);

create index if not exists motivation_creators_active_idx
  on public.motivation_creators (is_active, slug);

-- ---------------------------------------------------------------------------
-- motivation_programs
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_programs (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  subtitle text,
  description text,
  creator_id uuid references public.motivation_creators (id) on delete set null,
  category_id uuid references public.motivation_categories (id) on delete set null,
  category_slug text,
  artwork_url text,
  banner_url text,
  language_code text,
  country_code text,
  content_rating text not null default 'general',
  program_type text not null default 'standalone_collection',
  session_count integer not null default 0,
  total_duration_seconds integer not null default 0,
  published_at timestamptz,
  is_featured boolean not null default false,
  is_public boolean not null default false,
  is_active boolean not null default true,
  status text not null default 'draft',
  rights_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_programs_slug_unique unique (slug),
  constraint motivation_programs_type_check check (
    program_type in (
      'series',
      'course',
      'collection',
      'challenge',
      'daily_program',
      'affirmation_program',
      'guided_program',
      'standalone_collection'
    )
  ),
  constraint motivation_programs_status_check check (
    status in ('draft', 'published', 'archived', 'hidden')
  )
);

create index if not exists motivation_programs_public_idx
  on public.motivation_programs (is_public, is_active, status, published_at desc);

create index if not exists motivation_programs_category_idx
  on public.motivation_programs (category_slug, is_public, is_active);

-- ---------------------------------------------------------------------------
-- motivation_sources (catalog source registry companion)
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  source_type text not null,
  base_url text,
  license_type text,
  license_url text,
  country_code text,
  language_code text,
  is_enabled boolean not null default true,
  verification_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_sources_slug_unique unique (slug)
);

-- ---------------------------------------------------------------------------
-- motivation_rights
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_rights (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.motivation_items (id) on delete cascade,
  program_id uuid references public.motivation_programs (id) on delete cascade,
  source_id uuid references public.motivation_sources (id) on delete set null,
  rights_holder text,
  license_type text,
  license_name text,
  license_url text,
  attribution_text text,
  streaming_allowed boolean not null default false,
  download_allowed boolean not null default false,
  territories text[] not null default array['*'],
  valid_from timestamptz,
  valid_until timestamptz,
  evidence_url text,
  evidence_notes text,
  review_status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_rights_review_status_check check (
    review_status in ('pending', 'approved', 'rejected', 'needs_review')
  )
);

create index if not exists motivation_rights_item_idx on public.motivation_rights (item_id);
create index if not exists motivation_rights_program_idx on public.motivation_rights (program_id);

-- ---------------------------------------------------------------------------
-- motivation_progress
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_progress (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  item_id uuid not null references public.motivation_items (id) on delete cascade,
  program_id uuid references public.motivation_programs (id) on delete set null,
  category_id uuid references public.motivation_categories (id) on delete set null,
  category_slug text,
  position_seconds integer not null default 0,
  duration_seconds integer,
  completion_percentage integer not null default 0,
  is_completed boolean not null default false,
  last_played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivation_progress_user_item_unique unique (user_id, item_id)
);

create index if not exists motivation_progress_user_last_played_idx
  on public.motivation_progress (user_id, last_played_at desc);

-- ---------------------------------------------------------------------------
-- motivation_import_jobs / motivation_import_failures
-- ---------------------------------------------------------------------------

create table if not exists public.motivation_import_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null,
  source_slug text not null,
  status text not null default 'running',
  records_discovered integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  duplicates_skipped integer not null default 0,
  items_promoted integer not null default 0,
  cursor_value text,
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists motivation_import_jobs_batch_idx
  on public.motivation_import_jobs (batch_id, started_at desc);

create table if not exists public.motivation_import_failures (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.motivation_import_jobs (id) on delete cascade,
  source_slug text,
  external_id text,
  title text,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Extend motivation_items
-- ---------------------------------------------------------------------------

alter table public.motivation_items
  add column if not exists program_id uuid references public.motivation_programs (id) on delete set null,
  add column if not exists creator_id uuid references public.motivation_creators (id) on delete set null,
  add column if not exists source_ref_id uuid references public.motivation_sources (id) on delete set null,
  add column if not exists external_id text,
  add column if not exists season_number integer,
  add column if not exists episode_number integer,
  add column if not exists media_type text,
  add column if not exists country_code text,
  add column if not exists content_rating text not null default 'general',
  add column if not exists verification_status text not null default 'pending',
  add column if not exists source_published_at timestamptz,
  add column if not exists is_public boolean not null default false,
  add column if not exists program_identity_key text;

alter table public.motivation_files
  add column if not exists delivery_type text not null default 'progressive',
  add column if not exists storage_provider text,
  add column if not exists storage_key text,
  add column if not exists external_url text,
  add column if not exists codec text,
  add column if not exists bitrate_kbps integer,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists file_size_bytes bigint,
  add column if not exists quality_label text,
  add column if not exists license_type text,
  add column if not exists license_url text,
  add column if not exists is_enabled boolean not null default true,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists last_verified_at timestamptz;

create index if not exists motivation_items_program_order_idx
  on public.motivation_items (
    program_id,
    season_number asc nulls first,
    episode_number asc nulls first,
    sort_order asc,
    published_at asc nulls last,
    id asc
  )
  where status = 'approved' and is_active = true;

create index if not exists motivation_items_public_program_idx
  on public.motivation_items (program_id, is_public, status, is_active);

-- Extend categories table
alter table public.motivation_categories
  add column if not exists artwork_url text,
  add column if not exists icon text,
  add column if not exists is_featured boolean not null default false;

-- Seed worldwide categories (extendable via DB)
insert into public.motivation_categories (slug, name, description, sort_order, is_active, is_featured)
values
  ('daily-motivation', 'Daily Motivation', 'Daily encouragement and momentum', 10, true, true),
  ('morning-motivation', 'Morning Motivation', 'Start the day with purpose', 20, true, true),
  ('evening-motivation', 'Evening Motivation', 'Reflect and reset', 30, true, false),
  ('success', 'Success', 'Achievement and winning mindset', 40, true, true),
  ('discipline', 'Discipline', 'Consistency and self-control', 50, true, true),
  ('confidence', 'Confidence', 'Self-belief and courage', 60, true, true),
  ('self-esteem', 'Self-Esteem', 'Healthy self-worth', 70, true, false),
  ('personal-growth', 'Personal Growth', 'Become your best self', 80, true, true),
  ('leadership', 'Leadership', 'Lead with clarity and integrity', 90, true, true),
  ('entrepreneurship', 'Entrepreneurship', 'Build and create', 100, true, true),
  ('business', 'Business', 'Professional excellence', 110, true, false),
  ('career', 'Career', 'Advance with intention', 120, true, false),
  ('productivity', 'Productivity', 'Work smarter and finish strong', 130, true, true),
  ('focus', 'Focus', 'Deep work and concentration', 140, true, true),
  ('study-motivation', 'Study Motivation', 'Learning and academic drive', 150, true, true),
  ('student-success', 'Student Success', 'School and university success', 160, true, false),
  ('fitness-motivation', 'Fitness Motivation', 'Train with energy', 170, true, true),
  ('sports-motivation', 'Sports Motivation', 'Compete and improve', 180, true, false),
  ('health-wellness', 'Health and Wellness', 'Whole-person wellbeing', 190, true, false),
  ('mental-strength', 'Mental Strength', 'Resilience under pressure', 200, true, true),
  ('resilience', 'Resilience', 'Bounce back stronger', 210, true, false),
  ('overcoming-failure', 'Overcoming Failure', 'Turn setbacks into growth', 220, true, false),
  ('healing', 'Healing', 'Recovery and restoration', 230, true, true),
  ('grief-support', 'Grief Support', 'Comfort through loss', 240, true, false),
  ('stress-relief', 'Stress Relief', 'Calm under load', 250, true, false),
  ('anxiety-support', 'Anxiety Support', 'Grounding and reassurance', 260, true, false),
  ('positive-thinking', 'Positive Thinking', 'Constructive optimism', 270, true, false),
  ('mindset', 'Mindset', 'Mental models for progress', 280, true, true),
  ('goal-setting', 'Goal Setting', 'Plan and execute goals', 290, true, false),
  ('habits', 'Habits', 'Build routines that stick', 300, true, true),
  ('time-management', 'Time Management', 'Use time intentionally', 310, true, false),
  ('financial-motivation', 'Financial Motivation', 'Money discipline and growth', 320, true, false),
  ('wealth-mindset', 'Wealth Mindset', 'Abundance and stewardship', 330, true, false),
  ('relationships', 'Relationships', 'Connection and empathy', 340, true, false),
  ('faith-purpose', 'Faith and Purpose', 'Spiritual encouragement', 350, true, true),
  ('affirmations', 'Affirmations', 'Spoken encouragement', 360, true, true),
  ('gratitude', 'Gratitude', 'Thankfulness and perspective', 370, true, false),
  ('meditation', 'Meditation', 'Guided calm and reflection', 380, true, false),
  ('mindfulness', 'Mindfulness', 'Present-moment awareness', 390, true, false),
  ('general-inspiration', 'General Inspiration', 'Broad motivational content', 400, true, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  is_featured = excluded.is_featured,
  updated_at = now();

notify pgrst, 'reload schema';

commit;
