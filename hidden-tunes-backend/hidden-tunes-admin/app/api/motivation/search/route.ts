import { NextRequest, NextResponse } from "next/server";

import {
  cleanMotivationFilter,
  jsonMotivationError,
  listMotivationItems,
  MOTIVATION_DEFAULT_PAGE_SIZE,
  MOTIVATION_MAX_PAGE_SIZE,
  parsePositiveInt,
  serializeMotivationError,
} from "@/lib/motivationCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(
    params.get("limit"),
    MOTIVATION_DEFAULT_PAGE_SIZE,
    MOTIVATION_MAX_PAGE_SIZE
  );
  const q = cleanMotivationFilter(params.get("q"));

  try {
    const result = await listMotivationItems({
      page,
      limit,
      searchQuery: q,
    });

    return NextResponse.json({
      success: true,
      items: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[motivation] search failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to search motivation catalog.", 500, error);
  }
}
