import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_PUBLIC_EPISODE_LIST_SELECT,
  applyPublicEpisodeFilters,
  applyPublicShowFilters,
  buildPodcastPagination,
  buildShowCategoryOrFilter,
  parsePodcastLimit,
  parsePodcastPage,
  toPodcastPublicEpisode,
} from "@/lib/podcastCatalog";
import { cleanPodcastFilter, jsonPodcastError } from "@/lib/podcastPublicApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveShowIdsForCategory(category: string) {
  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("feed_status", "active")
    .or(buildShowCategoryOrFilter(category));

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

  const showId =
    cleanPodcastFilter(params.get("show_id")) ||
    cleanPodcastFilter(params.get("showId"));
  const category = cleanPodcastFilter(params.get("category"));
  const searchQuery = cleanPodcastFilter(params.get("q"));

  try {
    let categoryShowIds: string[] | null = null;

    if (category) {
      categoryShowIds = await resolveShowIdsForCategory(category);

      if (categoryShowIds.length === 0) {
        return NextResponse.json({
          success: true,
          episodes: [],
          pagination: buildPodcastPagination(page, limit, 0),
        });
      }
    }

    if (showId) {
      const { data: showRow, error: showError } = await applyPublicShowFilters(
        supabaseAdmin.from("podcast_shows").select("id"),
        {}
      )
        .eq("id", showId)
        .maybeSingle();

      if (showError) {
        return jsonPodcastError(
          "Failed to load podcast episodes.",
          500,
          showError.message
        );
      }

      if (!showRow) {
        return NextResponse.json({
          success: true,
          episodes: [],
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

    return NextResponse.json({
      success: true,
      episodes,
      pagination: buildPodcastPagination(page, limit, total),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";

    return jsonPodcastError("Failed to load podcast episodes.", 500, message);
  }
}
