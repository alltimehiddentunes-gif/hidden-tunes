import { NextRequest } from "next/server";

import { listSportsFixturesFiltered } from "@/lib/sports/fixtures/listFixtures";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";
import { resolveSportsBrowseAccess } from "@/lib/sports/pilotAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const access = await resolveSportsBrowseAccess(request, () =>
      isSportsFeatureEnabled("sports_enabled")
    );
    if (!access.enabled) {
      return jsonSportsOk({
        enabled: false,
        items: [],
        nextCursor: null,
        pagination: { page: 1, limit: 20, hasMore: false },
      });
    }

    const url = new URL(request.url);
    const { page, limit } = parseSportsPageLimit(request);
    const cursor =
      String(url.searchParams.get("cursor") || "").trim() ||
      (page > 1
        ? Buffer.from(JSON.stringify({ o: (page - 1) * limit }), "utf8").toString(
            "base64url"
          )
        : null);

    // Content country filter must NOT reuse storefront `country` (mobile always
    // sends ZZ as storefront). Use explicit countryCode / fixtureCountry only.
    const fixtureCountry =
      url.searchParams.get("countryCode") ||
      url.searchParams.get("fixtureCountry") ||
      null;

    const { items, nextCursor } = await listSportsFixturesFiltered({
      sportId: url.searchParams.get("sportId"),
      sportSlug:
        url.searchParams.get("sport") || url.searchParams.get("sportSlug"),
      competitionId:
        url.searchParams.get("competition") ||
        url.searchParams.get("competitionId"),
      country: fixtureCountry,
      date: url.searchParams.get("date"),
      status: url.searchParams.get("status"),
      live:
        url.searchParams.get("live") === "1" ||
        url.searchParams.get("live") === "true",
      upcoming:
        url.searchParams.get("upcoming") === "1" ||
        url.searchParams.get("upcoming") === "true",
      finished:
        url.searchParams.get("finished") === "1" ||
        url.searchParams.get("finished") === "true",
      cursor,
      limit,
    });

    return jsonSportsOk({
      enabled: true,
      privatePilot: access.privatePilot || undefined,
      items,
      nextCursor,
      pagination: {
        page,
        limit,
        hasMore: Boolean(nextCursor),
      },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list fixtures.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
