-- Hidden Tunes audiobook scale/import support.
-- Safe additive migration: no drops, no deletes.

begin;

create extension if not exists pg_trgm;

alter table if exists public.audiobooks
  add column if not exists source_id text,
  add column if not exists normalized_title_author text;

update public.audiobooks
set source_id = coalesce(source_id, source_key, id::text)
where source_id is null;

update public.audiobooks
set normalized_title_author = lower(
  regexp_replace(
    regexp_replace(coalesce(title, '') || '-' || coalesce(author_name, ''), '[^a-zA-Z0-9]+', '-', 'g'),
    '(^-+|-+$)',
    '',
    'g'
  )
)
where normalized_title_author is null
  and coalesce(title, '') <> '';

create table if not exists public.audiobook_external_links (
  id uuid primary key default gen_random_uuid(),
  audiobook_id uuid not null references public.audiobooks(id) on delete cascade,
  label text not null,
  url text not null,
  source_type text,
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audiobook_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'running',
  page_cursor text,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint audiobook_import_runs_status_check check (
    status in ('running', 'completed', 'failed')
  )
);

do $$
begin
  if not exists (
    select 1
    from public.audiobooks
    where source_type is not null
      and source_id is not null
    group by source_type, source_id
    having count(*) > 1
  ) then
    create unique index if not exists audiobooks_source_type_source_id_unique_idx
      on public.audiobooks (source_type, source_id)
      where source_type is not null and source_id is not null;
  end if;
end $$;

create index if not exists audiobooks_normalized_title_author_idx
  on public.audiobooks (normalized_title_author)
  where normalized_title_author is not null and normalized_title_author <> '';

create unique index if not exists audiobook_external_links_source_key_unique_idx
  on public.audiobook_external_links (source_key)
  where source_key is not null;

create index if not exists audiobook_external_links_audiobook_idx
  on public.audiobook_external_links (audiobook_id);

create index if not exists audiobook_import_runs_source_status_idx
  on public.audiobook_import_runs (source, status, started_at desc);

create index if not exists audiobooks_source_type_idx
  on public.audiobooks (source_type);

create index if not exists audiobooks_missing_artwork_idx
  on public.audiobooks (id)
  where cover_url is null;

create index if not exists audiobook_chapters_audiobook_idx
  on public.audiobook_chapters (audiobook_id);

create or replace function public.audiobook_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists audiobook_external_links_touch_updated_at on public.audiobook_external_links;
create trigger audiobook_external_links_touch_updated_at
  before update on public.audiobook_external_links
  for each row execute function public.audiobook_touch_updated_at();

drop trigger if exists audiobook_import_runs_touch_updated_at on public.audiobook_import_runs;
create trigger audiobook_import_runs_touch_updated_at
  before update on public.audiobook_import_runs
  for each row execute function public.audiobook_touch_updated_at();

insert into public.audiobook_categories (name, slug, sort_order)
values
  ('Fiction', 'fiction', 10),
  ('Classics', 'classics', 20),
  ('Biography', 'biography', 30),
  ('Children', 'children', 40),
  ('History', 'history', 50),
  ('Poetry', 'poetry', 60),
  ('Philosophy', 'philosophy', 70),
  ('Science', 'science', 80),
  ('Religion', 'religion', 90),
  ('Drama', 'drama', 100),
  ('Mystery', 'mystery', 110),
  ('Adventure', 'adventure', 120),
  ('Education', 'education', 130),
  ('Language', 'language', 140),
  ('Short Stories', 'short-stories', 150),
  ('Non-fiction', 'non-fiction', 160)
on conflict (slug) do update
set name = excluded.name,
    sort_order = excluded.sort_order,
    is_active = true;

notify pgrst, 'reload schema';

commit;
