import {
  buildReleaseHealthSummary,
  loadLyricsHealthMaps,
  type ReleaseHealthAlbumInput,
  type ReleaseHealthSummary,
} from "@/lib/releaseHealth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AlbumRow = Record<string, string | number | null | undefined>;
type SongRow = Record<string, string | number | boolean | null | undefined>;

export type UploaderAnalyticsSummary = {
  uploaderId: string;
  totalReleases: number;
  totalTracks: number;
  fullyReadyReleases: number;
  releasesMissingArtwork: number;
  tracksMissingAudio: number;
  plainLyricsReadyTracks: number;
  syncedLyricsReadyTracks: number;
  plainLyricsCompletionPercent: number;
  syncedLyricsCompletionPercent: number;
  reviewStatusCounts: Record<string, number>;
};

function text(value: unknown) {
  return String(value || "").trim();
}

function percent(ready: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((ready / total) * 100);
}

function reviewBucket(status: string | null) {
  return status || "not_set";
}

function releaseMissingArtwork(health: ReleaseHealthSummary) {
  const artwork = health.checks.find((check) => check.id === "artwork");
  return artwork?.status !== "present";
}

function aggregateHealthRows(
  uploaderId: string,
  rows: Array<{ album: AlbumRow; health: ReleaseHealthSummary }>
): UploaderAnalyticsSummary {
  const reviewStatusCounts: Record<string, number> = {};
  let totalTracks = 0;
  let fullyReadyReleases = 0;
  let releasesMissingArtwork = 0;
  let tracksMissingAudio = 0;
  let plainLyricsReadyTracks = 0;
  let syncedLyricsReadyTracks = 0;

  rows.forEach(({ health }) => {
    totalTracks += health.trackCount;

    if (health.score >= 100 && health.trackCount > 0) {
      fullyReadyReleases += 1;
    }

    if (releaseMissingArtwork(health)) {
      releasesMissingArtwork += 1;
    }

    tracksMissingAudio += Math.max(0, health.trackCount - health.audioReadyCount);
    plainLyricsReadyTracks += health.plainLyricsReadyCount;
    syncedLyricsReadyTracks += health.syncedLyricsReadyCount;

    const bucket = reviewBucket(health.reviewStatus);
    reviewStatusCounts[bucket] = (reviewStatusCounts[bucket] || 0) + 1;
  });

  return {
    uploaderId,
    totalReleases: rows.length,
    totalTracks,
    fullyReadyReleases,
    releasesMissingArtwork,
    tracksMissingAudio,
    plainLyricsReadyTracks,
    syncedLyricsReadyTracks,
    plainLyricsCompletionPercent: percent(plainLyricsReadyTracks, totalTracks),
    syncedLyricsCompletionPercent: percent(syncedLyricsReadyTracks, totalTracks),
    reviewStatusCounts,
  };
}

function emptySummary(uploaderId: string): UploaderAnalyticsSummary {
  return {
    uploaderId,
    totalReleases: 0,
    totalTracks: 0,
    fullyReadyReleases: 0,
    releasesMissingArtwork: 0,
    tracksMissingAudio: 0,
    plainLyricsReadyTracks: 0,
    syncedLyricsReadyTracks: 0,
    plainLyricsCompletionPercent: 0,
    syncedLyricsCompletionPercent: 0,
    reviewStatusCounts: {},
  };
}

async function loadAlbumIdsForUploader(uploaderId: string) {
  const albumIds = new Set<string>();

  const [{ data: ownedAlbums, error: ownedError }, { data: ownedSongs, error: songsError }] =
    await Promise.all([
      supabaseAdmin
        .from("albums")
        .select("id")
        .eq("uploaded_by_user_id", uploaderId),
      supabaseAdmin
        .from("songs")
        .select("album_id")
        .eq("uploaded_by_user_id", uploaderId)
        .not("album_id", "is", null),
    ]);

  if (ownedError) throw ownedError;
  if (songsError) throw songsError;

  ((ownedAlbums || []) as AlbumRow[]).forEach((album) => {
    const id = text(album.id);
    if (id) albumIds.add(id);
  });

  ((ownedSongs || []) as SongRow[]).forEach((song) => {
    const id = text(song.album_id);
    if (id) albumIds.add(id);
  });

  return Array.from(albumIds);
}

async function buildHealthRowsForAlbumIds(albumIds: string[]) {
  if (albumIds.length === 0) return [] as Array<{ album: AlbumRow; health: ReleaseHealthSummary }>;

  const [{ data: albums, error: albumsError }, { data: songs, error: songsError }] =
    await Promise.all([
      supabaseAdmin
        .from("albums")
        .select(
          "id,title,artist_id,artwork_url,release_year,uploaded_by_user_id,review_status"
        )
        .in("id", albumIds),
      supabaseAdmin
        .from("songs")
        .select(
          "id,album_id,title,genre,mood,audio_url,url,artwork_url,cover_url,has_lyrics,lyrics_url,lyrics_type"
        )
        .in("album_id", albumIds),
    ]);

  if (albumsError) throw albumsError;
  if (songsError) throw songsError;

  const albumRows = (albums || []) as AlbumRow[];
  const songRows = (songs || []) as SongRow[];
  const artistIds = albumRows
    .map((album) => text(album.artist_id))
    .filter(Boolean);

  const { data: artists, error: artistsError } = artistIds.length
    ? await supabaseAdmin.from("artists").select("id,name").in("id", artistIds)
    : { data: [], error: null };

  if (artistsError) throw artistsError;

  const artistMap = new Map(
    ((artists || []) as AlbumRow[]).map((artist) => [text(artist.id), text(artist.name)])
  );

  const songIds = songRows.map((song) => text(song.id)).filter(Boolean);
  const { trackLyricsBySongId, syncedLyricsBySongId } =
    await loadLyricsHealthMaps(songIds);

  return albumRows.map((album) => {
    const albumId = text(album.id);
    const releaseSongs = songRows.filter(
      (song) => text(song.album_id) === albumId
    );
    const artistName = artistMap.get(text(album.artist_id)) || null;

    const health = buildReleaseHealthSummary({
      album: album as ReleaseHealthAlbumInput,
      artistName,
      songs: releaseSongs,
      trackLyricsBySongId,
      syncedLyricsBySongId,
    });

    return { album, health };
  });
}

export async function computeUploaderAnalytics(
  uploaderId: string
): Promise<UploaderAnalyticsSummary> {
  const cleanedId = text(uploaderId);
  if (!cleanedId) return emptySummary(cleanedId);

  const albumIds = await loadAlbumIdsForUploader(cleanedId);
  const rows = await buildHealthRowsForAlbumIds(albumIds);
  return aggregateHealthRows(cleanedId, rows);
}

export async function computeAllUploaderAnalytics(
  uploaderIds: string[]
) {
  const uniqueIds = Array.from(new Set(uploaderIds.map((id) => text(id)).filter(Boolean)));
  const summaries = new Map<string, UploaderAnalyticsSummary>();

  uniqueIds.forEach((id) => summaries.set(id, emptySummary(id)));
  if (uniqueIds.length === 0) return summaries;

  const [{ data: albums, error: albumsError }, { data: songs, error: songsError }] =
    await Promise.all([
      supabaseAdmin
        .from("albums")
        .select(
          "id,title,artist_id,artwork_url,release_year,uploaded_by_user_id,review_status"
        )
        .in("uploaded_by_user_id", uniqueIds),
      supabaseAdmin
        .from("songs")
        .select(
          "id,album_id,title,genre,mood,audio_url,url,artwork_url,cover_url,has_lyrics,lyrics_url,lyrics_type,uploaded_by_user_id"
        )
        .in("uploaded_by_user_id", uniqueIds)
        .not("album_id", "is", null),
    ]);

  if (albumsError) throw albumsError;
  if (songsError) throw songsError;

  const uploaderAlbumIds = new Map<string, Set<string>>();

  uniqueIds.forEach((id) => uploaderAlbumIds.set(id, new Set()));

  ((albums || []) as AlbumRow[]).forEach((album) => {
    const uploaderId = text(album.uploaded_by_user_id);
    const albumId = text(album.id);
    if (!uploaderId || !albumId || !uploaderAlbumIds.has(uploaderId)) return;
    uploaderAlbumIds.get(uploaderId)?.add(albumId);
  });

  ((songs || []) as SongRow[]).forEach((song) => {
    const uploaderId = text(song.uploaded_by_user_id);
    const albumId = text(song.album_id);
    if (!uploaderId || !albumId || !uploaderAlbumIds.has(uploaderId)) return;
    uploaderAlbumIds.get(uploaderId)?.add(albumId);
  });

  const unionAlbumIds = Array.from(
    new Set(
      Array.from(uploaderAlbumIds.values()).flatMap((ids) => Array.from(ids))
    )
  );

  const allRows = await buildHealthRowsForAlbumIds(unionAlbumIds);
  const rowsByAlbumId = new Map(
    allRows.map((row) => [text(row.album.id), row])
  );

  uniqueIds.forEach((uploaderId) => {
    const albumIds = uploaderAlbumIds.get(uploaderId) || new Set();
    const rows = Array.from(albumIds)
      .map((albumId) => rowsByAlbumId.get(albumId))
      .filter((row): row is { album: AlbumRow; health: ReleaseHealthSummary } =>
        Boolean(row)
      );

    summaries.set(uploaderId, aggregateHealthRows(uploaderId, rows));
  });

  return summaries;
}
