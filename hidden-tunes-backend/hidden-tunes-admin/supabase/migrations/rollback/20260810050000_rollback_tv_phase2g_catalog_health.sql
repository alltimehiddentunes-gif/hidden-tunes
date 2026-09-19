-- Rollback for the unapplied Phase 2G additive foundation. Never run after activation without exporting rollback evidence.
drop table if exists public.tv_recovery_queue;drop table if exists public.tv_source_health_events;drop table if exists public.tv_playback_sources;drop table if exists public.tv_canonical_channels;
