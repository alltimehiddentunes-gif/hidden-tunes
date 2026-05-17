-- Hidden Tunes rights review metadata scaffold
-- Preparation-only migration for future artist uploads, duplicate detection,
-- copyright scanning, and admin review workflows.
--
-- Safety rules:
-- - Adds nullable columns only.
-- - Does not rename, drop, or rewrite existing data.
-- - Keeps current catalog visible by defaulting existing release/track content
--   to approved.
-- - Does not implement blocking, external scan providers, or takedown logic.
--
-- Planned values for review_status:
-- draft, pending_review, approved, copyright_flagged, duplicate_flagged,
-- rejected, published, takedown_requested
--
-- Planned values for license_declaration:
-- own_original_work, licensed_content, royalty_free_content,
-- ai_generated_content, uploading_on_behalf_of_rights_holder, unknown

-- Release-level review state.
-- The admin app currently treats rows in albums as releases.
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

-- Track-level scan metadata.
-- The admin app currently stores uploaded tracks in songs.
-- duration_seconds already exists in the current upload flow, so this migration
-- only adds the missing future-review fields.
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

-- Backfill only rows that remain null after column creation. This preserves any
-- manually prepared values if this script is re-run.
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
