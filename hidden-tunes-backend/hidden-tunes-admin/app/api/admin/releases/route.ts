import { NextRequest, NextResponse } from "next/server";

import { canEditAllTrackLyrics } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import {
  buildReleaseHealthSummary,
  loadLyricsHealthMaps,
} from "@/lib/releaseHealth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlbumRow = Record<string, string | number | null | undefined>;
type SongRow = Record<string, string | number | boolean | null | undefined>;
type UploaderRow = Record<string, string | null | undefined>;
type SortMode = "newest" | "oldest" | "title_asc" | "title_desc";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function stringOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.floor(parsed);
}

function cleanFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned && cleaned !== "all" ? cleaned : null;
}

function parseSort(value: string | null): SortMode {
  if (
    value === "oldest" ||
    value === "title_asc" ||
    value === "title_desc" ||
    value === "newest"
  ) {
    return value;
  }

  return "newest";
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

async function loadMatchingArtistIds(searchQuery: string) {
  const { data, error } = await supabaseAdmin
    .from("artists")
    .select("id")
    .ilike("name", `%${searchQuery}%`)
    .limit(200);

  if (error) throw error;

  return ((data || []) as unknown as AlbumRow[])
    .map((artist) => String(artist.id || ""))
    .filter(Boolean);
}

async function loadMatchingUploaderIds(searchQuery: string) {
  const { data, error } = await supabaseAdmin
    .from("uploader_profiles")
    .select("id")
    .ilike("email", `%${searchQuery}%`)
    .limit(200);

  if (error) throw error;

  return ((data || []) as unknown as UploaderRow[])
    .map((uploader) => String(uploader.id || ""))
    .filter(Boolean);
}

async function loadUploaderMap(uploaderIds: string[]) {
  const uniqueIds = Array.from(new Set(uploaderIds.filter(Boolean)));

  if (uniqueIds.length === 0) {
    return new Map<string, UploaderRow>();
  }

  const { data, error } = await supabaseAdmin
    .from("uploader_profiles")
    .select("id, email, role, status")
    .in("id", uniqueIds);

  if (error) throw error;

  return new Map(
    ((data || []) as unknown as UploaderRow[]).map((uploader) => [
      String(uploader.id),
      uploader,
    ])
  );
}

async function loadAlbumIdsForUploaderSongs(uploaderId: string) {
  if (!uploaderId) return [] as string[];

  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("album_id, uploaded_by_user_id")
    .eq("uploaded_by_user_id", uploaderId)
    .not("album_id", "is", null)
    .limit(1000);

  if (error) throw error;

  return Array.from(
    new Set(
      ((data || []) as unknown as SongRow[])
        .map((song) => String(song.album_id || ""))
        .filter(Boolean)
    )
  );
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const params = request.nextUrl.searchParams;
    const page = parsePositiveInteger(params.get("page"), 1);
    const pageSize = Math.min(
      parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );
    const searchQuery = String(params.get("search") || "").trim();
    const reviewStatus = cleanFilter(params.get("status"));
    const licenseDeclaration = cleanFilter(params.get("license"));
    const scanFilter = cleanFilter(params.get("scan"));
    const mine =
      params.get("mine") === "1" || params.get("mine") === "true";
    let uploaderId = cleanFilter(params.get("uploaderId"));
    if (mine && !canEditAllTrackLyrics(permission.profile.role)) {
      uploaderId = permission.profile.id;
    }
    const uploaderSearch = cleanFilter(params.get("uploader"));
    const sort = parseSort(params.get("sort"));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const uploaderSongAlbumIds = uploaderId
      ? await loadAlbumIdsForUploaderSongs(uploaderId)
      : [];

    let query = supabaseAdmin
      .from("albums")
      .select(
        [
          "id",
          "title",
          "slug",
          "artist_id",
          "artwork_url",
          "release_year",
          "created_at",
          "uploaded_by_user_id",
          "review_status",
          "license_declaration",
          "copyright_scan_status",
          "duplicate_scan_status",
        ].join(","),
        { count: "exact" }
      );

    if (reviewStatus) {
      query = query.eq("review_status", reviewStatus);
    }

    if (licenseDeclaration) {
      query = query.eq("license_declaration", licenseDeclaration);
    }

    if (uploaderId) {
      if (uploaderSongAlbumIds.length > 0) {
        query = query.or(
          `uploaded_by_user_id.eq.${uploaderId},id.in.(${uploaderSongAlbumIds.join(
            ","
          )})`
        );
      } else {
        query = query.eq("uploaded_by_user_id", uploaderId);
      }
    }

    if (uploaderSearch) {
      const matchingUploaderIds = await loadMatchingUploaderIds(uploaderSearch);
      if (matchingUploaderIds.length === 0) {
        query = query.eq("uploaded_by_user_id", "__no_matching_uploader__");
      } else {
        query = query.in("uploaded_by_user_id", matchingUploaderIds);
      }
    }

    if (scanFilter === "copyright_flagged") {
      query = query.eq("copyright_scan_status", "flagged");
    } else if (scanFilter === "duplicate_flagged") {
      query = query.eq("duplicate_scan_status", "flagged");
    } else if (scanFilter === "copyright_not_scanned") {
      query = query.eq("copyright_scan_status", "not_scanned");
    } else if (scanFilter === "duplicate_not_scanned") {
      query = query.eq("duplicate_scan_status", "not_scanned");
    }

    if (searchQuery) {
      const [matchingArtistIds, matchingUploaderIds] = await Promise.all([
        loadMatchingArtistIds(searchQuery),
        loadMatchingUploaderIds(searchQuery),
      ]);
      const escapedSearch = searchQuery.replace(/[%_]/g, "\\$&");
      const clauses = [`title.ilike.%${escapedSearch}%`];

      if (matchingArtistIds.length > 0) {
        clauses.push(`artist_id.in.(${matchingArtistIds.join(",")})`);
      }

      if (matchingUploaderIds.length > 0) {
        clauses.push(`uploaded_by_user_id.in.(${matchingUploaderIds.join(",")})`);
      }

      query = query.or(clauses.join(","));
    }

    if (sort === "oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (sort === "title_asc") {
      query = query.order("title", { ascending: true });
    } else if (sort === "title_desc") {
      query = query.order("title", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data: albums, error: albumsError, count } = await query.range(from, to);

    if (albumsError) throw albumsError;

    if (uploaderId) {
      console.info("Admin releases uploader ownership filter", {
        requesterProfileId: permission.profile.id,
        requesterAuthUserId: permission.user.id,
        releaseFilterUploaderId: uploaderId,
        songOwnedAlbumIds: uploaderSongAlbumIds.length,
        returnedAlbums: albums?.length || 0,
      });
    }

    const albumRows = (albums || []) as unknown as AlbumRow[];
    const albumIds = albumRows
      .map((album) => String(album.id || ""))
      .filter(Boolean);
    const artistIds = albumRows
      .map((album) => String(album.artist_id || ""))
      .filter(Boolean);
    const uploaderIds = albumRows
      .map((album) => String(album.uploaded_by_user_id || ""))
      .filter(Boolean);

    const [
      { data: artists, error: artistsError },
      { data: songs, error: songsError },
      uploaderMap,
    ] = await Promise.all([
      artistIds.length
        ? supabaseAdmin
            .from("artists")
            .select("id, name, image_url")
            .in("id", artistIds)
        : Promise.resolve({ data: [], error: null }),
      albumIds.length
        ? supabaseAdmin
            .from("songs")
            .select(
              "id,album_id,title,genre,mood,audio_url,url,artwork_url,cover_url,has_lyrics,lyrics_url,lyrics_type,duration,duration_seconds,created_at,uploaded_by_user_id"
            )
            .in("album_id", albumIds)
        : Promise.resolve({ data: [], error: null }),
      loadUploaderMap(uploaderIds),
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
    const songIds = songRows
      .map((song) => String(song.id || ""))
      .filter(Boolean);
    const { trackLyricsBySongId, syncedLyricsBySongId } =
      await loadLyricsHealthMaps(songIds);

    const releases = albumRows.map((album) => {
      const releaseSongs = songRows.filter(
        (song) => String(song.album_id || "") === String(album.id)
      );
      const firstSong = releaseSongs[0] || null;
      const artist = artistMap.get(String(album.artist_id || ""));
      const uploader = uploaderMap.get(String(album.uploaded_by_user_id || ""));
      const firstArtworkSong = releaseSongs.find((song) =>
        Boolean(song.artwork_url || song.cover_url)
      );
      const artworkUrl =
        album.artwork_url ||
        firstArtworkSong?.artwork_url ||
        firstArtworkSong?.cover_url ||
        artist?.image_url ||
        null;
      const totalDuration = releaseSongs.reduce(
        (total, song) =>
          total + Number(song.duration_seconds || song.duration || 0),
        0
      );
      const updatedAt =
        latestDate(releaseSongs.map((song) => String(song.created_at || ""))) ||
        String(album.created_at || "") ||
        null;
      const health = buildReleaseHealthSummary({
        album,
        artistName: artist?.name ? String(artist.name) : null,
        songs: releaseSongs,
        trackLyricsBySongId,
        syncedLyricsBySongId,
      });

      return {
        id: album.id,
        title: album.title || "Untitled Release",
        slug: album.slug || null,
        artist: artist?.name || "Unknown Artist",
        artworkUrl,
        releaseYear: album.release_year || null,
        createdAt: album.created_at || null,
        updatedAt,
        trackCount: releaseSongs.length,
        totalDuration,
        primaryGenre: mostCommonGenre(releaseSongs),
        primaryTrackId: firstSong?.id || null,
        audioReadyCount: releaseSongs.filter((song) =>
          Boolean(song.audio_url || song.url)
        ).length,
        artworkReadyCount: releaseSongs.filter((song) =>
          Boolean(song.artwork_url || song.cover_url)
        ).length,
        lyricsReadyCount: health.plainLyricsReadyCount,
        plainLyricsReadyCount: health.plainLyricsReadyCount,
        syncedLyricsReadyCount: health.syncedLyricsReadyCount,
        metadataReadyCount: health.metadataReadyCount,
        health,
        uploadedByUserId: stringOrNull(album.uploaded_by_user_id),
        uploaderEmail: uploader?.email || "Unknown uploader",
        uploaderRole: uploader?.role || null,
        reviewStatus: stringOrNull(album.review_status),
        licenseDeclaration: stringOrNull(album.license_declaration),
        copyrightScanStatus: stringOrNull(album.copyright_scan_status),
        duplicateScanStatus: stringOrNull(album.duplicate_scan_status),
      };
    });

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      success: true,
      releases,
      pagination: {
        page,
        pageSize,
        returned: releases.length,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load releases."),
      },
      { status: 500 }
    );
  }
}
