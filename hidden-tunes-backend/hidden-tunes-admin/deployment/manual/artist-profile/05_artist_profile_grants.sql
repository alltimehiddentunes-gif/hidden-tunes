-- Applied during Phase 9 after infrastructure migration.
-- Grants SELECT to anon/authenticated/service_role; full DML to service_role;
-- follow insert/update/delete for authenticated (RLS enforces ownership).
BEGIN;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'artist_aliases','artist_external_ids','artist_images','artist_genres','artist_statistics',
    'artist_followers','artist_biography_sections','artist_external_links','artist_profile_sections',
    'artist_collaborations','artist_relationships','artist_similar_scores','artist_song_rankings',
    'artist_videos','artist_credits','artist_emotional_worlds','artist_related_content',
    'artist_merges','artist_claims','artist_audit_logs','artist_rights_availability'
  ] LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon, authenticated, service_role', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT INSERT, DELETE, UPDATE ON TABLE public.artist_followers TO authenticated;
GRANT INSERT, DELETE, UPDATE ON TABLE public.artist_followers TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
