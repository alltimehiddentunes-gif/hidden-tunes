-- Hidden Tunes TV Ultra Premium v2 — database foundation (Phase 1)
-- Metadata-only TV catalog scaffold for 50k+ searchable, legal-safe embed playback.
--
-- Safety rules:
-- - Additive only: new TV tables, indexes, seeds.
-- - Does not modify songs, albums, artists, uploads, R2, playback, or mobile app.
-- - Does not download or rehost video media; metadata + official source/embed URLs only.
-- - Can be re-run safely (IF NOT EXISTS / ON CONFLICT DO NOTHING).

-- ---------------------------------------------------------------------------
-- tv_categories
-- ---------------------------------------------------------------------------

create table if not exists public.tv_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  type text not null,
  parent_id uuid references public.tv_categories(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint tv_categories_slug_unique unique (slug),
  constraint tv_categories_type_check check (
    type in ('genre', 'mood', 'format', 'collection')
  )
);

create index if not exists tv_categories_type_active_sort_idx
  on public.tv_categories (type, is_active, sort_order);

create index if not exists tv_categories_parent_id_idx
  on public.tv_categories (parent_id);

-- ---------------------------------------------------------------------------
-- tv_sources
-- ---------------------------------------------------------------------------

create table if not exists public.tv_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_url text not null,
  source_id text,
  title text,
  default_category text,
  default_genre text,
  default_mood text,
  scan_frequency text not null default 'weekly',
  auto_approve boolean not null default false,
  is_active boolean not null default true,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tv_sources_type_url_unique unique (source_type, source_url),
  constraint tv_sources_source_type_check check (
    source_type in (
      'youtube_channel',
      'youtube_playlist',
      'youtube_video',
      'archive_collection',
      'hls_stream',
      'm3u_playlist',
      'manual'
    )
  ),
  constraint tv_sources_scan_frequency_check check (
    scan_frequency in ('manual', 'daily', 'weekly', 'monthly')
  )
);

create index if not exists tv_sources_is_active_idx
  on public.tv_sources (is_active);

create index if not exists tv_sources_scan_frequency_idx
  on public.tv_sources (scan_frequency, is_active);

create index if not exists tv_sources_last_scanned_at_idx
  on public.tv_sources (last_scanned_at desc nulls last);

-- ---------------------------------------------------------------------------
-- tv_videos
-- ---------------------------------------------------------------------------

create table if not exists public.tv_videos (
  id uuid primary key default gen_random_uuid(),
  source_type text not null,
  source_id text not null,
  source_url text not null,
  embed_url text,
  title text not null,
  description text,
  thumbnail_url text,
  duration_seconds integer,
  channel_name text,
  category text,
  genre text,
  mood text,
  format text,
  tags text[] not null default '{}',
  language text,
  region text,
  published_at timestamptz,
  status text not null default 'pending',
  playback_status text not null default 'unchecked',
  is_active boolean not null default false,
  is_featured boolean not null default false,
  imported_from_source_id uuid references public.tv_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tv_videos_source_type_id_unique unique (source_type, source_id),
  constraint tv_videos_status_check check (
    status in ('pending', 'approved', 'rejected', 'blocked', 'inactive')
  ),
  constraint tv_videos_playback_status_check check (
    playback_status in (
      'unchecked',
      'playable',
      'failed',
      'blocked',
      'private',
      'deleted',
      'region_blocked',
      'embed_blocked'
    )
  )
);

create index if not exists tv_videos_status_active_playback_idx
  on public.tv_videos (status, is_active, playback_status);

create index if not exists tv_videos_category_idx
  on public.tv_videos (category);

create index if not exists tv_videos_genre_idx
  on public.tv_videos (genre);

create index if not exists tv_videos_mood_idx
  on public.tv_videos (mood);

create index if not exists tv_videos_format_idx
  on public.tv_videos (format);

create index if not exists tv_videos_channel_name_idx
  on public.tv_videos (channel_name);

create index if not exists tv_videos_created_at_desc_idx
  on public.tv_videos (created_at desc);

create index if not exists tv_videos_is_featured_idx
  on public.tv_videos (is_featured)
  where is_featured = true;

create index if not exists tv_videos_tags_gin_idx
  on public.tv_videos using gin (tags);

create index if not exists tv_videos_imported_from_source_id_idx
  on public.tv_videos (imported_from_source_id);

create index if not exists tv_videos_published_at_idx
  on public.tv_videos (published_at desc nulls last);

-- Full-text search: title + description + channel_name
create index if not exists tv_videos_fts_idx
  on public.tv_videos using gin (
    to_tsvector(
      'english',
      coalesce(title, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(channel_name, '')
    )
  );

-- ---------------------------------------------------------------------------
-- tv_import_jobs
-- ---------------------------------------------------------------------------

create table if not exists public.tv_import_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.tv_sources(id) on delete set null,
  status text not null default 'queued',
  total_found integer not null default 0,
  total_imported integer not null default 0,
  total_skipped integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tv_import_jobs_status_check check (
    status in ('queued', 'running', 'completed', 'failed', 'cancelled')
  )
);

create index if not exists tv_import_jobs_source_id_idx
  on public.tv_import_jobs (source_id);

create index if not exists tv_import_jobs_status_created_idx
  on public.tv_import_jobs (status, created_at desc);

-- ---------------------------------------------------------------------------
-- tv_watch_history
-- ---------------------------------------------------------------------------

create table if not exists public.tv_watch_history (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.tv_videos(id) on delete cascade,
  user_id uuid,
  watched_at timestamptz not null default now(),
  progress_seconds integer not null default 0
);

create index if not exists tv_watch_history_video_id_idx
  on public.tv_watch_history (video_id);

create index if not exists tv_watch_history_user_id_watched_idx
  on public.tv_watch_history (user_id, watched_at desc);

-- ---------------------------------------------------------------------------
-- updated_at trigger (tv_videos)
-- ---------------------------------------------------------------------------

create or replace function public.set_tv_videos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tv_videos_set_updated_at on public.tv_videos;

create trigger tv_videos_set_updated_at
before update on public.tv_videos
for each row
execute function public.set_tv_videos_updated_at();

-- ---------------------------------------------------------------------------
-- Seed: tv_categories (genres, moods, formats, collections)
-- ---------------------------------------------------------------------------

insert into public.tv_categories (name, slug, type, sort_order)
values
  -- Genres
  ('Afrobeats', 'afrobeats', 'genre', 10),
  ('Afrobeat', 'afrobeat', 'genre', 20),
  ('Amapiano', 'amapiano', 'genre', 30),
  ('Highlife', 'highlife', 'genre', 40),
  ('Hiplife', 'hiplife', 'genre', 50),
  ('Afro Soul', 'afro-soul', 'genre', 60),
  ('Afro Pop', 'afro-pop', 'genre', 70),
  ('Afro House', 'afro-house', 'genre', 80),
  ('Afro Jazz', 'afro-jazz', 'genre', 90),
  ('Afro Gospel', 'afro-gospel', 'genre', 100),
  ('Afro Fusion', 'afro-fusion', 'genre', 110),
  ('Afro R&B', 'afro-r-b', 'genre', 120),
  ('Afro Drill', 'afro-drill', 'genre', 130),
  ('Azonto', 'azonto', 'genre', 140),
  ('Bongo Flava', 'bongo-flava', 'genre', 150),
  ('Kizomba', 'kizomba', 'genre', 160),
  ('Kuduro', 'kuduro', 'genre', 170),
  ('Makossa', 'makossa', 'genre', 180),
  ('Soukous', 'soukous', 'genre', 190),
  ('Zouk', 'zouk', 'genre', 200),
  ('Reggae', 'reggae', 'genre', 210),
  ('Dancehall', 'dancehall', 'genre', 220),
  ('Dub', 'dub', 'genre', 230),
  ('Ska', 'ska', 'genre', 240),
  ('Rocksteady', 'rocksteady', 'genre', 250),
  ('Roots Reggae', 'roots-reggae', 'genre', 260),
  ('Lovers Rock', 'lovers-rock', 'genre', 270),
  ('Blues', 'blues', 'genre', 280),
  ('Soul Blues', 'soul-blues', 'genre', 290),
  ('Delta Blues', 'delta-blues', 'genre', 300),
  ('Chicago Blues', 'chicago-blues', 'genre', 310),
  ('Electric Blues', 'electric-blues', 'genre', 320),
  ('Gospel Blues', 'gospel-blues', 'genre', 330),
  ('Jazz', 'jazz', 'genre', 340),
  ('Smooth Jazz', 'smooth-jazz', 'genre', 350),
  ('Bebop', 'bebop', 'genre', 360),
  ('Swing', 'swing', 'genre', 370),
  ('Fusion Jazz', 'fusion-jazz', 'genre', 380),
  ('Soul', 'soul', 'genre', 390),
  ('Neo Soul', 'neo-soul', 'genre', 400),
  ('R&B', 'r-b', 'genre', 410),
  ('Classic R&B', 'classic-r-b', 'genre', 420),
  ('Funk', 'funk', 'genre', 430),
  ('Disco', 'disco', 'genre', 440),
  ('Motown', 'motown', 'genre', 450),
  ('Gospel', 'gospel', 'genre', 460),
  ('Praise & Worship', 'praise-worship', 'genre', 470),
  ('Choir', 'choir', 'genre', 480),
  ('Christian Contemporary', 'christian-contemporary', 'genre', 490),
  ('Hip Hop', 'hip-hop', 'genre', 500),
  ('Rap', 'rap', 'genre', 510),
  ('Trap', 'trap', 'genre', 520),
  ('Drill', 'drill', 'genre', 530),
  ('Boom Bap', 'boom-bap', 'genre', 540),
  ('Alternative Hip Hop', 'alternative-hip-hop', 'genre', 550),
  ('Country', 'country', 'genre', 560),
  ('Folk', 'folk', 'genre', 570),
  ('Rock', 'rock', 'genre', 580),
  ('Soft Rock', 'soft-rock', 'genre', 590),
  ('Classic Rock', 'classic-rock', 'genre', 600),
  ('Alternative Rock', 'alternative-rock', 'genre', 610),
  ('Indie Rock', 'indie-rock', 'genre', 620),
  ('Metal', 'metal', 'genre', 630),
  ('Punk', 'punk', 'genre', 640),
  ('Pop', 'pop', 'genre', 650),
  ('Synth Pop', 'synth-pop', 'genre', 660),
  ('K-Pop', 'k-pop', 'genre', 670),
  ('Latin Pop', 'latin-pop', 'genre', 680),
  ('Reggaeton', 'reggaeton', 'genre', 690),
  ('Salsa', 'salsa', 'genre', 700),
  ('Bachata', 'bachata', 'genre', 710),
  ('Merengue', 'merengue', 'genre', 720),
  ('Cumbia', 'cumbia', 'genre', 730),
  ('Tango', 'tango', 'genre', 740),
  ('Flamenco', 'flamenco', 'genre', 750),
  ('Classical', 'classical', 'genre', 760),
  ('Opera', 'opera', 'genre', 770),
  ('Piano', 'piano', 'genre', 780),
  ('Orchestral', 'orchestral', 'genre', 790),
  ('Ambient', 'ambient', 'genre', 800),
  ('Chillout', 'chillout', 'genre', 810),
  ('Lo-fi', 'lo-fi', 'genre', 820),
  ('Downtempo', 'downtempo', 'genre', 830),
  ('House', 'house', 'genre', 840),
  ('Deep House', 'deep-house', 'genre', 850),
  ('Tech House', 'tech-house', 'genre', 860),
  ('Techno', 'techno', 'genre', 870),
  ('Trance', 'trance', 'genre', 880),
  ('EDM', 'edm', 'genre', 890),
  ('Drum and Bass', 'drum-and-bass', 'genre', 900),
  ('Garage', 'garage', 'genre', 910),
  ('Dubstep', 'dubstep', 'genre', 920),
  ('Grime', 'grime', 'genre', 930),
  ('World Music', 'world-music', 'genre', 940),
  ('Traditional African', 'traditional-african', 'genre', 950),
  ('Caribbean', 'caribbean', 'genre', 960),
  ('Indian Classical', 'indian-classical', 'genre', 970),
  ('Bollywood', 'bollywood', 'genre', 980),
  ('Arabic Music', 'arabic-music', 'genre', 990),
  ('Mediterranean', 'mediterranean', 'genre', 1000),

  -- Moods
  ('Rainy Night', 'rainy-night', 'mood', 2010),
  ('Deep Reflection', 'deep-reflection', 'mood', 2020),
  ('Healing', 'healing', 'mood', 2030),
  ('Heartbreak', 'heartbreak', 'mood', 2040),
  ('Hope', 'hope', 'mood', 2050),
  ('Spiritual', 'spiritual', 'mood', 2060),
  ('Luxury Lounge', 'luxury-lounge', 'mood', 2070),
  ('Late Night Drive', 'late-night-drive', 'mood', 2080),
  ('Sunday Morning', 'sunday-morning', 'mood', 2090),
  ('Motivation', 'motivation', 'mood', 2100),
  ('Romantic', 'romantic', 'mood', 2110),
  ('Dark Cinematic', 'dark-cinematic', 'mood', 2120),
  ('Peaceful', 'peaceful', 'mood', 2130),
  ('Nostalgic', 'nostalgic', 'mood', 2140),
  ('Focused Work', 'focused-work', 'mood', 2150),
  ('Sleep', 'sleep', 'mood', 2160),
  ('Prayer', 'prayer', 'mood', 2170),
  ('Celebration', 'celebration', 'mood', 2180),
  ('Freedom', 'freedom', 'mood', 2190),
  ('African Heritage', 'african-heritage', 'mood', 2200),
  ('Black Excellence', 'black-excellence', 'mood', 2210),

  -- Formats
  ('Official Music Videos', 'official-music-videos', 'format', 3010),
  ('Live Performances', 'live-performances', 'format', 3020),
  ('Full Concerts', 'full-concerts', 'format', 3030),
  ('Studio Sessions', 'studio-sessions', 'format', 3040),
  ('Acoustic Sessions', 'acoustic-sessions', 'format', 3050),
  ('Visualizers', 'visualizers', 'format', 3060),
  ('Lyric Videos', 'lyric-videos', 'format', 3070),
  ('Artist Interviews', 'artist-interviews', 'format', 3080),
  ('Behind The Scenes', 'behind-the-scenes', 'format', 3090),
  ('Documentaries', 'documentaries', 'format', 3100),
  ('Biographies', 'biographies', 'format', 3110),
  ('Music History', 'music-history', 'format', 3120),
  ('Dance Videos', 'dance-videos', 'format', 3130),
  ('DJ Sets', 'dj-sets', 'format', 3140),
  ('Radio Shows', 'radio-shows', 'format', 3150),
  ('Podcasts', 'podcasts', 'format', 3160),
  ('Public Domain Films', 'public-domain-films', 'format', 3170),
  ('Classic Cinema', 'classic-cinema', 'format', 3180),
  ('Short Films', 'short-films', 'format', 3190),
  ('Culture Shows', 'culture-shows', 'format', 3200),
  ('Faith Programs', 'faith-programs', 'format', 3210),
  ('News/Culture Channels', 'news-culture-channels', 'format', 3220),
  ('Ambient Visual TV', 'ambient-visual-tv', 'format', 3230),

  -- Collections (curated browse rails)
  ('Featured African Voices', 'featured-african-voices', 'collection', 4010),
  ('Gospel & Worship Hour', 'gospel-worship-hour', 'collection', 4020),
  ('Late Night Lounge', 'late-night-lounge', 'collection', 4030),
  ('Sunday Morning Calm', 'sunday-morning-calm', 'collection', 4040),
  ('Live Stage Energy', 'live-stage-energy', 'collection', 4050),
  ('Studio & Acoustic Gems', 'studio-acoustic-gems', 'collection', 4060),
  ('Diaspora Stories', 'diaspora-stories', 'collection', 4070),
  ('Heritage & History', 'heritage-history', 'collection', 4080),
  ('DJ & Club Culture', 'dj-club-culture', 'collection', 4090),
  ('Public Domain Classics', 'public-domain-classics', 'collection', 4100)
on conflict (slug) do nothing;
