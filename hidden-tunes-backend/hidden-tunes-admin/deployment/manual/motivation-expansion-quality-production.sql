begin;

alter table public.motivation_items
  add column if not exists content_classification text not null default 'hold',
  add column if not exists content_classification_reason text,
  add column if not exists content_classification_confidence integer,
  add column if not exists normalized_title_hash text,
  add column if not exists health_status text not null default 'unchecked',
  add column if not exists duplicate_status text not null default 'none',
  add column if not exists rights_status text not null default 'unchecked',
  add column if not exists media_probe_status text not null default 'unchecked';

update public.motivation_items
set content_classification = 'accept'
where status = 'approved'
  and is_active = true
  and is_verified = true
  and playback_status = 'playable'
  and content_classification = 'hold';

create index if not exists motivation_items_content_classification_idx
  on public.motivation_items (content_classification, status, is_active)
  where status = 'approved';

create index if not exists motivation_items_normalized_title_hash_idx
  on public.motivation_items (normalized_title_hash)
  where normalized_title_hash is not null;

create index if not exists motivation_items_language_country_idx
  on public.motivation_items (language, region, category_slug)
  where status = 'approved' and is_active = true;

notify pgrst, 'reload schema';

commit;
