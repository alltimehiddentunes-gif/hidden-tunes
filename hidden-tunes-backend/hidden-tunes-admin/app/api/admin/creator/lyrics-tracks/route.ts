import { NextRequest, NextResponse } from "next/server";

import { canEditAllTrackLyrics } from "@/lib/adminPermissions";
import { requireCreatorLyricsPermission } from "@/lib/requireTrackLyricsPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SongRow = {
  id: string;
  album_id: string | null;
  title: string | null;
  has_lyrics: boolean | null;
  lyrics_type: string | null;
  uploaded_by_user_id: string | null;
  artwork_url?: string | null;
  cover_url?: string | null;
};

type AlbumRow = {
  id: string;
  title: string | null;
  uploaded_by_user_id: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

async function loadOwnedSongIds(userId: string) {
  const ownedIds = new Set<string>();

  const [ownedSongs, ownedAlbums, artistPublished] = await Promise.all([
    supabaseAdmin
      .from("songs")
      .select("id")
      .eq("uploaded_by_user_id", userId),
    supabaseAdmin
      .from("albums")
      .select("id")
      .eq("uploaded_by_user_id", userId),
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

async function loadEditableTracksForUser(userId: string, role: string | null) {
  if (canEditAllTrackLyrics(role)) {
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select(
        "id, album_id, title, has_lyrics, lyrics_type, uploaded_by_user_id, artwork_url, cover_url"
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return (data || []) as SongRow[];
  }

  const ownedSongIds = await loadOwnedSongIds(userId);
  if (!ownedSongIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("songs")
    .select(
      "id, album_id, title, has_lyrics, lyrics_type, uploaded_by_user_id, artwork_url, cover_url"
    )
    .in("id", ownedSongIds)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as SongRow[];
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requireCreatorLyricsPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const songs = await loadEditableTracksForUser(
      permission.profile.id,
      permission.profile.role
    );

    const albumIds = Array.from(
      new Set(
        songs
          .map((song) => String(song.album_id || ""))
          .filter(Boolean)
      )
    );

    const albumMap = new Map<string, AlbumRow>();

    if (albumIds.length) {
      const { data, error } = await supabaseAdmin
        .from("albums")
        .select("id, title, uploaded_by_user_id")
        .in("id", albumIds);

      if (error) throw error;

      ((data || []) as AlbumRow[]).forEach((album) => {
        albumMap.set(String(album.id), album);
      });
    }

    const tracks = songs
      .filter((song) => song.album_id)
      .map((song) => {
        const releaseId = String(song.album_id || "");
        const album = albumMap.get(releaseId);

        return {
          trackId: song.id,
          releaseId,
          trackTitle: song.title || "Untitled Track",
          releaseTitle: album?.title || "Untitled Release",
          hasLyrics: Boolean(song.has_lyrics),
          lyricsType: song.lyrics_type,
          artworkUrl: song.artwork_url || song.cover_url || null,
          plainLyricsPath: `/admin/releases/${releaseId}/tracks/${song.id}/lyrics`,
          syncedLyricsPath: `/admin/releases/${releaseId}/tracks/${song.id}/synced-lyrics`,
        };
      });

    return NextResponse.json({
      success: true,
      role: permission.profile.role,
      scope: canEditAllTrackLyrics(permission.profile.role) ? "all" : "owned",
      tracks,
      note:
        tracks.length === 0
          ? "No editable catalog tracks yet. Artists see published submission songs. Uploaders see releases they own."
          : null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load creator lyrics tracks."),
      },
      { status: 500 }
    );
  }
}
