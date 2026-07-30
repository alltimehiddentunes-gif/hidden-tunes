import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_PUBLIC_VIDEO_SELECT,
  TvPublicVideo,
  parsePositiveInt,
  toTvPublicStation,
} from "@/lib/tvCatalog";
import {
  applyTvPublicCatalogFilters,
  parseTvClientPlatform,
  type SupabaseFilterQuery,
} from "@/lib/tvPlatformPolicy";
import {
  buildTvTextSearchOrFilter,
  normalizeTvSearchQuery,
  resolveTvCountryFilter,
} from "@/lib/tvPublicSearchQuery";

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

function cleanFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

/** Quote PostgREST filter values safely for `.or(...)`. */
function quoteFilterValue(value: string) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const page = parsePositiveInt(params.get("page"), 1, 10_000);
    const limit = parsePositiveInt(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const platform = parseTvClientPlatform(request);

    let query = supabaseAdmin
      .from("tv_videos")
      .select(TV_PUBLIC_VIDEO_SELECT, { count: "exact" }) as unknown as SupabaseFilterQuery;

    // 1) Canonical public eligibility first
    applyTvPublicCatalogFilters(query, platform);

    const category = cleanFilter(params.get("category"));
    const genre = cleanFilter(params.get("genre"));
    const mood = cleanFilter(params.get("mood"));
    const format = cleanFilter(params.get("format"));
    const countryRaw = cleanFilter(params.get("country"));
    const language = cleanFilter(params.get("language"));
    const searchQuery = normalizeTvSearchQuery(params.get("q") || "");
    const featuredOnly = params.get("featured") === "true";

    // 2) Category / facet filters before pagination
    if (featuredOnly) query = query.eq("is_featured", true);
    if (category) {
      const quoted = quoteFilterValue(category);
      const quotedContains = quoteFilterValue(`%${category}%`);
      query = query.or(`category.ilike.${quotedContains},tags.cs.{${quoted}}`);
    }
    if (genre) query = query.ilike("genre", genre);
    if (mood) query = query.ilike("mood", mood);
    if (format) query = query.ilike("format", format);
    if (countryRaw) {
      const country = resolveTvCountryFilter(countryRaw);
      query = query.ilike("region", country);
    }
    if (language) query = query.ilike("language", language);

    if (searchQuery.length >= 2) {
      const orFilter = buildTvTextSearchOrFilter(searchQuery);
      if (orFilter) {
        query = query.or(orFilter);
      }
    }

    // 3) Stable ordering, then 4) pagination
    const { data, error, count } = await query
      .order("title", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      return jsonError("Failed to load public TV catalog.", 500, error.message);
    }

    const rows = ((data || []) as Record<string, unknown>[]);
    const videos = rows.map((row) => toTvPublicStation(row)) as TvPublicVideo[];
    const total = typeof count === "number" ? count : videos.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    const hasMore = page * limit < total;

    return NextResponse.json({
      success: true,
      videos,
      platform,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    return jsonError("Failed to load public TV catalog.", 504, message);
  }
}
