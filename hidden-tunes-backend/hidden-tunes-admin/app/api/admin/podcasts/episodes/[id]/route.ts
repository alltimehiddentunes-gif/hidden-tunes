import { NextRequest, NextResponse } from "next/server";

import {
  PODCAST_ADMIN_EPISODE_LIST_SELECT,
  assertEpisodePlaybackGate,
  isPodcastEpisodePubliclyVisible,
  normalizePodcastEpisodePatch,
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

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id: episodeId } = await context.params;
  if (!cleanText(episodeId, 80)) {
    return jsonError("Invalid episode id.", 400);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  let payload: Record<string, unknown>;
  try {
    payload = normalizePodcastEpisodePatch(body);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid episode payload.",
      400
    );
  }

  if (Object.keys(payload).length === 0) {
    return jsonError("No fields provided to update.", 400);
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("podcast_episodes")
    .select(PODCAST_ADMIN_EPISODE_LIST_SELECT)
    .eq("id", episodeId)
    .maybeSingle();

  if (existingError) {
    return jsonError("Failed to load podcast episode.", 500, existingError.message);
  }

  if (!existing) {
    return jsonError("Podcast episode not found.", 404);
  }

  try {
    assertEpisodePlaybackGate(
      existing as { audio_url?: string | null },
      payload
    );
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid episode playback state.",
      400
    );
  }

  const { data, error } = await supabaseAdmin
    .from("podcast_episodes")
    .update(payload)
    .eq("id", episodeId)
    .select(PODCAST_ADMIN_EPISODE_LIST_SELECT)
    .single();

  if (error) {
    return jsonError("Failed to update podcast episode.", 500, error.message);
  }

  const episode = toPodcastAdminEpisode(data as Record<string, unknown>);

  return NextResponse.json({
    success: true,
    episode,
    is_publicly_visible: isPodcastEpisodePubliclyVisible(episode),
  });
}
