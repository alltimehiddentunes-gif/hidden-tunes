import { canEditAllTrackLyrics } from "@/lib/adminPermissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CreatorLyricsCatalogTrack = {
  trackId: string;
  releaseId: string;
  trackTitle: string;
  artistName: string;
  albumTitle: string;
  artworkUrl: string | null;
};

type SongRow = {
  id: string;
  album_id: string | null;
  title: string | null;
  artist?: string | null;
  artist_name?: string | null;
  album?: string | null;
  album_title?: string | null;
  artwork_url?: string | null;
  cover_url?: string | null;
  uploaded_by_user_id: string | null;
};

type AlbumRow = {
  id: string;
  title: string | null;
  artist_id?: string | null;
};

async function loadOwnedSongIds(userId: string) {
  const ownedIds = new Set<string>();

  const [ownedSongs, ownedAlbums, artistPublished] = await Promise.all([
    supabaseAdmin.from("songs").select("id").eq("uploaded_by_user_id", userId),
    supabaseAdmin.from("albums").select("id").eq("uploaded_by_user_id", userId),
    supabaseAdmin
      .from("artist_submissions")
      .select("published_song_id")
      .eq("artist_user_id", userId)
      .not("published_song_id", "is", null),
  ]);

  if (ownedSongs.error) throw ownedSongs.error;
  if (ownedAlbums.error) throw ownedAlbums.error;
  if (artistPublished.error) throw artistPublished.error;

  (ownedSongs.data || []).forEach((row) => {
    const id = String((row as { id?: string }).id || "");
    if (id) ownedIds.add(id);
  });

  (artistPublished.data || []).forEach((row) => {
    const id = String((row as { published_song_id?: string }).published_song_id || "");
    if (id) ownedIds.add(id);
  });

  const albumIds = ((ownedAlbums.data || []) as Array<{ id?: string }>)
    .map((album) => String(album.id || ""))
    .filter(Boolean);

  if (albumIds.length) {
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select("id")
      .in("album_id", albumIds);

    if (error) throw error;

    (data || []).forEach((row) => {
      const id = String((row as { id?: string }).id || "");
      if (id) ownedIds.add(id);
    });
  }

  return Array.from(ownedIds);
}

async function loadEditableSongs(userId: string, role: string | null) {
  const selectFields =
    "id, album_id, title, artist, artist_name, album, album_title, artwork_url, cover_url, uploaded_by_user_id";

  if (canEditAllTrackLyrics(role)) {
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select(selectFields)
      .not("album_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) throw error;
    return (data || []) as SongRow[];
  }

  const ownedSongIds = await loadOwnedSongIds(userId);
  if (!ownedSongIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("songs")
    .select(selectFields)
    .in("id", ownedSongIds)
    .not("album_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as SongRow[];
}

export async function loadCreatorLyricsCatalog(userId: string, role: string | null) {
  const songs = await loadEditableSongs(userId, role);
  const albumIds = Array.from(
    new Set(songs.map((song) => String(song.album_id || "")).filter(Boolean))
  );

  const albumMap = new Map<string, AlbumRow>();
  const artistMap = new Map<string, string>();

  if (albumIds.length) {
    const { data: albums, error: albumsError } = await supabaseAdmin
      .from("albums")
      .select("id, title, artist_id")
      .in("id", albumIds);

    if (albumsError) throw albumsError;

    ((albums || []) as AlbumRow[]).forEach((album) => {
      albumMap.set(String(album.id), album);
    });

    const artistIds = Array.from(
      new Set(
        ((albums || []) as AlbumRow[])
          .map((album) => String(album.artist_id || ""))
          .filter(Boolean)
      )
    );

    if (artistIds.length) {
      const { data: artists, error: artistsError } = await supabaseAdmin
        .from("artists")
        .select("id, name")
        .in("id", artistIds);

      if (artistsError) throw artistsError;

      ((artists || []) as Array<{ id?: string; name?: string }>).forEach((artist) => {
        artistMap.set(String(artist.id), String(artist.name || "").trim());
      });
    }
  }

  return songs
    .map((song) => {
      const releaseId = String(song.album_id || "");
      const album = albumMap.get(releaseId);
      const artistFromAlbum = album?.artist_id
        ? artistMap.get(String(album.artist_id)) || ""
        : "";

      return {
        trackId: song.id,
        releaseId,
        trackTitle: String(song.title || "Untitled Track").trim(),
        artistName:
          String(song.artist || song.artist_name || artistFromAlbum || "Unknown Artist").trim(),
        albumTitle: String(song.album || song.album_title || album?.title || "Untitled Release").trim(),
        artworkUrl: song.artwork_url || song.cover_url || null,
      } satisfies CreatorLyricsCatalogTrack;
    })
    .filter((track) => track.releaseId && track.trackId);
}
