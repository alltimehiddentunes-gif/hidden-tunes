-- Hidden Tunes radio catalog foundation for metadata-only public browse/search routes.
-- Stream URLs stay in the table for tap-only play resolution and are not selected by browse/search.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.radio_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source_type text NOT NULL DEFAULT 'radio_browser',
  source_station_uuid text NOT NULL,
  stream_url text NOT NULL,
  favicon_url text,
  country text,
  country_code text,
  language text,
  tags text[] NOT NULL DEFAULT '{}',
  bitrate integer,
  codec text,
  votes integer,
  click_count integer,
  category_slug text,
  categories text[] NOT NULL DEFAULT '{}',
  quality_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  playback_status text NOT NULL DEFAULT 'unchecked',
  is_active boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  is_mature boolean NOT NULL DEFAULT false,
  mature_reason text,
  content_rating text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'radio_browser';
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS source_station_uuid text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS stream_url text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS favicon_url text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS country_code text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS language text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS bitrate integer;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS codec text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS votes integer;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS click_count integer;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS category_slug text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS categories text[] DEFAULT '{}';
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS quality_score integer DEFAULT 0;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS playback_status text DEFAULT 'unchecked';
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT false;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS is_featured boolean DEFAULT false;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS is_mature boolean DEFAULT false;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS mature_reason text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS content_rating text;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.radio_stations ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.radio_stations
SET
  source_type = COALESCE(source_type, 'radio_browser'),
  tags = COALESCE(tags, '{}'),
  categories = COALESCE(categories, '{}'),
  quality_score = COALESCE(quality_score, 0),
  status = COALESCE(status, 'pending'),
  playback_status = COALESCE(playback_status, 'unchecked'),
  is_active = COALESCE(is_active, false),
  is_verified = COALESCE(is_verified, false),
  is_featured = COALESCE(is_featured, false),
  is_mature = COALESCE(is_mature, false),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

ALTER TABLE public.radio_stations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.radio_stations ALTER COLUMN source_type SET DEFAULT 'radio_browser';
ALTER TABLE public.radio_stations ALTER COLUMN tags SET DEFAULT '{}';
ALTER TABLE public.radio_stations ALTER COLUMN categories SET DEFAULT '{}';
ALTER TABLE public.radio_stations ALTER COLUMN quality_score SET DEFAULT 0;
ALTER TABLE public.radio_stations ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.radio_stations ALTER COLUMN playback_status SET DEFAULT 'unchecked';
ALTER TABLE public.radio_stations ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE public.radio_stations ALTER COLUMN is_verified SET DEFAULT false;
ALTER TABLE public.radio_stations ALTER COLUMN is_featured SET DEFAULT false;
ALTER TABLE public.radio_stations ALTER COLUMN is_mature SET DEFAULT false;
ALTER TABLE public.radio_stations ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.radio_stations ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.radio_stations ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN tags SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN categories SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN quality_score SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN playback_status SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN is_verified SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN is_featured SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN is_mature SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.radio_stations ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'radio_stations_source_unique'
      AND conrelid = 'public.radio_stations'::regclass
  ) THEN
    ALTER TABLE public.radio_stations
      ADD CONSTRAINT radio_stations_source_unique UNIQUE (source_type, source_station_uuid);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'radio_stations_status_check'
      AND conrelid = 'public.radio_stations'::regclass
  ) THEN
    ALTER TABLE public.radio_stations
      ADD CONSTRAINT radio_stations_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'blocked', 'inactive'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'radio_stations_playback_status_check'
      AND conrelid = 'public.radio_stations'::regclass
  ) THEN
    ALTER TABLE public.radio_stations
      ADD CONSTRAINT radio_stations_playback_status_check
      CHECK (playback_status IN ('unchecked', 'playable', 'failed', 'blocked', 'offline', 'pending', 'rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'radio_stations_quality_score_check'
      AND conrelid = 'public.radio_stations'::regclass
  ) THEN
    ALTER TABLE public.radio_stations
      ADD CONSTRAINT radio_stations_quality_score_check
      CHECK (quality_score >= 0 AND quality_score <= 100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS radio_stations_public_browse_idx
  ON public.radio_stations (quality_score DESC, votes DESC, click_count DESC, created_at DESC)
  WHERE status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS radio_stations_featured_browse_idx
  ON public.radio_stations (is_featured, quality_score DESC, votes DESC)
  WHERE status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS radio_stations_country_browse_idx
  ON public.radio_stations (country_code, quality_score DESC, votes DESC)
  WHERE status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS radio_stations_category_browse_idx
  ON public.radio_stations (category_slug, quality_score DESC, votes DESC)
  WHERE status = 'approved' AND is_active = true;

CREATE INDEX IF NOT EXISTS radio_stations_categories_gin_idx
  ON public.radio_stations USING gin (categories);

CREATE INDEX IF NOT EXISTS radio_stations_tags_gin_idx
  ON public.radio_stations USING gin (tags);

CREATE INDEX IF NOT EXISTS radio_stations_name_trgm_idx
  ON public.radio_stations USING gin (name gin_trgm_ops);

ALTER TABLE public.radio_stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS radio_stations_public_read_metadata ON public.radio_stations;
CREATE POLICY radio_stations_public_read_metadata
  ON public.radio_stations
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' AND is_active = true);

GRANT SELECT ON public.radio_stations TO anon, authenticated;
GRANT ALL ON public.radio_stations TO service_role;

NOTIFY pgrst, 'reload schema';
