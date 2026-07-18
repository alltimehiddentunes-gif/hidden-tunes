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
 * Live Sports list — fixture-centric for private pilot (score/live cards).
 * Does not resolve playback. Metadata only.
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

    const { items, nextCursor } = await listSportsFixturesFiltered({
      live: true,
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
      "Failed to list live Sports fixtures.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
