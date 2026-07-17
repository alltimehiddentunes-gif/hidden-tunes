import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 1 video play stub.
 * Never returns permanent source URLs. Playback resolution comes later.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const videoId = String(id || "").trim();
    if (!videoId) {
      return jsonSportsError("Video id is required.", 400, null, "INVALID_REQUEST");
    }

    const [sportsEnabled, nativeEnabled, embeddedEnabled] = await Promise.all([
      isSportsFeatureEnabled("sports_enabled"),
      isSportsFeatureEnabled("sports_native_playback_enabled"),
      isSportsFeatureEnabled("sports_embedded_playback_enabled"),
    ]);

    if (!sportsEnabled) {
      return jsonSportsError(
        "Sports is disabled by feature flag.",
        503,
        null,
        "FEATURE_DISABLED"
      );
    }

    if (!nativeEnabled && !embeddedEnabled) {
      return jsonSportsError(
        "Sports video playback is not enabled.",
        503,
        null,
        "FEATURE_DISABLED"
      );
    }

    const { data: video, error } = await supabaseAdmin
      .from("sports_videos")
      .select("id, title, status, published_at, unpublished_at, quarantined_at")
      .eq("id", videoId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!video) {
      return jsonSportsError("Video not found.", 404, null, "NO_AUTHORIZED_SOURCE");
    }
    if (!video.published_at || video.unpublished_at || video.quarantined_at) {
      return jsonSportsError(
        "Video is not available for playback.",
        404,
        null,
        "NOT_PUBLISHED"
      );
    }

    return jsonSportsError(
      "No authorized playable source for this video.",
      404,
      { videoId: video.id },
      "NO_AUTHORIZED_SOURCE"
    );
  } catch (err) {
    return jsonSportsError(
      "Failed to resolve Sports video playback.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Allow GET for smoke tests; prefer POST in production clients. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return POST(request, context);
}
