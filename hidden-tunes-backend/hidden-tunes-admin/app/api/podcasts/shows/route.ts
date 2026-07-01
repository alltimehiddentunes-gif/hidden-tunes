import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_PUBLIC_SHOW_SELECT,
  applyPublicShowFilters,
  buildPodcastPagination,
  parsePodcastLimit,
  parsePodcastPage,
  toPodcastPublicShow,
} from "@/lib/podcastCatalog";
import {
  cleanPodcastFilter,
  jsonPodcastError,
  parseBooleanQuery,
} from "@/lib/podcastPublicApi";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parsePodcastPage(params.get("page"));
  const limit = parsePodcastLimit(params.get("limit"));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("podcast_shows")
    .select(PODCAST_PUBLIC_SHOW_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  query = applyPublicShowFilters(query, {
    category: cleanPodcastFilter(params.get("category")),
    collection: cleanPodcastFilter(params.get("collection")),
    isFeatured: parseBooleanQuery(params.get("is_featured")),
    isExclusive: parseBooleanQuery(params.get("is_exclusive")),
    searchQuery: cleanPodcastFilter(params.get("q")),
  });

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return jsonPodcastError(
      "Failed to load public podcast catalog.",
      500,
      error.message
    );
  }

  const total = count || 0;
  const shows = ((data || []) as Record<string, unknown>[]).map((row) =>
    toPodcastPublicShow(row)
  );

  return NextResponse.json({
    success: true,
    shows,
    pagination: buildPodcastPagination(page, limit, total),
  });
}
