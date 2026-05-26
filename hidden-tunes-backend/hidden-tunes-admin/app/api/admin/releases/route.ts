import { NextRequest, NextResponse } from "next/server";

import { canEditAllTrackLyrics } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import {
  buildReleaseHealthSummary,
  loadLyricsHealthMaps,
  type ReleaseHealthLyricsInput,
  type ReleaseHealthSyncedInput,
} from "@/lib/releaseHealth";
import {
  getSupabaseErrorMessage,
  isMissingSchemaColumnError,
} from "@/lib/supabaseErrors";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlbumRow = Record<string, string | number | null | undefined>;
type SongRow = Record<string, string | number | boolean | null | undefined>;
type UploaderRow = Record<string, string | null | undefined>;
type SortMode = "newest" | "oldest" | "title_asc" | "title_desc";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function albumSelectColumns(includeRightsColumns: boolean) {
  const columns = [
    "id",
    "title",
    "slug",
    "artist_id",
    "artwork_url",
    "release_year",
    "created_at",
    "uploaded_by_user_id",
  ];

  if (includeRightsColumns) {
    columns.push(
      "review_status",
      "license_declaration",
      "copyright_scan_status",
      "duplicate_scan_status"
    );
  }

  return columns.join(",");
}

const SONG_COLUMNS_CORE =
  "id,album_id,title,genre,audio_url,url,artwork_url,cover_url,has_lyrics,lyrics_url,duration,created_at,uploaded_by_user_id";

const SONG_COLUMNS_EXTENDED =
  "id,album_id,title,genre,mood,audio_url,url,artwork_url,cover_url,has_lyrics,lyrics_url,lyrics_type,duration,duration_seconds,created_at,uploaded_by_user_id";

type AlbumListQueryContext = {
  reviewStatus: string | null;
  licenseDeclaration: string | null;
  scanFilter: string | null;
  uploaderId: string | null;
  uploaderSongAlbumIds: string[];
  uploaderSearch: string | null;
  searchQuery: string;
  sort: SortMode;
};

type AlbumSearchLookups = {
  uploaderSearchIds: string[] | null;
  searchArtistIds: string[];
  searchUploaderIds: string[];
};

function stringOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function emptyLyricsHealthMaps() {
  return {
    trackLyricsBySongId: new Map<string, ReleaseHealthLyricsInput>(),
    syncedLyricsBySongId: new Map<string, ReleaseHealthSyncedInput>(),
  };
}

function formatPostgrestUuidList(ids: string[]) {
  const quoted = ids
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .map((id) => `"${id.replace(/"/g, "")}"`);

  return `(${quoted.join(",")})`;
}

function logReleasesQueryStart(
  stepName: string,
  meta: Record<string, unknown> = {}
) {
  console.log("[admin/releases] running query", stepName, meta);
}

function logReleasesQuerySuccess(
  stepName: string,
  meta: Record<string, unknown> = {}
) {
  console.log("[admin/releases] query success", stepName, meta);
}

function logReleasesQueryError(stepName: string, error: unknown) {
  console.error("[admin/releases] query failed", stepName, error);
}

async function runReleasesSupabaseStep<T extends {
  data: unknown;
  error: unknown;
  count?: number | null;
}>(stepName: string, meta: Record<string, unknown>, run: () => Promise<T>): Promise<T> {
  logReleasesQueryStart(stepName, meta);
  const result = await run();

  if (result.error) {
    logReleasesQueryError(stepName, result.error);
  } else {
    logReleasesQuerySuccess(stepName, {
      rowCount: Array.isArray(result.data) ? result.data.length : null,
      count: result.count ?? null,
    });
  }

  return result;
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

function hasRightsFilters(context: AlbumListQueryContext) {
  return Boolean(
    context.reviewStatus ||
      context.licenseDeclaration ||
      (context.scanFilter &&
        context.scanFilter !== "all" &&
        context.scanFilter !== "")
  );
}

async function loadMatchingArtistIds(searchQuery: string) {
  const { data, error } = await runReleasesSupabaseStep(
    "search_artists_by_name",
    { searchQuery },
    async () =>
      await supabaseAdmin
        .from("artists")
        .select("id")
        .ilike("name", `%${searchQuery}%`)
        .limit(200)
  );

  if (error) throw error;

  return ((data || []) as unknown as AlbumRow[])
    .map((artist) => String(artist.id || ""))
    .filter(Boolean);
}

async function loadMatchingUploaderIds(searchQuery: string) {
  const { data, error } = await runReleasesSupabaseStep(
    "search_uploaders_by_email",
    { searchQuery },
    async () =>
      await supabaseAdmin
        .from("uploader_profiles")
        .select("id")
        .ilike("email", `%${searchQuery}%`)
        .limit(200)
  );

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

  const { data, error } = await runReleasesSupabaseStep(
    "uploader_profiles_by_ids",
    { idCount: uniqueIds.length },
    async () =>
      await supabaseAdmin
        .from("uploader_profiles")
        .select("id, email, role, status")
        .in("id", uniqueIds)
  );

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

  const { data, error } = await runReleasesSupabaseStep(
    "uploader_owned_album_ids",
    { uploaderId },
    async () =>
      await supabaseAdmin
        .from("songs")
        .select("album_id, uploaded_by_user_id")
        .eq("uploaded_by_user_id", uploaderId)
        .not("album_id", "is", null)
        .limit(1000)
  );

  if (error) throw error;

  return Array.from(
    new Set(
      ((data || []) as unknown as SongRow[])
        .map((song) => String(song.album_id || ""))
        .filter(Boolean)
    )
  );
}

async function loadAlbumSearchLookups(
  context: AlbumListQueryContext
): Promise<AlbumSearchLookups> {
  if (context.uploaderSearch) {
    const [uploaderSearchIds, searchArtistIds, searchUploaderIds] =
      await Promise.all([
        loadMatchingUploaderIds(context.uploaderSearch),
        context.searchQuery
          ? loadMatchingArtistIds(context.searchQuery)
          : Promise.resolve([] as string[]),
        context.searchQuery
          ? loadMatchingUploaderIds(context.searchQuery)
          : Promise.resolve([] as string[]),
      ]);

    return {
      uploaderSearchIds,
      searchArtistIds,
      searchUploaderIds,
    };
  }

  if (!context.searchQuery) {
    return {
      uploaderSearchIds: null,
      searchArtistIds: [],
      searchUploaderIds: [],
    };
  }

  const [searchArtistIds, searchUploaderIds] = await Promise.all([
    loadMatchingArtistIds(context.searchQuery),
    loadMatchingUploaderIds(context.searchQuery),
  ]);

  return {
    uploaderSearchIds: null,
    searchArtistIds,
    searchUploaderIds,
  };
}

function startAlbumListQuery(includeRightsColumns: boolean) {
  return supabaseAdmin
    .from("albums")
    .select(albumSelectColumns(includeRightsColumns), { count: "exact" });
}

type AlbumListQuery = ReturnType<typeof startAlbumListQuery>;

function applyAlbumListFilters(
  query: AlbumListQuery,
  context: AlbumListQueryContext,
  lookups: AlbumSearchLookups,
  includeRightsColumns: boolean
): AlbumListQuery {
  let filteredQuery: AlbumListQuery = query;

  if (includeRightsColumns) {
    const rightsQuery = filteredQuery as AlbumListQuery & {
      eq: (column: string, value: string) => AlbumListQuery;
    };

    if (context.reviewStatus) {
      filteredQuery = rightsQuery.eq("review_status", context.reviewStatus);
    }

    if (context.licenseDeclaration) {
      filteredQuery = (filteredQuery as typeof rightsQuery).eq(
        "license_declaration",
        context.licenseDeclaration
      );
    }

    if (context.scanFilter === "copyright_flagged") {
      filteredQuery = (filteredQuery as typeof rightsQuery).eq(
        "copyright_scan_status",
        "flagged"
      );
    } else if (context.scanFilter === "duplicate_flagged") {
      filteredQuery = (filteredQuery as typeof rightsQuery).eq(
        "duplicate_scan_status",
        "flagged"
      );
    } else if (context.scanFilter === "copyright_not_scanned") {
      filteredQuery = (filteredQuery as typeof rightsQuery).eq(
        "copyright_scan_status",
        "not_scanned"
      );
    } else if (context.scanFilter === "duplicate_not_scanned") {
      filteredQuery = (filteredQuery as typeof rightsQuery).eq(
        "duplicate_scan_status",
        "not_scanned"
      );
    }
  }

  if (context.uploaderId) {
    if (context.uploaderSongAlbumIds.length > 0) {
      filteredQuery = filteredQuery.or(
        `uploaded_by_user_id.eq.${context.uploaderId},id.in.${formatPostgrestUuidList(
          context.uploaderSongAlbumIds
        )}`
      );
    } else {
      filteredQuery = filteredQuery.eq(
        "uploaded_by_user_id",
        context.uploaderId
      );
    }
  }

  if (lookups.uploaderSearchIds !== null) {
    if (lookups.uploaderSearchIds.length === 0) {
      filteredQuery = filteredQuery.eq(
        "uploaded_by_user_id",
        "__no_matching_uploader__"
      );
    } else {
      filteredQuery = filteredQuery.in(
        "uploaded_by_user_id",
        lookups.uploaderSearchIds
      );
    }
  }

  if (context.searchQuery) {
    const escapedSearch = context.searchQuery.replace(/[%_]/g, "\\$&");
    const clauses = [`title.ilike.%${escapedSearch}%`];

    if (lookups.searchArtistIds.length > 0) {
      clauses.push(
        `artist_id.in.${formatPostgrestUuidList(lookups.searchArtistIds)}`
      );
    }

    if (lookups.searchUploaderIds.length > 0) {
      clauses.push(
        `uploaded_by_user_id.in.${formatPostgrestUuidList(lookups.searchUploaderIds)}`
      );
    }

    filteredQuery = filteredQuery.or(clauses.join(","));
  }

  return filteredQuery;
}

function applyAlbumListSort(query: AlbumListQuery, sort: SortMode) {
  if (sort === "oldest") {
    return query.order("created_at", { ascending: true });
  }

  if (sort === "title_asc") {
    return query.order("title", { ascending: true });
  }

  if (sort === "title_desc") {
    return query.order("title", { ascending: false });
  }

  return query.order("created_at", { ascending: false });
}

function describeAlbumListFilters(
  context: AlbumListQueryContext,
  lookups: AlbumSearchLookups,
  includeRightsColumns: boolean
) {
  const uploaderOrFilter =
    context.uploaderId && context.uploaderSongAlbumIds.length > 0
      ? `uploaded_by_user_id.eq.${context.uploaderId},id.in.${formatPostgrestUuidList(
          context.uploaderSongAlbumIds
        )}`
      : null;

  return {
    includeRightsColumns,
    sort: context.sort,
    reviewStatus: context.reviewStatus,
    licenseDeclaration: context.licenseDeclaration,
    scanFilter: context.scanFilter,
    uploaderId: context.uploaderId,
    uploaderSongAlbumIdsCount: context.uploaderSongAlbumIds.length,
    uploaderOrFilter,
    uploaderSearchIdsCount: lookups.uploaderSearchIds?.length ?? null,
    searchQuery: context.searchQuery || null,
    searchArtistIdsCount: lookups.searchArtistIds.length,
    searchUploaderIdsCount: lookups.searchUploaderIds.length,
  };
}

async function queryAlbumListPage(
  includeRightsColumns: boolean,
  context: AlbumListQueryContext,
  lookups: AlbumSearchLookups,
  from: number,
  to: number
) {
  const filterMeta = describeAlbumListFilters(context, lookups, includeRightsColumns);

  logReleasesQueryStart("album_list_chain_build", { ...filterMeta, from, to });

  const filteredQuery = applyAlbumListFilters(
    startAlbumListQuery(includeRightsColumns),
    context,
    lookups,
    includeRightsColumns
  );

  const sortedQuery = applyAlbumListSort(filteredQuery, context.sort);

  return runReleasesSupabaseStep(
    includeRightsColumns ? "album_list_page_rights" : "album_list_page_core",
    { ...filterMeta, from, to, order: context.sort },
    async () => await sortedQuery.range(from, to)
  );
}

async function fetchAlbumListPage(
  context: AlbumListQueryContext,
  from: number,
  to: number
) {
  logReleasesQueryStart("album_search_lookups", {
    searchQuery: context.searchQuery || null,
    uploaderSearch: context.uploaderSearch || null,
  });
  const lookups = await loadAlbumSearchLookups(context);
  logReleasesQuerySuccess("album_search_lookups", {
    uploaderSearchIdsCount: lookups.uploaderSearchIds?.length ?? null,
    searchArtistIdsCount: lookups.searchArtistIds.length,
    searchUploaderIdsCount: lookups.searchUploaderIds.length,
  });

  let result = await queryAlbumListPage(true, context, lookups, from, to);

  if (result.error && isMissingSchemaColumnError(result.error)) {
    logReleasesQueryStart("album_list_rights_fallback", {
      reason: "missing_schema_column",
    });

    if (hasRightsFilters(context)) {
      throw new Error(
        "Rights review columns are missing on albums. Apply migration 20260525130000_albums_rights_review_metadata.sql, then reload releases."
      );
    }

    result = await queryAlbumListPage(false, context, lookups, from, to);
  }

  if (result.error) throw result.error;

  return {
    data: (result.data || []) as unknown as AlbumRow[],
    count: result.count,
  };
}

async function loadSongsForAlbumIds(albumIds: string[]) {
  if (!albumIds.length) {
    return [] as SongRow[];
  }

  const extendedResult = await runReleasesSupabaseStep(
    "songs_by_album_ids_extended",
    { albumIdCount: albumIds.length },
    async () =>
      await supabaseAdmin
        .from("songs")
        .select(SONG_COLUMNS_EXTENDED)
        .in("album_id", albumIds)
  );

  if (!extendedResult.error) {
    return (extendedResult.data || []) as unknown as SongRow[];
  }

  if (!isMissingSchemaColumnError(extendedResult.error)) {
    throw extendedResult.error;
  }

  logReleasesQueryStart("songs_by_album_ids_core_fallback", {
    reason: "missing_schema_column",
    albumIdCount: albumIds.length,
  });

  const coreResult = await runReleasesSupabaseStep(
    "songs_by_album_ids_core",
    { albumIdCount: albumIds.length },
    async () =>
      await supabaseAdmin
        .from("songs")
        .select(SONG_COLUMNS_CORE)
        .in("album_id", albumIds)
  );

  if (coreResult.error) throw coreResult.error;

  return (coreResult.data || []) as unknown as SongRow[];
}

function logAdminReleasesGetFailure(
  error: unknown,
  context: {
    query: Record<string, string | number | boolean | null>;
    requester: {
      profileId: string;
      role: string | null;
      authUserId: string;
    } | null;
  }
) {
  const message =
    error instanceof Error
      ? error.message
      : getSupabaseErrorMessage(error, "Unknown error");

  const stack = error instanceof Error ? error.stack : undefined;

  const supabaseError =
    error && typeof error === "object"
      ? {
          ...(error as Record<string, unknown>),
          code:
            "code" in error
              ? String((error as { code?: unknown }).code || "")
              : undefined,
          details:
            "details" in error
              ? (error as { details?: unknown }).details
              : undefined,
          hint:
            "hint" in error ? (error as { hint?: unknown }).hint : undefined,
        }
      : null;

  console.error("[admin/releases] GET failed", {
    message,
    stack,
    supabaseError,
    query: context.query,
    requester: context.requester,
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let requester: {
    profileId: string;
    role: string | null;
    authUserId: string;
  } | null = null;

  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    requester = {
      profileId: permission.profile.id,
      role: permission.profile.role,
      authUserId: permission.user.id,
    };

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

    const albumQueryContext: AlbumListQueryContext = {
      reviewStatus,
      licenseDeclaration,
      scanFilter,
      uploaderId,
      uploaderSongAlbumIds,
      uploaderSearch,
      searchQuery,
      sort,
    };

    const {
      data: albums,
      count,
    } = await fetchAlbumListPage(albumQueryContext, from, to);

    if (uploaderId) {
      console.info("Admin releases uploader ownership filter", {
        requesterProfileId: permission.profile.id,
        requesterAuthUserId: permission.user.id,
        releaseFilterUploaderId: uploaderId,
        songOwnedAlbumIds: uploaderSongAlbumIds.length,
        returnedAlbums: albums.length,
      });
    }

    const albumRows = albums;
    const albumIds = albumRows
      .map((album) => String(album.id || ""))
      .filter(Boolean);
    const artistIds = albumRows
      .map((album) => String(album.artist_id || ""))
      .filter(Boolean);
    const uploaderIds = albumRows
      .map((album) => String(album.uploaded_by_user_id || ""))
      .filter(Boolean);

    logReleasesQueryStart("post_album_parallel_load", {
      albumCount: albumIds.length,
      artistIdCount: artistIds.length,
      uploaderIdCount: uploaderIds.length,
    });

    const [
      artistsResult,
      songRows,
      uploaderMap,
    ] = await Promise.all([
      artistIds.length
        ? runReleasesSupabaseStep(
            "artists_by_ids",
            { artistIdCount: artistIds.length },
            async () =>
              await supabaseAdmin
                .from("artists")
                .select("id, name, image_url")
                .in("id", artistIds)
          )
        : Promise.resolve({ data: [], error: null }),
      loadSongsForAlbumIds(albumIds),
      loadUploaderMap(uploaderIds),
    ]);

    const { data: artists, error: artistsError } = artistsResult;

    if (artistsError) throw artistsError;

    logReleasesQuerySuccess("post_album_parallel_load", {
      artistRowCount: Array.isArray(artists) ? artists.length : 0,
      songRowCount: songRows.length,
      uploaderMapSize: uploaderMap.size,
    });

    const artistMap = new Map(
      ((artists || []) as unknown as AlbumRow[]).map((artist) => [
        String(artist.id),
        artist,
      ])
    );
    const songIds = songRows
      .map((song) => String(song.id || ""))
      .filter(Boolean);
    logReleasesQueryStart("lyrics_health_maps", { songIdCount: songIds.length });

    let { trackLyricsBySongId, syncedLyricsBySongId } = emptyLyricsHealthMaps();

    try {
      const lyricsHealthMaps = await loadLyricsHealthMaps(songIds);
      trackLyricsBySongId = lyricsHealthMaps.trackLyricsBySongId;
      syncedLyricsBySongId = lyricsHealthMaps.syncedLyricsBySongId;

      logReleasesQuerySuccess("lyrics_health_maps", {
        songIdCount: songIds.length,
        trackLyricsCount: trackLyricsBySongId.size,
        syncedLyricsCount: syncedLyricsBySongId.size,
      });
    } catch (error: unknown) {
      console.warn("[admin/releases] lyrics_health_maps unavailable", {
        songIdCount: songIds.length,
        message:
          error instanceof Error
            ? error.message
            : getSupabaseErrorMessage(error, "Unknown lyrics health error"),
        stack: error instanceof Error ? error.stack : undefined,
        error,
      });
      logReleasesQueryError("lyrics_health_maps", error);
      ({ trackLyricsBySongId, syncedLyricsBySongId } = emptyLyricsHealthMaps());
    }

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
    const page = parsePositiveInteger(params.get("page"), 1);
    const pageSize = Math.min(
      parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );
    const mine =
      params.get("mine") === "1" || params.get("mine") === "true";
    let uploaderId = cleanFilter(params.get("uploaderId"));
    if (mine && requester && !canEditAllTrackLyrics(requester.role)) {
      uploaderId = requester.profileId;
    }

    logAdminReleasesGetFailure(error, {
      query: {
        page,
        pageSize,
        sort: parseSort(params.get("sort")),
        uploaderId,
        search: String(params.get("search") || "").trim() || null,
        status: cleanFilter(params.get("status")),
        license: cleanFilter(params.get("license")),
        scan: cleanFilter(params.get("scan")),
        mine,
        uploader: cleanFilter(params.get("uploader")),
      },
      requester,
    });

    const isDev = process.env.NODE_ENV !== "production";

    return NextResponse.json(
      {
        success: false,
        error: getSupabaseErrorMessage(error, "Failed to load releases."),
        ...(isDev
          ? {
              details:
                error && typeof error === "object"
                  ? error
                  : { message: String(error) },
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
