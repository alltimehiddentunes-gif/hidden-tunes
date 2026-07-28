begin;

alter table public.lecture_items add column if not exists coach_name text;
alter table public.lecture_items add column if not exists coaching_specialty text;
alter table public.lecture_items add column if not exists coaching_subcategory text;
alter table public.lecture_items add column if not exists program_format text;
alter table public.lecture_items add column if not exists session_type text;
alter table public.lecture_items add column if not exists target_audience text;
alter table public.lecture_items add column if not exists skill_level text;
alter table public.lecture_items add column if not exists learning_outcomes jsonb default '[]'::jsonb;
alter table public.lecture_items add column if not exists informational_only boolean default false;
alter table public.lecture_items add column if not exists professional_credential text;
alter table public.lecture_items add column if not exists credential_source text;
alter table public.lecture_items add column if not exists medical_disclaimer text;
alter table public.lecture_items add column if not exists financial_disclaimer text;
alter table public.lecture_items add column if not exists legal_disclaimer text;

alter table public.lecture_sources add column if not exists region text;
alter table public.lecture_sources add column if not exists wave integer;
alter table public.lecture_sources add column if not exists languages text[] default '{}';
alter table public.lecture_sources add column if not exists items_discovered integer default 0;
alter table public.lecture_sources add column if not exists items_imported integer default 0;
alter table public.lecture_sources add column if not exists items_rejected integer default 0;
alter table public.lecture_sources add column if not exists items_duplicated integer default 0;
alter table public.lecture_sources add column if not exists items_playable integer default 0;
alter table public.lecture_sources add column if not exists exhausted boolean default false;
alter table public.lecture_sources add column if not exists checkpoint jsonb default '{}'::jsonb;

create table if not exists public.lecture_speakers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  biography text,
  artwork_url text,
  country text,
  role text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.lecture_institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  artwork_url text,
  country text,
  website_url text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists lecture_speakers_slug_key on public.lecture_speakers (slug);
create unique index if not exists lecture_institutions_slug_key on public.lecture_institutions (slug);

create index if not exists lecture_items_coaching_idx
  on public.lecture_items (category_slug, coaching_specialty, coaching_subcategory, is_public, is_active);

create index if not exists lecture_items_country_language_idx
  on public.lecture_items (country, language, media_type, is_public, is_active);

create index if not exists lecture_sources_exhausted_idx
  on public.lecture_sources (is_enabled, exhausted, wave, priority);

insert into public.lecture_sources (
  source_key,
  source_name,
  source_type,
  base_url,
  api_url,
  license_type,
  license_url,
  rights_status,
  rights_notes,
  default_language,
  is_enabled,
  priority,
  requests_per_minute,
  max_concurrency,
  region,
  wave,
  languages,
  importer_version
)
values
  (
    'internet_archive_coaching',
    'Internet Archive Coaching Education',
    'internet_archive',
    'https://archive.org',
    'https://archive.org/advancedsearch.php',
    'public_domain',
    'https://creativecommons.org/publicdomain/mark/1.0/',
    'approved',
    'Coaching and instructional workshop content from lawful public archives only.',
    'English',
    true,
    15,
    25,
    2,
    'global',
    1,
    array['en', 'multi'],
    'lectures-expansion-v2'
  ),
  (
    'internet_archive_mit_ocw',
    'Internet Archive MIT OpenCourseWare',
    'internet_archive',
    'https://archive.org',
    'https://archive.org/advancedsearch.php',
    'creative_commons',
    'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    'approved',
    'MIT OCW and related open course materials mirrored on Internet Archive.',
    'English',
    true,
    20,
    20,
    2,
    'north_america',
    2,
    array['en'],
    'lectures-expansion-v2'
  )
on conflict (source_key) do update
set
  source_name = excluded.source_name,
  rights_status = excluded.rights_status,
  is_enabled = excluded.is_enabled,
  priority = excluded.priority,
  region = excluded.region,
  wave = excluded.wave,
  languages = excluded.languages,
  importer_version = excluded.importer_version,
  updated_at = now();

grant select, insert, update, delete on public.lecture_speakers to service_role;
grant select, insert, update, delete on public.lecture_institutions to service_role;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
