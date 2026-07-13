import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildTvPublicCategoryCatalog } from "@/lib/tvPublicCategories";
import {
  applyTvPublicCatalogFilters,
  parseTvClientPlatform,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORY_BATCH_SIZE = 1000;

export async function GET(request: NextRequest) {
  const platform = parseTvClientPlatform(request);
  const eligibleNames = new Set<string>();
  let hasFeatured = false;
  let offset = 0;

  while (true) {
    const query = supabaseAdmin
      .from("tv_videos")
      .select("category, genre, mood, format, tags, is_featured") as unknown as SupabaseFilterQuery;

    applyTvPublicCatalogFilters(query, platform);
    const { data, error } = await query.range(offset, offset + CATEGORY_BATCH_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { success: false, categories: [], error: "Failed to load TV categories." },
        { status: 500 }
      );
    }

    const rows = (data || []) as Record<string, unknown>[];
    for (const row of rows) {
      hasFeatured ||= row.is_featured === true;
      for (const key of ["category", "genre", "mood", "format"] as const) {
        const value = String(row[key] || "").trim().toLowerCase();
        if (value) eligibleNames.add(value);
      }
      for (const tag of Array.isArray(row.tags) ? row.tags : []) {
        const value = String(tag || "").trim().toLowerCase();
        if (value) eligibleNames.add(value);
      }
    }

    if (rows.length < CATEGORY_BATCH_SIZE) break;
    offset += rows.length;
  }

  const categories = buildTvPublicCategoryCatalog().filter((category) => {
    if (category.name === "Featured") return hasFeatured;
    return eligibleNames.has(category.name.toLowerCase());
  });

  return NextResponse.json({
    success: true,
    categories,
    platform,
  });
}
