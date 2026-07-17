import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 1 channel play stub.
 * Does not return permanent stream URLs. Native/embed channel playback
 * requires a later short-lived resolver path.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const channelId = String(id || "").trim();
    if (!channelId) {
      return jsonSportsError("Channel id is required.", 400, null, "INVALID_REQUEST");
    }

    const [sportsEnabled, nativeEnabled, embeddedEnabled, externalEnabled] =
      await Promise.all([
        isSportsFeatureEnabled("sports_enabled"),
        isSportsFeatureEnabled("sports_native_playback_enabled"),
        isSportsFeatureEnabled("sports_embedded_playback_enabled"),
        isSportsFeatureEnabled("sports_external_watch_enabled"),
      ]);

    if (!sportsEnabled) {
      return jsonSportsError(
        "Sports is disabled by feature flag.",
        503,
        null,
        "FEATURE_DISABLED"
      );
    }

    const { data: channel, error } = await supabaseAdmin
      .from("sports_channels")
      .select("id, name, status, published_at, unpublished_at, quarantined_at")
      .eq("id", channelId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!channel) {
      return jsonSportsError("Channel not found.", 404, null, "NO_AUTHORIZED_SOURCE");
    }
    if (!channel.published_at || channel.unpublished_at || channel.quarantined_at) {
      return jsonSportsError(
        "Channel is not available for playback.",
        404,
        null,
        "NOT_PUBLISHED"
      );
    }

    // Phase 1: channel native/embed resolution is not wired.
    if (!nativeEnabled && !embeddedEnabled) {
      if (externalEnabled) {
        return jsonSportsError(
          "No in-app authorized source for this channel. External watch only.",
          404,
          { channelId: channel.id, channelName: channel.name },
          "EXTERNAL_ONLY"
        );
      }
      return jsonSportsError(
        "Channel playback is not enabled.",
        503,
        null,
        "FEATURE_DISABLED"
      );
    }

    return jsonSportsError(
      "No authorized playable source for this channel.",
      404,
      { channelId: channel.id },
      "NO_AUTHORIZED_SOURCE"
    );
  } catch (err) {
    return jsonSportsError(
      "Failed to resolve Sports channel playback.",
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
