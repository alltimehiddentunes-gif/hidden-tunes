import { NextRequest } from "next/server";

import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsCountry,
  parseSportsPlatform,
} from "@/lib/sports/http";
import { resolveFixturePlayback } from "@/lib/sports/playback/fixtureResolver";
import type { SportsPlatform } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider-neutral fixture play resolver.
 * Returns exactly one session DTO — never permanent in-app source URLs.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const fixtureId = String(id || "").trim();
    if (!fixtureId) {
      return jsonSportsError("Fixture id is required.", 400, null, "INVALID_REQUEST");
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const platform = parseSportsPlatform(
      request,
      body.platform
    ) as SportsPlatform;
    const country = parseSportsCountry(request, body.country);

    const session = await resolveFixturePlayback(fixtureId, {
      platform,
      country,
      appVersion: body.appVersion ? String(body.appVersion) : undefined,
      preferredLanguage: body.preferredLanguage
        ? String(body.preferredLanguage)
        : undefined,
      userId: body.userId ? String(body.userId) : null,
    });

    const status =
      session.status === "ready"
        ? 200
        : session.status === "external" ||
            session.status === "subscription_required"
          ? 200
          : session.reason === "not_started" || session.reason === "finished"
            ? 409
            : session.reason === "geo_blocked"
              ? 403
              : session.reason === "provider_disabled"
                ? 503
                : 404;

    return jsonSportsOk({ session }, { status });
  } catch (err) {
    return jsonSportsError(
      "Failed to resolve Sports fixture playback.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
