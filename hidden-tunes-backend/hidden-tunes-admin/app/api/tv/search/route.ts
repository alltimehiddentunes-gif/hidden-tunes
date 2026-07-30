import { NextRequest, NextResponse } from "next/server";

import { parsePositiveInt } from "@/lib/tvCatalog";
import { runTvLiveSearch } from "@/lib/tvSearch";
import { parseTvClientPlatform } from "@/lib/tvPlatformPolicy";
import { normalizeTvSearchQuery } from "@/lib/tvPublicSearchQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
      videos: [],
      pagination: {
        page: 1,
        limit: DEFAULT_PAGE_SIZE,
        total: 0,
        totalPages: 0,
        hasMore: false,
      },
    },
    { status }
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = normalizeTvSearchQuery(params.get("q") || "");
  const platform = parseTvClientPlatform(request);

  if (!query) {
    return jsonError("Search query q is required.", 400);
  }

  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const pageToken = normalizeTvSearchQuery(params.get("pageToken") || "") || null;

  try {
    const result = await runTvLiveSearch({
      query,
      page,
      limit,
      pageToken,
      platform,
    });

    const total = Number(result.total || 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const hasMore = Boolean(result.nextPageToken) || page < totalPages;

    return NextResponse.json({
      success: true,
      videos: result.videos,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore,
      },
      search: {
        query,
        catalogCount: result.catalogCount,
        liveCount: result.liveCount,
        liveSearchEnabled: result.liveSearchEnabled,
        nextPageToken: result.nextPageToken,
        warning: result.error,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TV search failed unexpectedly.";

    return jsonError("Failed to run TV search.", 500, message);
  }
}
