import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  MOTIVATION_DEFAULT_PAGE_SIZE,
  MOTIVATION_MAX_PAGE_SIZE,
  MOTIVATION_PUBLIC_SELECT,
  buildMotivationCategoryOrFilter,
  decodeMotivationCursor,
  encodeMotivationCursor,
  jsonMotivationError,
  parsePositiveInt,
  serializeMotivationError,
} from "@/lib/motivationCatalog";
import {
  MOTIVATION_RELIABILITY_THRESHOLD,
  toMotivationPublicMetadata,
} from "@/lib/motivationHealth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const limit = parsePositiveInt(
    params.get("limit"),
    MOTIVATION_DEFAULT_PAGE_SIZE,
    MOTIVATION_MAX_PAGE_SIZE
  );
  const cursor = decodeMotivationCursor(params.get("cursor"));
  const category = cleanFilter(params.get("category"));
  const subcategory = cleanFilter(params.get("subcategory"));
  const searchQuery = cleanFilter(params.get("q"));
  const featuredOnly = params.get("featured") === "true";

  try {
    let query = supabaseAdmin
      .from("motivation_items")
      .select(MOTIVATION_PUBLIC_SELECT)
      .eq("status", "approved")
      .eq("is_active", true)
      .eq("is_verified", true)
      .eq("playback_status", "playable")
      .eq("is_mature", false)
      .eq("content_classification", "accept")
      .gte("reliability_score", MOTIVATION_RELIABILITY_THRESHOLD)
      .order("sort_order", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (featuredOnly) query = query.eq("is_featured", true);
    if (category) {
      const looksLikeSlug = !category.includes(" ") && category.includes("-");
      query = looksLikeSlug
        ? query.or(buildMotivationCategoryOrFilter(category))
        : query.ilike("category", category);
    }
    if (subcategory) query = query.ilike("subcategory", subcategory);

    if (searchQuery) {
      const escaped = searchQuery.replace(/[%_]/g, "\\$&");
      query = query.or(
        `title.ilike.%${escaped}%,channel_name.ilike.%${escaped}%,description.ilike.%${escaped}%`
      );
    }

    if (cursor) {
      query = query.or(
        [
          `sort_order.lt.${cursor.sort_order}`,
          `and(sort_order.eq.${cursor.sort_order},created_at.lt.${cursor.created_at})`,
          `and(sort_order.eq.${cursor.sort_order},created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
        ].join(",")
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("[motivation] items browse failed", serializeMotivationError(error));
      return jsonMotivationError("Failed to load motivation catalog.", 500, error);
    }

    const rows = (data || []) as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const items = pageRows.map((row) => toMotivationPublicMetadata(row));

    const lastRow = pageRows[pageRows.length - 1];
    const nextCursor =
      hasMore && lastRow
        ? encodeMotivationCursor({
            sort_order: Number(lastRow.sort_order ?? 0),
            created_at: String(lastRow.created_at || ""),
            id: String(lastRow.id || ""),
          })
        : null;

    return NextResponse.json({
      success: true,
      items,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error("[motivation] items browse failed", serializeMotivationError(error));
    return jsonMotivationError("Failed to load motivation catalog.", 500, error);
  }
}
