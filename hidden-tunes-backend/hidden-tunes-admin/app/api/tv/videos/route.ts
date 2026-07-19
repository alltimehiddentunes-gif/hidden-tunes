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
    },
    { status }
  );
}

function cleanFilter(value: string | null) {
  const cleaned = String(value || "").trim();
  return cleaned || null;
}

export async function GET(request: NextRequest) {
  try {
  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const from = (page - 1) * limit;
  const to = from + limit; // fetch one extra row for hasMore (avoid exact count)
  const platform = parseTvClientPlatform(request);

  let query = supabaseAdmin
    .from("tv_videos")
    .select(TV_PUBLIC_VIDEO_SELECT) as unknown as SupabaseFilterQuery;

  applyTvPublicCatalogFilters(query, platform);

  const category = cleanFilter(params.get("category"));
  const genre = cleanFilter(params.get("genre"));
  const mood = cleanFilter(params.get("mood"));
  const format = cleanFilter(params.get("format"));
  const country = cleanFilter(params.get("country"));
  const language = cleanFilter(params.get("language"));
  const searchQuery = cleanFilter(params.get("q"));
  const featuredOnly = params.get("featured") === "true";

  if (featuredOnly) query = query.eq("is_featured", true);
  if (category) {
    query = query.or(`category.ilike.${category},tags.cs.{${category}}`);
  }
  if (genre) query = query.ilike("genre", genre);
  if (mood) query = query.ilike("mood", mood);
  if (format) query = query.ilike("format", format);
  if (country) query = query.ilike("region", country);
  if (language) query = query.ilike("language", language);

  if (searchQuery) {
    const escaped = searchQuery.replace(/[%_]/g, "\\$&");
    const tagToken = searchQuery
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const searchParts = [
      `title.ilike.%${escaped}%`,
      `channel_name.ilike.%${escaped}%`,
      `category.ilike.%${escaped}%`,
      `genre.ilike.%${escaped}%`,
      `mood.ilike.%${escaped}%`,
      `format.ilike.%${escaped}%`,
      `language.ilike.%${escaped}%`,
      `region.ilike.%${escaped}%`,
    ];
    if (tagToken) {
      searchParts.push(`tags.cs.{${tagToken}}`);
    }
    query = query.or(searchParts.join(","));
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return jsonError("Failed to load public TV catalog.", 500, error.message);
  }

  const rows = ((data || []) as Record<string, unknown>[]);
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const videos = pageRows.map((row) => toTvPublicStation(row)) as TvPublicVideo[];
  const total = from + videos.length + (hasMore ? 1 : 0);
  const totalPages = hasMore ? page + 1 : page;

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
