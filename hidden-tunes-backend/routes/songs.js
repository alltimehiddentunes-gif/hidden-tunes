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

const SEARCH_CANDIDATE_LIMIT = 500;
const SEARCH_TOKEN_LIMIT = 6;
const SEARCH_FIELDS = [
  "title",
  "artist",
  "artist_name",
  "album",
  "album_title",
  "genre",
  "mood",
];

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSongSearchQuery(value) {
  const phrase = normalizeSearchText(value);
  const tokens = phrase
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, SEARCH_TOKEN_LIMIT);

  return {
    phrase,
    tokens,
    importantTokens: tokens.filter((token) => token.length >= 3),
  };
}

function rowSearchValues(row) {
  const artists = asObject(row?.artists);
  const albums = asObject(row?.albums);

  return {
    title: normalizeSearchText(row?.title),
    artist: normalizeSearchText(row?.artist || row?.artist_name || artists?.name),
    album: normalizeSearchText(row?.album || row?.album_title || albums?.title),
    genre: normalizeSearchText(row?.genre),
    mood: normalizeSearchText(row?.mood),
    tags: normalizeSearchText(row?.tags),
    description: normalizeSearchText(row?.description || row?.lyrics),
  };
}

function songMatchesSearch(row, search) {
  if (!search.phrase) return true;

  const values = rowSearchValues(row);
  const haystack = Object.values(values).filter(Boolean).join(" ");

  if (Object.values(values).some((value) => value.includes(search.phrase))) {
    return true;
  }

  if (
    search.tokens.length > 0 &&
    search.tokens.every((token) => haystack.includes(token))
  ) {
    return true;
  }

  return (
    search.importantTokens.length > 0 &&
    search.importantTokens.some(
      (token) => values.title.includes(token) || values.artist.includes(token)
    )
  );
}

function scoreSongSearch(row, search) {
  const values = rowSearchValues(row);
  const haystack = Object.values(values).filter(Boolean).join(" ");
  let score = 0;

  if (values.title === search.phrase) score += 1000;
  if (values.title.includes(search.phrase)) score += 900;
  if (search.tokens.length > 0 && search.tokens.every((token) => values.title.includes(token))) {
    score += 800;
  }
  score += search.tokens.filter((token) => values.title.includes(token)).length * 90;

  if (values.artist.includes(search.phrase)) score += 650;
  score += search.tokens.filter((token) => values.artist.includes(token)).length * 60;

  if (values.album.includes(search.phrase)) score += 450;
  score += search.tokens.filter((token) => values.album.includes(token)).length * 35;

  for (const key of ["genre", "mood", "tags", "description"]) {
    if (values[key].includes(search.phrase)) score += 250;
    score += search.tokens.filter((token) => values[key].includes(token)).length * 20;
  }

  if (search.tokens.length > 0 && search.tokens.every((token) => haystack.includes(token))) {
    score += 160;
  }

  return score;
}

function rankSongSearchRows(rows, search) {
  if (!search.phrase) return rows;

  return rows
    .filter((row) => songMatchesSearch(row, search))
    .map((row, index) => ({
      row,
      index,
      score: scoreSongSearch(row, search),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bCreated = new Date(b.row?.created_at || 0).getTime() || 0;
      const aCreated = new Date(a.row?.created_at || 0).getTime() || 0;
      if (bCreated !== aCreated) return bCreated - aCreated;
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

function buildSearchOrClause(search) {
  if (!search.phrase) return "";

  const terms = [search.phrase, ...search.tokens];
  const seen = new Set();
  const clauses = [];

  terms.forEach((term) => {
    const pattern = escapeIlikePattern(term);
    if (!pattern || seen.has(pattern)) return;
    seen.add(pattern);

    SEARCH_FIELDS.forEach((field) => {
      clauses.push(`${field}.ilike.%${pattern}%`);
    });
  });

  return clauses.join(",");
}

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
  search,
  searchCandidateLimit,
}) {
  const rangeStart = filters.search ? 0 : offset;
  const rangeEnd = filters.search
    ? Math.max(searchCandidateLimit - 1, 0)
    : offset + limit - 1;

  let request = supabase
    .from("songs")
    .select(selectClause)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .range(rangeStart, rangeEnd);

  if (filters.search) {
    const searchClause = buildSearchOrClause(search);

    if (searchClause) {
      request = request.or(searchClause);
    }
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
  const search = normalizeSongSearchQuery(filters.search);
  const searchCandidateLimit = filters.search
    ? Math.min(
        SEARCH_CANDIDATE_LIMIT,
        Math.max(pagination.offset + pagination.limit * 5, pagination.limit)
      )
    : pagination.limit;

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
      search,
      searchCandidateLimit,
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

    const rankedRows = rankSongSearchRows(fetchResult.data || [], search);
    const pagedRows = filters.search
      ? rankedRows.slice(pagination.offset, pagination.offset + pagination.limit)
      : rankedRows;

    const normalizedSongs = pagedRows
      .map(normalizeSong)
      .filter(Boolean);

    logApiSuccess("GET /api/songs", {
      durationMs: timer.durationMs(),
      resultCount: normalizedSongs.length,
      filters,
      page: pagination.page,
      limit: pagination.limit,
      offset: pagination.offset,
      searchCandidateCount: filters.search ? (fetchResult.data || []).length : null,
      searchRankedCount: filters.search ? rankedRows.length : null,
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
