-- Hidden Tunes rights review metadata (albums + songs)
-- Adds nullable review/scan columns used by the admin releases dashboard.

alter table public.albums
  add column if not exists review_status text default 'approved',
  add column if not exists license_declaration text default 'unknown',
  add column if not exists license_notes text,
  add column if not exists license_proof_url text,
  add column if not exists copyright_scan_status text default 'not_scanned',
  add column if not exists copyright_scan_provider text,
  add column if not exists copyright_scan_result jsonb,
  add column if not exists duplicate_scan_status text default 'not_scanned',
  add column if not exists duplicate_match_track_id uuid,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

alter table public.songs
  add column if not exists review_status text default 'approved',
  add column if not exists license_declaration text default 'unknown',
  add column if not exists license_notes text,
  add column if not exists license_proof_url text,
  add column if not exists copyright_scan_status text default 'not_scanned',
  add column if not exists copyright_scan_provider text,
  add column if not exists copyright_scan_result jsonb,
  add column if not exists duplicate_scan_status text default 'not_scanned',
  add column if not exists duplicate_match_track_id uuid,
  add column if not exists audio_hash text,
  add column if not exists audio_fingerprint text,
  add column if not exists file_size_bytes bigint,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists rejection_reason text;

update public.albums
set
  review_status = coalesce(review_status, 'approved'),
  license_declaration = coalesce(license_declaration, 'unknown'),
  copyright_scan_status = coalesce(copyright_scan_status, 'not_scanned'),
  duplicate_scan_status = coalesce(duplicate_scan_status, 'not_scanned')
where
  review_status is null
  or license_declaration is null
  or copyright_scan_status is null
  or duplicate_scan_status is null;

update public.songs
set
  review_status = coalesce(review_status, 'approved'),
  license_declaration = coalesce(license_declaration, 'unknown'),
  copyright_scan_status = coalesce(copyright_scan_status, 'not_scanned'),
  duplicate_scan_status = coalesce(duplicate_scan_status, 'not_scanned')
where
  review_status is null
  or license_declaration is null
  or copyright_scan_status is null
  or duplicate_scan_status is null;
