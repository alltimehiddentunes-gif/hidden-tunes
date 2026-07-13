import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { probeStreamUrl } from "@/lib/tvStreamProtocol";
import {
  isPlayUrlAllowedForPlatform,
  isTvStationEligibleForPlatform,
  parseTvClientPlatform,
} from "@/lib/tvPlatformPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TV_PLAY_SELECT =
  "id, source_type, source_id, source_url, embed_url, status, is_active, playback_status, reliability_score, consecutive_failures, disabled_at, quarantined_at, ios_playable, android_playable, stream_is_https, last_health_checked_at, last_validation_result, validated_stream_url";

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const cleanId = String(id || "").trim();
  const platform = parseTvClientPlatform(request);

  if (!cleanId) {
    return jsonError("TV station id is required.", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("tv_videos")
    .select(TV_PLAY_SELECT)
    .eq("id", cleanId)
    .maybeSingle();

  if (error) {
    return jsonError("Failed to load TV play URL.", 500, error.message);
  }

  if (!data || !isTvStationEligibleForPlatform(data, platform)) {
    return jsonError("TV station not found or not currently playable.", 404);
  }

  const sourceType = String(data.source_type || "");
  let streamUrl = String(data.validated_stream_url || data.source_url || "").trim();

  if (!streamUrl) {
    return jsonError("TV station stream unavailable.", 404);
  }

  if (!sourceType.startsWith("youtube")) {
    const probe = await probeStreamUrl(streamUrl);
    streamUrl = probe.finalUrl || streamUrl;

    if (!probe.playable || !isPlayUrlAllowedForPlatform(streamUrl, platform)) {
      await supabaseAdmin
        .from("tv_videos")
        .update({
          ios_playable: false,
          android_playable: false,
          playback_status: "failed",
          last_validation_result: probe.reason || "play_resolve_failed",
          last_health_checked_at: new Date().toISOString(),
          consecutive_failures: Math.max(1, Number(data.consecutive_failures ?? 0) + 1),
        })
        .eq("id", cleanId);

      return jsonError("TV station not currently playable on this platform.", 404);
    }
  }

  if (!isPlayUrlAllowedForPlatform(streamUrl, platform)) {
    return jsonError("TV station stream is not HTTPS-compatible.", 404);
  }

  return NextResponse.json({
    success: true,
    id: data.id,
    source_type: data.source_type,
    source_id: data.source_id,
    stream_url: streamUrl,
    embed_url: data.embed_url || null,
    platform,
  });
}
