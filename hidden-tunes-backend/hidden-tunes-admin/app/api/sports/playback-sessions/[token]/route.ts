import { NextRequest } from "next/server";

import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";
import { resolveSportsPlaybackSession } from "@/lib/sports/playback/sessions";
import { recordSportsMetric } from "@/lib/sports/playback/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve opaque short-lived playback session token.
 * Embed URL is returned only here — never from browse APIs.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const result = await resolveSportsPlaybackSession(String(token || ""));

    if (!result.ok) {
      if (result.reason === "expired") {
        await recordSportsMetric("session_expiry_failures");
      }
      const status =
        result.reason === "expired"
          ? 410
          : result.reason === "provider_disabled"
            ? 503
            : 404;
      return jsonSportsError(result.message, status, null, result.reason);
    }

    return jsonSportsOk({
      fixtureId: result.fixtureId,
      broadcastId: result.broadcastId,
      playbackKind: result.playbackKind,
      title: result.title,
      providerLabel: result.providerLabel,
      embedUrl: result.embedUrl,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to resolve Sports playback session.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
