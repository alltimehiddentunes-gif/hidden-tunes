import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_ADMIN_EPISODE_LIST_SELECT,
  toPodcastAdminEpisode,
} from "@/lib/podcastAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleanText } from "@/lib/tvCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const showId =
    cleanText(request.nextUrl.searchParams.get("showId"), 80) ||
    cleanText(request.nextUrl.searchParams.get("show_id"), 80);

  if (!showId) {
    return jsonError("showId query parameter is required.", 400);
  }

  const { data: show, error: showError } = await supabaseAdmin
    .from("podcast_shows")
    .select("id")
    .eq("id", showId)
    .maybeSingle();

  if (showError) {
    return jsonError("Failed to load podcast show.", 500, showError.message);
  }

  if (!show) {
    return jsonError("Podcast show not found.", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("podcast_episodes")
    .select(PODCAST_ADMIN_EPISODE_LIST_SELECT)
    .eq("show_id", showId)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    return jsonError("Failed to load podcast episodes.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    show_id: showId,
    episodes: ((data || []) as Record<string, unknown>[]).map((row) =>
      toPodcastAdminEpisode(row)
    ),
  });
}
