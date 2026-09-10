-- Reverses only the additive music taxonomy foundation.
-- Existing songs, source fields, rights, media, and playback data are untouched.

drop function if exists public.merge_music_taxonomy_term(uuid, uuid, uuid);
drop function if exists public.replace_music_track_classification(uuid, jsonb, jsonb, uuid);
drop table if exists public.music_track_legacy_metadata;
drop table if exists public.music_track_audio_features;
drop table if exists public.music_track_sources;
drop table if exists public.music_track_taxonomy;
drop table if exists public.music_taxonomy_aliases;
drop table if exists public.music_taxonomy_terms;
