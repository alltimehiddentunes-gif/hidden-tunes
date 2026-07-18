-- Concerts grants for service_role (admin workers / supabaseAdmin).
-- Additive only.

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.concert_sources,
  public.concert_items,
  public.concert_streams,
  public.concert_artists,
  public.concert_item_artists,
  public.concert_categories,
  public.concert_item_categories,
  public.concert_validation_runs,
  public.concert_import_rejections,
  public.concert_item_aliases,
  public.concert_possible_duplicates,
  public.concert_playback_validation_prep,
  public.concert_playback_sessions,
  public.concert_worker_checkpoints,
  public.saved_concerts,
  public.concert_reminders,
  public.recently_watched_concerts,
  public.followed_concert_artists,
  public.concert_discovery_seeds,
  public.concert_scale_progress_snapshots
to service_role;

grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
