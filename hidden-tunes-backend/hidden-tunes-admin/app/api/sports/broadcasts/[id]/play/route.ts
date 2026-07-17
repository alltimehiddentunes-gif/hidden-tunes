import { NextRequest } from "next/server";

import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsCountry,
  parseSportsPlatform,
} from "@/lib/sports/http";
import { playSportsBroadcast } from "@/lib/sports/playback/service";
import type { SportsPlatform } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const broadcastId = String(id || "").trim();
    if (!broadcastId) {
      return jsonSportsError("Broadcast id is required.", 400, null, "INVALID_REQUEST");
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const platform = parseSportsPlatform(request, body.platform) as SportsPlatform;
    const country = parseSportsCountry(request, body.country);

    const result = await playSportsBroadcast(broadcastId, {
      platform,
      country,
      deviceId: body.deviceId ? String(body.deviceId) : undefined,
      appVersion: body.appVersion ? String(body.appVersion) : undefined,
    });

    if (!result.ok) {
      return jsonSportsError(result.message, result.status, null, result.code);
    }

    return jsonSportsOk({ playback: result.playback });
  } catch (err) {
    return jsonSportsError(
      "Failed to resolve Sports playback.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Allow GET for smoke tests with query params; prefer POST in production clients. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const url = new URL(request.url);
  const fake = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      platform: url.searchParams.get("platform") || undefined,
      country: url.searchParams.get("country") || undefined,
    }),
  });
  return POST(fake as NextRequest, context);
}
