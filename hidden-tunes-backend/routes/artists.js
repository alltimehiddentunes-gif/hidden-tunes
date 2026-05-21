import express from "express";
import { supabase } from "../services/supabase.js";
import {
  createRequestTimer,
  isRelationEmbedError,
  logApiError,
  logApiRequest,
  logApiSuccess,
  logApiWarning,
  logSupabaseError,
} from "../services/apiDiagnostics.js";
import { escapeIlikePattern, normalizeArtistFilters } from "../services/queryGuards.js";

const router = express.Router();

const FALLBACK_ARTIST_IMAGE =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeArtist(row, tracks = []) {
  const artwork = row?.image_url || FALLBACK_ARTIST_IMAGE;

  return {
    id: row.id,
    name: row.name || "Unknown Artist",
    slug: row.slug || null,
    artwork,
    image_url: artwork,
    cover: artwork,
    thumbnail: artwork,
    bio: row.bio || "",
    created_at: row.created_at || null,
    songCount: Array.isArray(tracks) ? tracks.length : 0,
    tracks: Array.isArray(tracks) ? tracks : [],
    albums: [],
  };
}

function normalizeTrack(row) {
  if (!row || typeof row !== "object") return null;

  const artists = asObject(row.artists);
  const albums = asObject(row.albums);

  const artwork =
    row.cover_url ||
    albums?.cover_url ||
    albums?.artwork_url ||
    artists?.image_url ||
    FALLBACK_ARTIST_IMAGE;

  const audioUrl = row.audio_url || row.url || null;

  return {
    id: row.id,
    title: row.title || "Untitled",
    slug: row.slug || null,
    artist: artists?.name || row.artist_name || row.artist || "Unknown Artist",
    artistId: row.artist_id || artists?.id || null,
    album: albums?.title || row.album_title || row.album || "Singles",
    albumId: row.album_id || albums?.id || null,
    genre: row.genre || albums?.genre || "Hidden Tunes",
    mood: row.mood || null,
    artwork,
    cover: artwork,
    thumbnail: artwork,
    url: audioUrl,
    streamUrl: audioUrl,
    duration: row.duration_seconds || row.duration || null,
    sourceName: "Hidden Tunes",
    type: "r2",
    isOnline: true,
    isPublic: row.is_public ?? true,
    createdAt: row.created_at || null,
  };
}

const ARTIST_SELECT = `
  id,
  name,
  slug,
  image_url,
  bio,
  created_at
`;

const TRACK_SELECT_WITH_RELATIONS = `
  id,
  title,
  slug,
  artist_id,
  album_id,
  genre,
  mood,
  duration,
  duration_seconds,
  url,
  audio_url,
  cover_url,
  artist,
  artist_name,
  album,
  album_title,
  is_public,
  created_at,
  artists (
    id,
    name,
    image_url
  ),
  albums (
    id,
    title,
    cover_url,
    artwork_url,
    genre
  )
`;

const TRACK_SELECT_LITE = `
  id,
  title,
  slug,
  artist_id,
  album_id,
  genre,
  mood,
  duration,
  duration_seconds,
  url,
  audio_url,
  cover_url,
  artist,
  artist_name,
  album,
  album_title,
  is_public,
  created_at
`;

async function fetchArtistTracks(artistIds) {
  if (!artistIds.length) {
    return {
      songs: [],
      selectMode: "none",
      error: null,
    };
  }

  const relationRequest = supabase
    .from("songs")
    .select(TRACK_SELECT_WITH_RELATIONS)
    .in("artist_id", artistIds)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const relationResult = await relationRequest;

  if (!relationResult.error) {
    return {
      songs: (relationResult.data || []).map(normalizeTrack).filter(Boolean),
      selectMode: "relations",
      error: null,
    };
  }

  logSupabaseError("GET /api/artists", relationResult.error, {
    stage: "artist_tracks_relations",
    artistCount: artistIds.length,
  });

  if (!isRelationEmbedError(relationResult.error)) {
    return {
      songs: [],
      selectMode: "relations_failed",
      error: relationResult.error,
    };
  }

  logApiWarning("GET /api/artists", {
    warning: "artist_tracks_relations_fallback_to_lite",
    message: relationResult.error.message,
  });

  const liteResult = await supabase
    .from("songs")
    .select(TRACK_SELECT_LITE)
    .in("artist_id", artistIds)
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  if (!liteResult.error) {
    return {
      songs: (liteResult.data || []).map(normalizeTrack).filter(Boolean),
      selectMode: "lite",
      error: null,
    };
  }

  logSupabaseError("GET /api/artists", liteResult.error, {
    stage: "artist_tracks_lite",
    artistCount: artistIds.length,
  });

  return {
    songs: [],
    selectMode: "lite_failed",
    error: liteResult.error,
  };
}

router.get("/", async (req, res) => {
  const timer = createRequestTimer();
  const filters = normalizeArtistFilters(req.query);

  logApiRequest("GET /api/artists", {
    filters,
    page: filters.page,
    limit: filters.limit,
    offset: filters.offset,
  });

  try {
    let artistRequest = supabase
      .from("artists")
      .select(ARTIST_SELECT)
      .order("name", { ascending: true })
      .range(filters.offset, filters.offset + filters.limit - 1);

    if (filters.search) {
      const pattern = escapeIlikePattern(filters.search);
      artistRequest = artistRequest.or(
        `name.ilike.%${pattern}%,slug.ilike.%${pattern}%`
      );
    }

    const { data: artistRows, error: artistError } = await artistRequest;

    if (artistError) {
      logSupabaseError("GET /api/artists", artistError, { stage: "artists" });

      return res.status(500).json({
        error: "Failed to fetch artists",
        details: artistError.message,
      });
    }

    const artists = Array.isArray(artistRows) ? artistRows : [];
    const artistIds = artists.map((artist) => artist.id).filter(Boolean);

    if (artistIds.length === 0) {
      logApiSuccess("GET /api/artists", {
        durationMs: timer.durationMs(),
        resultCount: 0,
        filters,
        trackSelectMode: "none",
        cacheState: "live_query",
      });

      return res.json({
        success: true,
        count: 0,
        artists: [],
      });
    }

    const trackResult = await fetchArtistTracks(artistIds);

    if (trackResult.error) {
      logApiWarning("GET /api/artists", {
        warning: "partial_catalog_response_without_tracks",
        message: trackResult.error.message,
        selectMode: trackResult.selectMode,
      });
    }

    const songsByArtistId = new Map();

    trackResult.songs.forEach((song) => {
      const key = song.artistId;
      if (!key) return;

      if (!songsByArtistId.has(key)) {
        songsByArtistId.set(key, []);
      }

      songsByArtistId.get(key).push(song);
    });

    const normalizedArtists = artists.map((artist) =>
      normalizeArtist(artist, songsByArtistId.get(artist.id) || [])
    );

    logApiSuccess("GET /api/artists", {
      durationMs: timer.durationMs(),
      resultCount: normalizedArtists.length,
      trackCount: trackResult.songs.length,
      filters,
      trackSelectMode: trackResult.selectMode,
      partialCatalog: Boolean(trackResult.error),
      cacheState: "live_query",
    });

    return res.json({
      success: true,
      count: normalizedArtists.length,
      artists: normalizedArtists,
    });
  } catch (error) {
    logApiError("GET /api/artists", {
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

export default router;
