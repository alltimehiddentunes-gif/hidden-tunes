import express from "express";
import { supabase } from "../services/supabase.js";
import {
  createRequestTimer,
  isUuid,
  logApiError,
  logApiRequest,
  logApiSuccess,
  logSupabaseError,
} from "../services/apiDiagnostics.js";
import { escapeIlikePattern, normalizePagination } from "../services/queryGuards.js";
import { resolveAlbumFilter } from "../services/catalogResolvers.js";

const router = express.Router();

const FALLBACK_COVER =
  "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1000";

const PUBLIC_R2_BASE_URL =
  process.env.PUBLIC_R2_BASE_URL ||
  process.env.R2_PUBLIC_BASE_URL ||
  process.env.R2_PUBLIC_URL ||
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  "";

function makePublicUrl(value, fallback = null) {
  if (!value) return fallback;

  const clean = String(value).trim();
  if (!clean) return fallback;

  if (clean.startsWith("https://") || clean.startsWith("http://")) return clean;
  if (!PUBLIC_R2_BASE_URL) return fallback;

  return `${PUBLIC_R2_BASE_URL.replace(/\/+$/, "")}/${clean.replace(/^\/+/, "")}`;
}

function normalizeAlbum(row) {
  const artwork = makePublicUrl(row.artwork_url || row.cover_url, FALLBACK_COVER) || FALLBACK_COVER;

  return {
    id: row.id,
    title: row.title || "Untitled Album",
    slug: row.slug || null,
    artistId: row.artist_id || null,
    artwork,
    cover: artwork,
    cover_url: artwork,
    thumbnail: artwork,
    release_year: row.release_year || null,
    created_at: row.created_at || null,
  };
}

router.get("/", async (req, res) => {
  const timer = createRequestTimer();
  const pagination = normalizePagination(req.query);
  const search = escapeIlikePattern(req.query.q || req.query.search || "");
  const albumId = String(req.query.albumId || req.query.id || "").trim();

  logApiRequest("GET /api/albums", {
    page: pagination.page,
    limit: pagination.limit,
    offset: pagination.offset,
    search,
    albumId,
  });

  try {
    if (albumId) {
      const resolved = await resolveAlbumFilter(albumId, "GET /api/albums");

      if (resolved.albumIds.length === 0) {
        logApiSuccess("GET /api/albums", {
          durationMs: timer.durationMs(),
          resultCount: 0,
          albumResolvedBy: resolved.resolvedBy,
          filters: { albumId },
          cacheState: "live_query",
        });

        return res.json({
          success: true,
          count: 0,
          albums: [],
        });
      }

      const { data, error } = await supabase
        .from("albums")
        .select(
          `
          id,
          title,
          slug,
          artist_id,
          artwork_url,
          cover_url,
          release_year,
          created_at
        `
        )
        .in("id", resolved.albumIds)
        .limit(pagination.limit);

      if (error) {
        logSupabaseError("GET /api/albums", error, { stage: "album_by_id" });

        return res.status(500).json({
          error: "Failed to fetch album",
          details: error.message,
        });
      }

      const albums = (data || []).map(normalizeAlbum);

      logApiSuccess("GET /api/albums", {
        durationMs: timer.durationMs(),
        resultCount: albums.length,
        albumResolvedBy: resolved.resolvedBy,
        cacheState: "live_query",
      });

      return res.json({
        success: true,
        count: albums.length,
        albums,
      });
    }

    let request = supabase
      .from("albums")
      .select(
        `
        id,
        title,
        slug,
        artist_id,
        artwork_url,
        cover_url,
        release_year,
        created_at
      `
      )
      .order("created_at", { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);

    if (search) {
      request = request.or(`title.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const { data, error } = await request;

    if (error) {
      logSupabaseError("GET /api/albums", error, { stage: "album_list" });

      return res.status(500).json({
        error: "Failed to fetch albums",
        details: error.message,
      });
    }

    const albums = (data || []).map(normalizeAlbum);

    logApiSuccess("GET /api/albums", {
      durationMs: timer.durationMs(),
      resultCount: albums.length,
      page: pagination.page,
      limit: pagination.limit,
      cacheState: "live_query",
    });

    return res.json({
      success: true,
      count: albums.length,
      albums,
    });
  } catch (error) {
    logApiError("GET /api/albums", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
    });

    return res.status(500).json({
      error: "Server error",
      details: error?.message || "Unknown server error",
    });
  }
});

router.get("/:id", async (req, res) => {
  const timer = createRequestTimer();
  const rawId = String(req.params.id || "").trim();

  logApiRequest("GET /api/albums/:id", { id: rawId });

  try {
    const resolved = await resolveAlbumFilter(rawId, "GET /api/albums/:id");

    if (resolved.albumIds.length === 0) {
      logApiSuccess("GET /api/albums/:id", {
        durationMs: timer.durationMs(),
        resultCount: 0,
        albumResolvedBy: resolved.resolvedBy,
      });

      return res.json({
        success: true,
        album: null,
      });
    }

    const lookupId = resolved.albumIds[0];

    const { data, error } = await supabase
      .from("albums")
      .select(
        `
        id,
        title,
        slug,
        artist_id,
        artwork_url,
        cover_url,
        release_year,
        created_at
      `
      )
      .eq("id", isUuid(lookupId) ? lookupId : lookupId)
      .maybeSingle();

    if (error) {
      logSupabaseError("GET /api/albums/:id", error, { id: rawId, lookupId });

      return res.status(500).json({
        error: "Failed to fetch album",
        details: error.message,
      });
    }

    logApiSuccess("GET /api/albums/:id", {
      durationMs: timer.durationMs(),
      resultCount: data ? 1 : 0,
      albumResolvedBy: resolved.resolvedBy,
    });

    return res.json({
      success: true,
      album: data ? normalizeAlbum(data) : null,
    });
  } catch (error) {
    logApiError("GET /api/albums/:id", {
      durationMs: timer.durationMs(),
      message: error?.message || "unknown_error",
      id: rawId,
    });

    return res.status(500).json({
      error: "Server error",
      details: error?.message || "Unknown server error",
    });
  }
});

export default router;
