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

/**
 * Free / watchable Sports fixtures — pilot-aware.
 * Returns fixtures that are currently live_in_app or have free watchability.
 */
export async function GET(request: NextRequest) {
  try {
    const access = await resolveSportsBrowseAccess(request, () =>
      isSportsFeatureEnabled("sports_enabled")
    );
    if (!access.enabled) {
      return jsonSportsOk({
        enabled: false,
        items: [],
        pagination: { page: 1, limit: 20, hasMore: false },
      });
    }

    const { page, limit } = parseSportsPageLimit(request);
    const cursor =
      page > 1
        ? Buffer.from(JSON.stringify({ o: (page - 1) * limit }), "utf8").toString(
            "base64url"
          )
        : null;

    // Pull a live+upcoming page then keep free/playable cards only.
    const live = await listSportsFixturesFiltered({
      live: true,
      cursor,
      limit: Math.min(50, limit * 2),
    });
    const upcoming = await listSportsFixturesFiltered({
      upcoming: true,
      limit: Math.min(50, limit * 2),
    });

    const merged = [...live.items, ...upcoming.items].filter(
      (c) =>
        c.watchability.playable ||
        c.availabilityState === "live_in_app" ||
        c.availabilityState === "live_external"
    );
    const pageItems = merged.slice(0, limit);

    return jsonSportsOk({
      enabled: true,
      privatePilot: access.privatePilot || undefined,
      items: pageItems,
      pagination: {
        page,
        limit,
        hasMore: merged.length > limit,
      },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list free Sports fixtures.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
