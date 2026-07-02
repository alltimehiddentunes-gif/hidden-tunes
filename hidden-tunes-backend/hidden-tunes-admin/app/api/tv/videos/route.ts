import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_PUBLIC_VIDEO_SELECT,
  TvPublicVideo,
  parsePositiveInt,
} from "@/lib/tvCatalog";
import { TV_RELIABILITY_THRESHOLD, toTvPublicMetadata } from "@/lib/tvStationHealth";

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
  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("tv_videos")
    .select(TV_PUBLIC_VIDEO_SELECT, { count: "exact" })
    .eq("status", "approved")
    .eq("is_active", true)
    .eq("playback_status", "playable")
    .gte("reliability_score", TV_RELIABILITY_THRESHOLD)
    .order("created_at", { ascending: false });

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
    query = query.or(
      `title.ilike.%${escaped}%,channel_name.ilike.%${escaped}%`
    );
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return jsonError("Failed to load public TV catalog.", 500, error.message);
  }

  const total = count || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const videos = ((data || []) as Record<string, unknown>[]).map((row) =>
    toTvPublicMetadata(row)
  ) as TvPublicVideo[];

  return NextResponse.json({
    success: true,
    videos,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
