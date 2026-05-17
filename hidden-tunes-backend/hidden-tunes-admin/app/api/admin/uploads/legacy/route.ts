import { NextRequest, NextResponse } from "next/server";

import { canManageUploaderOwnership } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlbumRow = Record<string, string | number | null | undefined>;
type SongRow = Record<string, string | number | boolean | null | undefined>;
type UploaderRow = Record<string, string | null | undefined>;

type AssignOwnershipBody = {
  releaseIds?: unknown;
  uploaderId?: unknown;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function latestDate(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) return null;

  return new Date(Math.max(...timestamps)).toISOString();
}

function mostCommonGenre(songs: SongRow[]) {
  const counts = new Map<string, number>();

  songs.forEach((song) => {
    const genre = String(song.genre || "").trim();
    if (!genre) return;
    counts.set(genre, (counts.get(genre) || 0) + 1);
  });

  return (
    Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  );
}

function normalizeReleaseIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0)
    )
  ).slice(0, 100);
}

async function requireOwnershipManager(request: NextRequest) {
  const permission = await requireUploadPermission(request);

  if (permission.errorResponse) {
    return {
      permission,
      errorResponse: permission.errorResponse,
    };
  }

  if (!canManageUploaderOwnership(permission.profile.role)) {
    return {
      permission,
      errorResponse: NextResponse.json(
        {
          success: false,
          error: "Only owners and admins can assign legacy upload ownership.",
        },
        { status: 403 }
      ),
    };
  }

  return {
    permission,
    errorResponse: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireOwnershipManager(request);

    if (errorResponse) return errorResponse;

    const [
      { data: albumLegacyRows, error: albumLegacyError },
      { data: songLegacyRows, error: songLegacyError },
      { data: uploaders, error: uploadersError },
    ] = await Promise.all([
      supabaseAdmin
        .from("albums")
        .select(
          "id,title,slug,artist_id,artwork_url,created_at,review_status,license_declaration"
        )
        .is("uploaded_by_user_id", null)
        .order("created_at", { ascending: false })
        .limit(150),
      supabaseAdmin
        .from("songs")
        .select("album_id")
        .is("uploaded_by_user_id", null)
        .not("album_id", "is", null)
        .limit(500),
      supabaseAdmin
        .from("uploader_profiles")
        .select("id,email,role,status")
        .eq("status", "active")
        .order("email", { ascending: true }),
    ]);

    if (albumLegacyError) throw albumLegacyError;
    if (songLegacyError) throw songLegacyError;
    if (uploadersError) throw uploadersError;

    const albumLegacy = (albumLegacyRows || []) as unknown as AlbumRow[];
    const songLegacyAlbumIds = Array.from(
      new Set(
        ((songLegacyRows || []) as unknown as SongRow[])
          .map((song) => String(song.album_id || ""))
          .filter(Boolean)
      )
    );

    const existingAlbumIds = new Set(albumLegacy.map((album) => String(album.id)));
    const albumIdsToHydrate = [
      ...albumLegacy.map((album) => String(album.id)),
      ...songLegacyAlbumIds.filter((albumId) => !existingAlbumIds.has(albumId)),
    ].filter(Boolean);

    const { data: hydratedAlbums, error: hydratedAlbumsError } =
      albumIdsToHydrate.length > 0
        ? await supabaseAdmin
            .from("albums")
            .select(
              "id,title,slug,artist_id,artwork_url,created_at,review_status,license_declaration"
            )
            .in("id", albumIdsToHydrate)
        : { data: [], error: null };

    if (hydratedAlbumsError) throw hydratedAlbumsError;

    const albumRows = (hydratedAlbums || []) as unknown as AlbumRow[];
    const albumIds = albumRows.map((album) => String(album.id)).filter(Boolean);
    const artistIds = albumRows
      .map((album) => String(album.artist_id || ""))
      .filter(Boolean);

    const [
      { data: artists, error: artistsError },
      { data: songs, error: songsError },
    ] = await Promise.all([
      artistIds.length
        ? supabaseAdmin
            .from("artists")
            .select("id,name,image_url")
            .in("id", artistIds)
        : Promise.resolve({ data: [], error: null }),
      albumIds.length
        ? supabaseAdmin
            .from("songs")
            .select(
              "id,album_id,title,genre,created_at,artwork_url,cover_url,uploaded_by_user_id"
            )
            .in("album_id", albumIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (artistsError) throw artistsError;
    if (songsError) throw songsError;

    const artistMap = new Map(
      ((artists || []) as unknown as AlbumRow[]).map((artist) => [
        String(artist.id),
        artist,
      ])
    );
    const songRows = (songs || []) as unknown as SongRow[];

    const releases = albumRows
      .map((album) => {
        const releaseSongs = songRows.filter(
          (song) => String(song.album_id || "") === String(album.id)
        );
        const artist = artistMap.get(String(album.artist_id || ""));
        const artworkSong = releaseSongs.find((song) =>
          Boolean(song.artwork_url || song.cover_url)
        );

        return {
          id: album.id,
          title: album.title || "Untitled Release",
          artist: artist?.name || "Unknown Artist",
          artworkUrl:
            album.artwork_url ||
            artworkSong?.artwork_url ||
            artworkSong?.cover_url ||
            artist?.image_url ||
            null,
          trackCount: releaseSongs.length,
          primaryGenre: mostCommonGenre(releaseSongs),
          createdAt: album.created_at || null,
          updatedAt:
            latestDate(releaseSongs.map((song) => String(song.created_at || ""))) ||
            String(album.created_at || "") ||
            null,
          reviewStatus: album.review_status || null,
          licenseDeclaration: album.license_declaration || null,
          currentOwner: "Unknown uploader",
          nullOwnedTrackCount: releaseSongs.filter(
            (song) => !song.uploaded_by_user_id
          ).length,
        };
      })
      .sort(
        (a, b) =>
          new Date(String(b.updatedAt || b.createdAt || 0)).getTime() -
          new Date(String(a.updatedAt || a.createdAt || 0)).getTime()
      );

    return NextResponse.json({
      success: true,
      releases,
      uploaders: ((uploaders || []) as unknown as UploaderRow[]).map((uploader) => ({
        id: uploader.id,
        email: uploader.email,
        role: uploader.role,
        status: uploader.status,
      })),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load legacy uploads."),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { errorResponse } = await requireOwnershipManager(request);

    if (errorResponse) return errorResponse;

    const body = (await request.json()) as AssignOwnershipBody;
    const releaseIds = normalizeReleaseIds(body.releaseIds);
    const uploaderId = String(body.uploaderId || "").trim();

    if (releaseIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Select at least one legacy release." },
        { status: 400 }
      );
    }

    if (!uploaderId) {
      return NextResponse.json(
        { success: false, error: "Select an uploader." },
        { status: 400 }
      );
    }

    const { data: uploader, error: uploaderError } = await supabaseAdmin
      .from("uploader_profiles")
      .select("id,email,role,status")
      .eq("id", uploaderId)
      .maybeSingle();

    if (uploaderError) throw uploaderError;

    if (!uploader) {
      return NextResponse.json(
        { success: false, error: "Uploader profile not found." },
        { status: 404 }
      );
    }

    const { data: updatedAlbums, error: albumsError } = await supabaseAdmin
      .from("albums")
      .update({ uploaded_by_user_id: uploaderId })
      .in("id", releaseIds)
      .is("uploaded_by_user_id", null)
      .select("id");

    if (albumsError) throw albumsError;

    const { data: updatedSongs, error: songsError } = await supabaseAdmin
      .from("songs")
      .update({ uploaded_by_user_id: uploaderId })
      .in("album_id", releaseIds)
      .is("uploaded_by_user_id", null)
      .select("id");

    if (songsError) throw songsError;

    return NextResponse.json({
      success: true,
      message: `Assigned ${releaseIds.length} legacy releases to ${
        (uploader as UploaderRow).email || "selected uploader"
      }.`,
      uploader: {
        id: (uploader as UploaderRow).id,
        email: (uploader as UploaderRow).email,
        role: (uploader as UploaderRow).role,
      },
      updatedAlbumCount: updatedAlbums?.length || 0,
      updatedSongCount: updatedSongs?.length || 0,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to assign ownership."),
      },
      { status: 500 }
    );
  }
}
