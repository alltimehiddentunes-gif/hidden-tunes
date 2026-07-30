import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { probeStreamUrl } from "@/lib/tvStreamProtocol";
import {
  isPlayUrlAllowedForPlatform,
  isTvMatureColumnEnabled,
  isTvStationEligibleForPlatform,
  parseIncludeMatureParam,
  parseTvClientPlatform,
  type TvPlatformEligibilityRow,
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

  const row = data as TvPlatformEligibilityRow & {
    id?: string;
    source_type?: string | null;
    source_id?: string | null;
    source_url?: string | null;
    embed_url?: string | null;
    validated_stream_url?: string | null;
    consecutive_failures?: number | null;
    is_mature?: boolean | null;
    mature_source_approved?: boolean | null;
  } | null;

  if (!row || !isTvStationEligibleForPlatform(row, platform)) {
    return jsonError("TV station not found or not currently playable.", 404);
  }

  if (isTvMatureColumnEnabled() && row.is_mature === true) {
    const includeMature = parseIncludeMatureParam(request);
    if (!includeMature || row.mature_source_approved !== true) {
      return jsonError("Forbidden.", 403);
    }
  }

  const sourceType = String(row.source_type || "");
  let streamUrl = String(row.validated_stream_url || row.source_url || "").trim();

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
          consecutive_failures: Math.max(1, Number(row.consecutive_failures ?? 0) + 1),
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
    id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    stream_url: streamUrl,
    embed_url: row.embed_url || null,
    platform,
  });
}
