import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_PUBLIC_EPISODE_LIST_SELECT,
  PODCAST_PUBLIC_SHOW_SELECT,
  applyPublicEpisodeFilters,
  applyPublicShowFilters,
  buildPodcastPagination,
  buildShowCategoryOrFilter,
  parsePodcastLimit,
  parsePodcastPage,
  toPodcastPublicEpisode,
  toPodcastPublicShow,
} from "@/lib/podcastCatalog";
import { cleanPodcastFilter, jsonPodcastError, parseBooleanQuery } from "@/lib/podcastPublicApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Bound show-id resolution so category browse cannot pull the entire shows table. */
const MAX_CATEGORY_SHOW_IDS = 400;

async function resolvePublicShowId(showRef: string, options?: { includeMature?: boolean }) {
  const cleaned = String(showRef || "").trim();
  if (!cleaned) return null;

  let query = applyPublicShowFilters(
    supabaseAdmin.from("podcast_shows").select("id"),
    { includeMature: options?.includeMature }
  );

  if (UUID_RE.test(cleaned)) {
    query = query.eq("id", cleaned);
  } else {
    query = query.eq("slug", cleaned);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ? String(data.id) : null;
}

async function resolveShowIdsForCategory(
  category: string,
  options?: { includeMature?: boolean }
) {
  let query = supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .or(buildShowCategoryOrFilter(category))
    .order("episode_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(MAX_CATEGORY_SHOW_IDS);

  if (!options?.includeMature) {
    query = query.eq("is_mature", false);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data || []) as { id: string }[]).map((row) => row.id);
}

/**
 * Unfiltered general browse must not resolve hundreds of show UUIDs into a
 * PostgREST `in.(...)` filter — that produces ~15KB request URLs and fails
 * with undici `TypeError: fetch failed`. Filter via an inner join instead.
 */
const EPISODE_LIST_WITH_PUBLIC_SHOW_SELECT = `${PODCAST_PUBLIC_EPISODE_LIST_SELECT}, show:podcast_shows!inner(id, status, is_active, feed_status, is_mature)`;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parsePodcastPage(params.get("page"));
  const limit = parsePodcastLimit(params.get("limit"));
  const from = (page - 1) * limit;
  const to = from + limit; // one extra row for hasMore without exact count

  let showId =
    cleanPodcastFilter(params.get("show_id")) ||
    cleanPodcastFilter(params.get("showId"));
  const category = cleanPodcastFilter(params.get("category"));
  const searchQuery = cleanPodcastFilter(params.get("q"));
  const includeMature = parseBooleanQuery(
    params.get("include_mature") || params.get("includeMature")
  );

  try {
    let categoryShowIds: string[] | null = null;

    if (category) {
      categoryShowIds = await resolveShowIdsForCategory(category, {
        includeMature,
      });

      if (categoryShowIds.length === 0) {
        return NextResponse.json({
          success: true,
          episodes: [],
          shows: [],
          pagination: buildPodcastPagination(page, limit, 0),
        });
      }
    }

    if (showId) {
      const resolvedShowId = await resolvePublicShowId(showId, { includeMature });

      if (!resolvedShowId) {
        return NextResponse.json({
          success: true,
          episodes: [],
          shows: [],
          pagination: buildPodcastPagination(page, limit, 0),
        });
      }

      showId = resolvedShowId;
    }

    const useShowJoin = !showId && !categoryShowIds;
    let query = supabaseAdmin
      .from("podcast_episodes")
      .select(
        useShowJoin
          ? EPISODE_LIST_WITH_PUBLIC_SHOW_SELECT
          : PODCAST_PUBLIC_EPISODE_LIST_SELECT
      )
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    query = applyPublicEpisodeFilters(query, {
      showId,
      searchQuery,
    });

    if (categoryShowIds) {
      query = query.in("show_id", categoryShowIds);
    } else if (useShowJoin) {
      query = query
        .eq("show.status", "approved")
        .eq("show.is_active", true)
        .eq("show.feed_status", "active");
      if (!includeMature) {
        query = query.eq("show.is_mature", false);
      }
    }

    const { data, error } = await query.range(from, to);

    if (error) {
      return jsonPodcastError(
        "Failed to load podcast episodes.",
        500,
        error.message
      );
    }

    const rows = (data || []) as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const episodes = pageRows.map((row) => toPodcastPublicEpisode(row));
    const total = from + episodes.length + (hasMore ? 1 : 0);

    let shows: ReturnType<typeof toPodcastPublicShow>[] = [];
    if (category && episodes.length === 0 && categoryShowIds?.length) {
      const { data: showRows, error: showError } = await applyPublicShowFilters(
        supabaseAdmin
          .from("podcast_shows")
          .select(PODCAST_PUBLIC_SHOW_SELECT)
          .in("id", categoryShowIds)
          .order("episode_count", { ascending: false })
          .order("created_at", { ascending: false }),
        { includeMature }
      ).range(0, Math.min(limit, 24) - 1);

      if (!showError && showRows?.length) {
        shows = (showRows as Record<string, unknown>[]).map((row) =>
          toPodcastPublicShow(row)
        );
      }
    }

    return NextResponse.json({
      success: true,
      episodes,
      shows,
      pagination: buildPodcastPagination(page, limit, total),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";
    const isTimeout =
      error instanceof Error &&
      (error.name === "TimeoutError" ||
        message.includes("supabase_fetch_timeout"));
    const isFetchFailed =
      error instanceof Error &&
      (error.name === "TypeError" || message.includes("fetch failed"));

    return jsonPodcastError(
      "Failed to load podcast episodes.",
      isTimeout || isFetchFailed ? 504 : 500,
      message
    );
  }
}
