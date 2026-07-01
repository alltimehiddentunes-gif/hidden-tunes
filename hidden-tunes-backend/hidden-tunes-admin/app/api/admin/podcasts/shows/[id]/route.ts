import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_ADMIN_SHOW_SELECT,
  isPodcastShowPubliclyVisible,
  normalizePodcastShowPatch,
  toPodcastAdminShow,
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id: showId } = await context.params;
  if (!cleanText(showId, 80)) {
    return jsonError("Invalid show id.", 400);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  let payload: Record<string, unknown>;
  try {
    payload = normalizePodcastShowPatch(body, true);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid show payload.",
      400
    );
  }

  if (Object.keys(payload).length === 0) {
    return jsonError("No fields provided to update.", 400);
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("podcast_shows")
    .select(PODCAST_ADMIN_SHOW_SELECT)
    .eq("id", showId)
    .maybeSingle();

  if (existingError) {
    return jsonError("Failed to load podcast show.", 500, existingError.message);
  }

  if (!existing) {
    return jsonError("Podcast show not found.", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("podcast_shows")
    .update(payload)
    .eq("id", showId)
    .select(PODCAST_ADMIN_SHOW_SELECT)
    .single();

  if (error) {
    return jsonError("Failed to update podcast show.", 500, error.message);
  }

  const show = toPodcastAdminShow(data as Record<string, unknown>);
  const isPubliclyVisible = isPodcastShowPubliclyVisible(show);

  return NextResponse.json({
    success: true,
    show,
    is_publicly_visible: isPubliclyVisible,
    warning: !isPubliclyVisible
      ? "Show updated, but it remains hidden from public catalog until status=approved, is_active=true, and feed_status=active."
      : null,
  });
}
