import { NextRequest, NextResponse } from "next/server";

import {
  listMaturePodcastEpisodes,
  matureGateEnabled,
} from "@/lib/podcastMatureCatalog";
import { parsePodcastLimit, parsePodcastPage } from "@/lib/podcastCatalog";
import { cleanPodcastFilter, jsonPodcastError } from "@/lib/podcastPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (
    !matureGateEnabled({
      mature_enabled: params.get("mature_enabled"),
      matureEnabled: params.get("matureEnabled"),
      age_confirmed: params.get("age_confirmed"),
      ageConfirmed: params.get("ageConfirmed"),
    })
  ) {
    return jsonPodcastError(
      "Mature podcasts require age confirmation.",
      403
    );
  }

  const page = parsePodcastPage(params.get("page"));
  const limit = parsePodcastLimit(params.get("limit"));
  const searchQuery = cleanPodcastFilter(params.get("q"));

  if (!searchQuery) {
    return NextResponse.json({
      success: true,
      items: [],
      page,
      limit,
      hasMore: false,
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
    });
  }

  try {
    const result = await listMaturePodcastEpisodes({
      page,
      limit,
      searchQuery,
    });

    return NextResponse.json({
      success: true,
      items: result.items,
      page: result.pagination.page,
      limit: result.pagination.limit,
      hasMore: result.pagination.hasMore,
      pagination: result.pagination,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";
    return jsonPodcastError("Failed to search mature podcast episodes.", 500, message);
  }
}
