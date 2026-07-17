import { NextRequest } from "next/server";

import { listPaginated } from "@/lib/sports/catalog";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        items: [],
        pagination: { page: 1, limit: 20, hasMore: false },
      });
    }

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const { page, limit, from, to } = parseSportsPageLimit(request);
    const { items, pagination } = await listPaginated(
      "sports_fixtures",
      "id, title, sport_id, competition_id, season_id, starts_at, ends_at, status, venue_id, country_code",
      {
        statusIn: [
          ...SPORTS_PUBLIC_CATALOG_STATUSES,
          "completed",
          "postponed",
          "geo_blocked",
        ],
        q: q || undefined,
        qColumns: q ? ["title"] : undefined,
        from,
        to,
        order: { column: "starts_at", ascending: false },
      }
    );

    return jsonSportsOk({
      enabled: true,
      items,
      pagination: { ...pagination, page, limit },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list fixtures.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
