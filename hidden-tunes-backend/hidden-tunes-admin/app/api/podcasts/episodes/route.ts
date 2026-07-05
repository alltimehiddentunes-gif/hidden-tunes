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
    .or(buildShowCategoryOrFilter(category));

  if (!options?.includeMature) {
    query = query.eq("is_mature", false);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return ((data || []) as { id: string }[]).map((row) => row.id);
}

async function resolvePublicCatalogShowIds(options?: { includeMature?: boolean }) {
  const { data, error } = await applyPublicShowFilters(
    supabaseAdmin.from("podcast_shows").select("id"),
    { includeMature: options?.includeMature }
  );

  if (error) {
    throw error;
  }

  return ((data || []) as { id: string }[]).map((row) => row.id);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parsePodcastPage(params.get("page"));
  const limit = parsePodcastLimit(params.get("limit"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

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
    let catalogShowIds: string[] | null = null;

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

    if (!includeMature && !categoryShowIds && !showId) {
      catalogShowIds = await resolvePublicCatalogShowIds({ includeMature: false });

      if (catalogShowIds.length === 0) {
        return NextResponse.json({
          success: true,
          episodes: [],
          shows: [],
          pagination: buildPodcastPagination(page, limit, 0),
        });
      }
    }

    let query = supabaseAdmin
      .from("podcast_episodes")
      .select(PODCAST_PUBLIC_EPISODE_LIST_SELECT, { count: "exact" })
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    query = applyPublicEpisodeFilters(query, {
      showId,
      searchQuery,
    });

    if (categoryShowIds) {
      query = query.in("show_id", categoryShowIds);
    } else if (catalogShowIds) {
      query = query.in("show_id", catalogShowIds);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      return jsonPodcastError(
        "Failed to load podcast episodes.",
        500,
        error.message
      );
    }

    const total = count || 0;
    const episodes = ((data || []) as Record<string, unknown>[]).map((row) =>
      toPodcastPublicEpisode(row)
    );

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

    return jsonPodcastError("Failed to load podcast episodes.", 500, message);
  }
}
