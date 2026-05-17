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

type SupabaseLikeError = {
  message?: string;
  code?: string;
  hint?: string;
  details?: string;
};

type LegacyQueryName =
  | "legacy albums/releases query"
  | "unowned songs query"
  | "active uploaders query"
  | "legacy album hydration query"
  | "legacy artists query"
  | "legacy release songs query"
  | "legacy release songs fallback query"
  | "assign uploader lookup query"
  | "assign albums ownership query"
  | "assign songs ownership query";

function getSupabaseErrorDetails(error: unknown): SupabaseLikeError {
  if (!error || typeof error !== "object") {
    return {
      message: error instanceof Error ? error.message : String(error || ""),
    };
  }

  const value = error as SupabaseLikeError;

  return {
    message: value.message || "Unknown Supabase error.",
    code: value.code,
    hint: value.hint,
    details: value.details,
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;

  const details = getSupabaseErrorDetails(error);
  return details.message || fallback;
}

function logSupabaseQueryError(queryName: LegacyQueryName, error: unknown) {
  const details = getSupabaseErrorDetails(error);

  console.error("[legacy-uploads-api] Supabase query failed", {
    query: queryName,
    code: details.code || null,
    message: details.message || null,
    hint: details.hint || null,
    details: details.details || null,
  });
}

function safeClientErrorDetails(queryName: LegacyQueryName, error: unknown) {
  const details = getSupabaseErrorDetails(error);

  return {
    query: queryName,
    code: details.code || null,
    message: details.message || null,
    hint: details.hint || null,
  };
}

function legacyReadError(queryName: LegacyQueryName, error: unknown) {
  logSupabaseQueryError(queryName, error);

  return NextResponse.json(
    {
      success: false,
      error:
        "Unable to load legacy uploads because the server could not read albums/songs/uploader_profiles.",
      details: safeClientErrorDetails(queryName, error),
    },
    { status: 500 }
  );
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

function isMissingColumnError(error: unknown, columnName: string) {
  const details = getSupabaseErrorDetails(error);
  const text = `${details.message || ""} ${details.details || ""} ${
    details.hint || ""
  }`.toLowerCase();

  return text.includes(columnName.toLowerCase()) && text.includes("column");
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

async function loadLegacyReleaseSongs(albumIds: string[]) {
  if (albumIds.length === 0) {
    return {
      data: [] as SongRow[],
      errorResponse: null,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("songs")
    .select(
      "id,album_id,title,genre,created_at,artwork_url,cover_url,uploaded_by_user_id"
    )
    .in("album_id", albumIds);

  if (!error) {
    return {
      data: (data || []) as unknown as SongRow[],
      errorResponse: null,
    };
  }

  if (!isMissingColumnError(error, "cover_url")) {
    return {
      data: [] as SongRow[],
      errorResponse: legacyReadError("legacy release songs query", error),
    };
  }

  logSupabaseQueryError("legacy release songs query", error);
  console.warn(
    "[legacy-uploads-api] Retrying legacy release songs query without cover_url."
  );

  const fallback = await supabaseAdmin
    .from("songs")
    .select("id,album_id,title,genre,created_at,artwork_url,uploaded_by_user_id")
    .in("album_id", albumIds);

  if (fallback.error) {
    return {
      data: [] as SongRow[],
      errorResponse: legacyReadError(
        "legacy release songs fallback query",
        fallback.error
      ),
    };
  }

  return {
    data: (fallback.data || []) as unknown as SongRow[],
    errorResponse: null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireOwnershipManager(request);

    if (errorResponse) return errorResponse;

    const albumLegacyResult = await supabaseAdmin
      .from("albums")
      .select(
        "id,title,slug,artist_id,artwork_url,created_at,review_status,license_declaration"
      )
      .is("uploaded_by_user_id", null)
      .order("created_at", { ascending: false })
      .limit(150);

    if (albumLegacyResult.error) {
      return legacyReadError(
        "legacy albums/releases query",
        albumLegacyResult.error
      );
    }

    const songLegacyResult = await supabaseAdmin
      .from("songs")
      .select("album_id")
      .is("uploaded_by_user_id", null)
      .not("album_id", "is", null)
      .limit(500);

    if (songLegacyResult.error) {
      return legacyReadError("unowned songs query", songLegacyResult.error);
    }

    const uploadersResult = await supabaseAdmin
      .from("uploader_profiles")
      .select("id,email,role,status")
      .eq("status", "active")
      .order("email", { ascending: true });

    if (uploadersResult.error) {
      return legacyReadError("active uploaders query", uploadersResult.error);
    }

    const albumLegacy = (albumLegacyResult.data || []) as unknown as AlbumRow[];
    const songLegacyAlbumIds = Array.from(
      new Set(
        ((songLegacyResult.data || []) as unknown as SongRow[])
          .map((song) => String(song.album_id || ""))
          .filter(Boolean)
      )
    );

    const existingAlbumIds = new Set(albumLegacy.map((album) => String(album.id)));
    const albumIdsToHydrate = [
      ...albumLegacy.map((album) => String(album.id)),
      ...songLegacyAlbumIds.filter((albumId) => !existingAlbumIds.has(albumId)),
    ].filter(Boolean);

    const hydratedAlbumsResult =
      albumIdsToHydrate.length > 0
        ? await supabaseAdmin
            .from("albums")
            .select(
              "id,title,slug,artist_id,artwork_url,created_at,review_status,license_declaration"
            )
            .in("id", albumIdsToHydrate)
        : { data: [], error: null };

    if (hydratedAlbumsResult.error) {
      return legacyReadError(
        "legacy album hydration query",
        hydratedAlbumsResult.error
      );
    }

    const albumRows = (hydratedAlbumsResult.data || []) as unknown as AlbumRow[];
    const albumIds = albumRows.map((album) => String(album.id)).filter(Boolean);
    const artistIds = albumRows
      .map((album) => String(album.artist_id || ""))
      .filter(Boolean);

    const artistsResult =
      artistIds.length > 0
        ? await supabaseAdmin
            .from("artists")
            .select("id,name,image_url")
            .in("id", artistIds)
        : { data: [], error: null };

    if (artistsResult.error) {
      return legacyReadError("legacy artists query", artistsResult.error);
    }

    const releaseSongsResult = await loadLegacyReleaseSongs(albumIds);

    if (releaseSongsResult.errorResponse) {
      return releaseSongsResult.errorResponse;
    }

    const artistMap = new Map(
      ((artistsResult.data || []) as unknown as AlbumRow[]).map((artist) => [
        String(artist.id),
        artist,
      ])
    );
    const songRows = releaseSongsResult.data;

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
      uploaders: ((uploadersResult.data || []) as unknown as UploaderRow[]).map(
        (uploader) => ({
          id: uploader.id,
          email: uploader.email,
          role: uploader.role,
          status: uploader.status,
        })
      ),
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error, "Failed to load legacy uploads.");

    console.error("[legacy-uploads-api] Unexpected GET failure", {
      message,
    });

    return NextResponse.json(
      {
        success: false,
        error: "Failed to load legacy uploads.",
        details: {
          query: "unexpected GET failure",
          code: null,
          message,
          hint: null,
        },
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

    if (uploaderError) {
      logSupabaseQueryError("assign uploader lookup query", uploaderError);
      throw uploaderError;
    }

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

    if (albumsError) {
      logSupabaseQueryError("assign albums ownership query", albumsError);
      throw albumsError;
    }

    const { data: updatedSongs, error: songsError } = await supabaseAdmin
      .from("songs")
      .update({ uploaded_by_user_id: uploaderId })
      .in("album_id", releaseIds)
      .is("uploaded_by_user_id", null)
      .select("id");

    if (songsError) {
      logSupabaseQueryError("assign songs ownership query", songsError);
      throw songsError;
    }

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
