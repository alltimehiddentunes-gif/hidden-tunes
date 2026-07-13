begin;

alter table public.motivation_items
  add column if not exists source_page_url text,
  add column if not exists license_url text,
  add column if not exists media_mime_type text,
  add column if not exists media_size_bytes bigint,
  add column if not exists probe_timestamp timestamptz,
  add column if not exists query_family text;

alter table public.motivation_files
  add column if not exists media_size_bytes bigint;

create index if not exists motivation_items_playable_pending_idx
  on public.motivation_items (status, playback_status, rights_status, media_probe_status)
  where status = 'pending';

create index if not exists motivation_items_query_family_idx
  on public.motivation_items (query_family)
  where query_family is not null;

notify pgrst, 'reload schema';

commit;
