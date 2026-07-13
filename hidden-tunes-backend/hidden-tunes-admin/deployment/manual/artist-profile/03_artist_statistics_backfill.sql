-- Optional backfill: refresh artist_statistics from live catalog counts.
-- Run once after schema apply in maintenance window for large catalogs.

insert into public.artist_statistics (
  artist_id,
  song_count,
  release_count,
  single_count,
  video_count,
  follower_count,
  collaboration_count,
  refreshed_at
)
select
  a.id,
  coalesce(s.song_count, 0),
  coalesce(r.release_count, 0),
  coalesce(si.single_count, 0),
  coalesce(v.video_count, 0),
  coalesce(f.follower_count, 0),
  coalesce(c.collaboration_count, 0),
  now()
from public.artists a
left join lateral (
  select count(*)::int as song_count
  from public.songs s
  where s.artist_id = a.id and coalesce(s.is_public, true) = true
) s on true
left join lateral (
  select count(*)::int as release_count
  from public.albums al
  where al.artist_id = a.id
) r on true
left join lateral (
  select count(*)::int as single_count
  from public.songs s
  where s.artist_id = a.id and coalesce(s.is_public, true) = true and s.album_id is null
) si on true
left join lateral (
  select count(*)::int as video_count
  from public.artist_videos av
  where av.artist_id = a.id and av.is_published = true
) v on true
left join lateral (
  select count(*)::int as follower_count
  from public.artist_followers af
  where af.artist_id = a.id
) f on true
left join lateral (
  select count(*)::int as collaboration_count
  from public.artist_collaborations ac
  where ac.artist_id = a.id and ac.is_published = true
) c on true
on conflict (artist_id) do update set
  song_count = excluded.song_count,
  release_count = excluded.release_count,
  single_count = excluded.single_count,
  video_count = excluded.video_count,
  follower_count = excluded.follower_count,
  collaboration_count = excluded.collaboration_count,
  refreshed_at = excluded.refreshed_at;
