import { NextRequest, NextResponse } from "next/server";

import { buildTvPublicCategoryCatalog } from "@/lib/tvPublicCategories";
import { parseTvClientPlatform } from "@/lib/tvPlatformPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Return the static public TV category catalog.
 *
 * Previous implementation scanned every eligible tv_videos row in 1000-row
 * batches to discover occupied category names. On a large catalog that never
 * finished and saturated PostgREST, hanging every other media browse route.
 *
 * Category occupancy is still enforced when a category is opened via
 * /api/tv/videos?category=... (platform filters + pagination).
 */
export async function GET(request: NextRequest) {
  const platform = parseTvClientPlatform(request);
  const categories = buildTvPublicCategoryCatalog();

  return NextResponse.json({
    success: true,
    categories,
    platform,
  });
}
