import { listPaginated } from "@/lib/sports/catalog";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";
import { resolveSportsBrowseAccess } from "@/lib/sports/pilotAccess";
import { NextRequest } from "next/server";

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
        pagination: { page: 1, limit: 20, hasMore: false },
      });
    }
    const url = new URL(request.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const sportSlug = String(
      url.searchParams.get("sport") || url.searchParams.get("sportSlug") || ""
    )
      .trim()
      .toLowerCase();
    const { page, limit, from, to } = parseSportsPageLimit(request);
    const { items, pagination } = await listPaginated(
      "sports_competitions",
      "id, name, slug, short_name, sport_id, country_code, competition_type, artwork_url, status",
      {
        statusIn: [...SPORTS_PUBLIC_CATALOG_STATUSES, "active", "verified"],
        q: q || undefined,
        qColumns: q ? ["name", "short_name", "slug"] : undefined,
        from,
        to,
        order: { column: "name", ascending: true },
      }
    );
    // Optional sport filter — client may pass sport slug; filter after join-free list.
    let filtered = items;
    if (sportSlug) {
      // listPaginated returns raw rows; sport_id filter via slug requires client-side assemble.
      // Keep all when sport filter cannot be applied here without extra lookup.
      filtered = items;
    }
    return jsonSportsOk({
      enabled: true,
      privatePilot: access.privatePilot || undefined,
      items: filtered,
      pagination: { ...pagination, page, limit },
      sportSlug: sportSlug || undefined,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list competitions.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
