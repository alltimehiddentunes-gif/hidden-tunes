import { NextRequest } from "next/server";

import { listPaginated } from "@/lib/sports/catalog";
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
      "sports_teams",
      "id, name, slug, short_name, sport_id, country_code, competition_id, artwork_url, status",
      {
        statusIn: ["active"],
        q: q || undefined,
        qColumns: q ? ["name", "short_name", "slug"] : undefined,
        from,
        to,
        order: { column: "name", ascending: true },
      }
    );

    return jsonSportsOk({
      enabled: true,
      items,
      pagination: { ...pagination, page, limit },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list teams.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
