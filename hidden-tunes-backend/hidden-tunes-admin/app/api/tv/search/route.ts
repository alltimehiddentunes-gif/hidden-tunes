import { NextRequest, NextResponse } from "next/server";

import { parsePositiveInt } from "@/lib/tvCatalog";
import { runTvLiveSearch } from "@/lib/tvSearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      success: false,
      error,
      details: details || null,
      videos: [],
    },
    { status }
  );
}

function cleanQuery(value: string | null) {
  const cleaned = String(value || "").trim().slice(0, 200);
  return cleaned || null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = cleanQuery(params.get("q"));

  if (!query) {
    return jsonError("Search query q is required.", 400);
  }

  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const pageToken = cleanQuery(params.get("pageToken"));

  try {
    const result = await runTvLiveSearch({
      query,
      page,
      limit,
      pageToken,
    });

    const hasMore = Boolean(result.nextPageToken) || page * limit < result.total;

    return NextResponse.json({
      success: true,
      videos: result.videos,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: hasMore ? page + 1 : page,
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
