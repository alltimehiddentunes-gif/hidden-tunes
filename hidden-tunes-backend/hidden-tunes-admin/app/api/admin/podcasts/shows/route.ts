import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_ADMIN_SHOW_SELECT,
  toPodcastAdminShow,
} from "@/lib/podcastAdminCatalog";
import {
  PODCAST_FEED_STATUSES,
  PODCAST_SHOW_STATUSES,
} from "@/lib/podcastCatalog";
import { cleanPodcastFilter } from "@/lib/podcastPublicApi";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAllowedValue } from "@/lib/tvCatalog";

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

  const params = request.nextUrl.searchParams;
  let query = supabaseAdmin
    .from("podcast_shows")
    .select(PODCAST_ADMIN_SHOW_SELECT)
    .order("created_at", { ascending: false });

  const status = cleanPodcastFilter(params.get("status"));
  const feedStatus = cleanPodcastFilter(params.get("feed_status"));
  const searchQuery = cleanPodcastFilter(params.get("q"));

  if (status && isAllowedValue(status, PODCAST_SHOW_STATUSES)) {
    query = query.eq("status", status);
  }

  if (feedStatus && isAllowedValue(feedStatus, PODCAST_FEED_STATUSES)) {
    query = query.eq("feed_status", feedStatus);
  }

  if (params.get("is_active") === "true") {
    query = query.eq("is_active", true);
  } else if (params.get("is_active") === "false") {
    query = query.eq("is_active", false);
  }

  if (searchQuery) {
    query = query.or(
      `title.ilike.%${searchQuery}%,host_name.ilike.%${searchQuery}%,feed_url.ilike.%${searchQuery}%`
    );
  }

  const { data, error } = await query;

  if (error) {
    return jsonError("Failed to load podcast shows.", 500, error.message);
  }

  return NextResponse.json({
    success: true,
    shows: ((data || []) as Record<string, unknown>[]).map((row) =>
      toPodcastAdminShow(row)
    ),
  });
}
