import { NextRequest } from "next/server";

import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsCountry,
  parseSportsPageLimit,
  parseSportsPlatform,
} from "@/lib/sports/http";
import { searchSportsCatalog } from "@/lib/sports/search/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        query: "",
        groups: [],
        pagination: { page: 1, limit: 20, hasMore: false },
      });
    }

    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const { page, limit } = parseSportsPageLimit(request);
    const country = parseSportsCountry(request);
    const platform = parseSportsPlatform(request);

    const result = await searchSportsCatalog({
      q,
      country,
      platform,
      page,
      limit,
    });

    return jsonSportsOk({ enabled: true, ...result });
  } catch (err) {
    return jsonSportsError(
      "Sports search failed.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
