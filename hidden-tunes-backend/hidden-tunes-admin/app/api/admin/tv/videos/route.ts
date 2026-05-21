import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  TV_PLAYBACK_STATUSES,
  TV_VIDEO_SELECT,
  TV_VIDEO_STATUSES,
  TvVideoRow,
  cleanText,
  isAllowedValue,
  normalizeTagsInput,
  parsePositiveInt,
} from "@/lib/tvCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

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
  return cleaned && cleaned !== "all" ? cleaned : null;
}

export async function GET(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const params = request.nextUrl.searchParams;
  const page = parsePositiveInt(params.get("page"), 1, 10_000);
  const limit = parsePositiveInt(params.get("limit"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("tv_videos")
    .select(TV_VIDEO_SELECT, { count: "exact" })
    .order("created_at", { ascending: false });

  const status = cleanFilter(params.get("status"));
  const playbackStatus = cleanFilter(params.get("playback_status"));
  const category = cleanFilter(params.get("category"));
  const genre = cleanFilter(params.get("genre"));
  const mood = cleanFilter(params.get("mood"));
  const sourceType = cleanFilter(params.get("source_type"));

  if (status) query = query.eq("status", status);
  if (playbackStatus) query = query.eq("playback_status", playbackStatus);
  if (category) query = query.ilike("category", category);
  if (genre) query = query.ilike("genre", genre);
  if (mood) query = query.ilike("mood", mood);
  if (sourceType) query = query.eq("source_type", sourceType);

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return jsonError("Failed to load TV videos.", 500, error.message);
  }

  const total = count || 0;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return NextResponse.json({
    success: true,
    videos: (data || []) as TvVideoRow[],
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const videoId = cleanText(body.id, 80);

  if (!videoId) {
    return jsonError("Video id is required.", 400);
  }

  const payload: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = cleanText(body.status, 40);
    if (!status || !isAllowedValue(status, TV_VIDEO_STATUSES)) {
      return jsonError("Invalid status.", 400);
    }
    payload.status = status;
  }

  if (body.playback_status !== undefined) {
    const playbackStatus = cleanText(body.playback_status, 40);
    if (
      !playbackStatus ||
      !isAllowedValue(playbackStatus, TV_PLAYBACK_STATUSES)
    ) {
      return jsonError("Invalid playback_status.", 400);
    }
    payload.playback_status = playbackStatus;
  }

  if (body.is_active !== undefined) {
    payload.is_active = Boolean(body.is_active);
  }

  if (body.is_featured !== undefined) {
    payload.is_featured = Boolean(body.is_featured);
  }

  if (body.category !== undefined) {
    payload.category = cleanText(body.category, 120);
  }

  if (body.genre !== undefined) {
    payload.genre = cleanText(body.genre, 120);
  }

  if (body.mood !== undefined) {
    payload.mood = cleanText(body.mood, 120);
  }

  if (body.format !== undefined) {
    payload.format = cleanText(body.format, 120);
  }

  if (body.tags !== undefined) {
    payload.tags = normalizeTagsInput(body.tags);
  }

  if (Object.keys(payload).length === 0) {
    return jsonError("No moderation fields provided to update.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .update(payload)
    .eq("id", videoId)
    .select(TV_VIDEO_SELECT)
    .single();

  if (error) {
    return jsonError("Failed to update TV video.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    video: data as TvVideoRow,
  });
}
