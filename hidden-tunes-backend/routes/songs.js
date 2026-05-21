import express from "express";
import { supabase } from "../services/supabase.js";
import {
  createRequestTimer,
  isInvalidUuidFilterError,
  isRelationEmbedError,
  logApiError,
  logApiRequest,
  logApiSuccess,
  logApiWarning,
  logSupabaseError,
} from "../services/apiDiagnostics.js";
import { resolveAlbumFilter, resolveArtistFilter } from "../services/catalogResolvers.js";
import {
  escapeIlikePattern,
  normalizePagination,
  normalizeSongFilters,
} from "../services/queryGuards.js";
import { handleLyricsRequest } from "./lyrics.js";

const router = express.Router();

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

const PUBLIC_R2_BASE_URL =
  process.env.PUBLIC_R2_BASE_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
  process.env.R2_PUBLIC_URL ||
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  "";

const SONG_SELECT_WITH_RELATIONS = `
  id,
  title,
  slug,
  artist,
  artist_name,
  album,
  album_title,
  genre,
  mood,
  duration,
  duration_seconds,
  audio_url,
  url,
  cover_url,
  artwork_url,
  source_type,
  type,
  artist_id,
  album_id,
  is_public,
  created_at,
  artists (
    id,
    name,
    slug,
    image_url
  ),
  albums (
    id,
    title,
    slug,
    cover_url,
    artwork_url
  )
`;

const SONG_SELECT_LITE = `
  id,
  title,
  slug,
  artist,
  artist_name,
  album,
  album_title,
  genre,
  mood,
  duration,
  duration_seconds,
  audio_url,
  url,
  cover_url,
  artwork_url,
  source_type,
  type,
  artist_id,
  album_id,
  is_public,
  created_at
`;

function isFullUrl(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("https://") || value.startsWith("http://"))
  );
}

function cleanPath(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+/, "");
}

function makePublicUrl(value, fallback = null) {
  if (!value) return fallback;

  const clean = String(value).trim();
  if (!clean) return fallback;

  if (isFullUrl(clean)) return clean;
  if (!PUBLIC_R2_BASE_URL) return fallback;

  return `${PUBLIC_R2_BASE_URL.replace(/\/+$/, "")}/${cleanPath(clean)}`;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeSong(row) {
  if (!row || typeof row !== "object") return null;

  const artists = asObject(row.artists);
  const albums = asObject(row.albums);

  const artwork =
    makePublicUrl(
      row.cover_url ||
        row.artwork_url ||
        albums?.cover_url ||
        albums?.artwork_url ||
        artists?.image_url,
      FALLBACK_COVER
    ) || FALLBACK_COVER;

  const audioUrl = makePublicUrl(row.audio_url || row.url, null);

  return {
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug || null,

    artist: row.artist || row.artist_name || artists?.name || "Unknown Artist",
    artist_name:
      row.artist_name || row.artist || artists?.name || "Unknown Artist",

    artistId: row.artist_id || artists?.id || null,
    artist_id: row.artist_id || artists?.id || null,

    album: row.album || row.album_title || albums?.title || "Singles",
    album_title: row.album_title || row.album || albums?.title || "Singles",

    albumId: row.album_id || albums?.id || null,
    album_id: row.album_id || albums?.id || null,

    genre: row.genre || null,
    mood: row.mood || null,

    duration: row.duration_seconds || row.duration || 0,
    duration_seconds: row.duration_seconds || row.duration || 0,

    url: audioUrl,
    audio_url: audioUrl,
    streamUrl: audioUrl,
    stream_url: audioUrl,

    artwork,
    cover: artwork,
    cover_url: artwork,
    thumbnail: artwork,

    sourceName: "Hidden Tunes",
    source_name: "Hidden Tunes",

    type: row.type || "r2",
    source_type: row.source_type || row.type || "r2",

    isOnline: true,
    is_online: true,
    is_public: row.is_public ?? true,

    created_at: row.created_at || null,

    artists: artists || null,
    albums: albums || null,
  };
}

function buildSongRequest({
  selectClause,
  limit,
  offset,
  filters,
  resolvedAlbum,
  resolvedArtist,
}) {
  let request = supabase
    .from("songs")
    .select(selectClause)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.search) {
    const pattern = escapeIlikePattern(filters.search);

    request = request.or(
      `title.ilike.%${pattern}%,artist.ilike.%${pattern}%,artist_name.ilike.%${pattern}%,album.ilike.%${pattern}%,album_title.ilike.%${pattern}%,genre.ilike.%${pattern}%,mood.ilike.%${pattern}%`
    );
  }

  if (resolvedArtist.artistIds.length === 1) {
    request = request.eq("artist_id", resolvedArtist.artistIds[0]);
  } else if (resolvedArtist.artistIds.length > 1) {
    request = request.in("artist_id", resolvedArtist.artistIds);
  } else if (resolvedArtist.textFallback) {
    const pattern = escapeIlikePattern(resolvedArtist.textFallback);
    request = request.or(
      `artist.ilike.%${pattern}%,artist_name.ilike.%${pattern}%`
    );
  }

  if (resolvedAlbum.albumIds.length === 1) {
    request = request.eq("album_id", resolvedAlbum.albumIds[0]);
  } else if (resolvedAlbum.albumIds.length > 1) {
    request = request.in("album_id", resolvedAlbum.albumIds);
  } else if (resolvedAlbum.textFallback) {
    const pattern = escapeIlikePattern(resolvedAlbum.textFallback);
    request = request.or(
      `album.ilike.%${pattern}%,album_title.ilike.%${pattern}%`
    );
  } else if (filters.albumId && resolvedAlbum.resolvedBy === "not_found") {
    return null;
  }

  if (filters.genre) {
    const pattern = escapeIlikePattern(filters.genre);
    request = request.or(`genre.ilike.%${pattern}%,mood.ilike.%${pattern}%`);
  }

  return request;
}

async function fetchSongsWithFallback(queryContext) {
  const fullRequest = buildSongRequest({
    ...queryContext,
    selectClause: SONG_SELECT_WITH_RELATIONS,
  });

  if (!fullRequest) {
    return {
      data: [],
      error: null,
      selectMode: "skipped_unresolved_album",
    };
  }

  const fullResult = await fullRequest;

  if (!fullResult.error) {
    return {
      data: fullResult.data || [],
      error: null,
      selectMode: "relations",
    };
  }

  logSupabaseError("GET /api/songs", fullResult.error, {
    selectMode: "relations",
    filters: queryContext.filters,
  });

  if (
    !isRelationEmbedError(fullResult.error) &&
    !isInvalidUuidFilterError(fullResult.error)
  ) {
    return {
      data: [],
      error: fullResult.error,
      selectMode: "relations_failed",
    };
  }

  logApiWarning("GET /api/songs", {
    warning: "relations_fallback_to_lite_select",
    message: fullResult.error.message,
  });

  const liteRequest = buildSongRequest({
    ...queryContext,
    selectClause: SONG_SELECT_LITE,
  });

  if (!liteRequest) {
    return {
      data: [],
      error: null,
      selectMode: "skipped_unresolved_album",
    };
  }

  const liteResult = await liteRequest;

  if (!liteResult.error) {
    return {
      data: liteResult.data || [],
      error: null,
      selectMode: "lite",
    };
  }

  logSupabaseError("GET /api/songs", liteResult.error, {
    selectMode: "lite",
    filters: queryContext.filters,
  });

  if (isInvalidUuidFilterError(liteResult.error)) {
    logApiWarning("GET /api/songs", {
      warning: "invalid_uuid_filter_returning_empty_array",
      filters: queryContext.filters,
    });

    return {
      data: [],
      error: null,
      selectMode: "empty_invalid_uuid_guard",
    };
  }

  return {
    data: [],
    error: liteResult.error,
    selectMode: "lite_failed",
  };
}

router.get("/", async (req, res) => {
  const timer = createRequestTimer();

  const pagination = normalizePagination(req.query);
  const filters = normalizeSongFilters(req.query);

  logApiRequest("GET /api/songs", {
    filters,
    page: pagination.page,
    limit: pagination.limit,
    offset: pagination.offset,
  });

  try {
    const [resolvedAlbum, resolvedArtist] = await Promise.all([
      filters.albumId
        ? resolveAlbumFilter(filters.albumId, "GET /api/songs")
        : Promise.resolve({ albumIds: [], resolvedBy: null, textFallback: null }),
      filters.artistId
        ? resolveArtistFilter(filters.artistId, "GET /api/songs")
        : Promise.resolve({ artistIds: [], resolvedBy: null, textFallback: null }),
    ]);

    const fetchResult = await fetchSongsWithFallback({
      limit: pagination.limit,
      offset: pagination.offset,
      filters,
      resolvedAlbum,
      resolvedArtist,
    });

    if (fetchResult.error) {
      logApiError("GET /api/songs", {
        durationMs: timer.durationMs(),
        message: fetchResult.error.message,
        selectMode: fetchResult.selectMode,
      });

      return res.status(500).json({
        error: "Failed to fetch songs",
        details: fetchResult.error.message,
      });
    }

    const normalizedSongs = (fetchResult.data || [])
      .map(normalizeSong)
      .filter(Boolean);

    logApiSuccess("GET /api/songs", {
      durationMs: timer.durationMs(),
      resultCount: normalizedSongs.length,
      filters,
      page: pagination.page,
      limit: pagination.limit,
      offset: pagination.offset,
      selectMode: fetchResult.selectMode,
      albumResolvedBy: resolvedAlbum.resolvedBy,
      artistResolvedBy: resolvedArtist.resolvedBy,
      albumIds: resolvedAlbum.albumIds,
      artistIds: resolvedArtist.artistIds,
      usedAlbumTextFallback: Boolean(resolvedAlbum.textFallback),
      usedArtistTextFallback: Boolean(resolvedArtist.textFallback),
      cacheState: "live_query",
    });

    return res.json(normalizedSongs);
  } catch (error) {
    logApiError("GET /api/songs", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      filters,
    });

    return res.status(500).json({
      error: "Server error",
      details: error?.message || "Unknown server error",
    });
  }
});

router.get("/:id/lyrics", handleLyricsRequest);

export default router;
