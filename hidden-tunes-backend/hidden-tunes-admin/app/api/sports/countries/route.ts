import { NextRequest } from "next/server";

import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  decodeSportsCursor,
  encodeSportsCursor,
} from "@/lib/sports/home/assemble";
import {
  jsonSportsError,
  jsonSportsOk,
  parseSportsPageLimit,
} from "@/lib/sports/http";
import { resolveSportsBrowseAccess } from "@/lib/sports/pilotAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Browse countries derived from competition / fixture / participant countries.
 * Does not treat provider territory as competition country.
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
        nextCursor: null,
      });
    }

    const url = new URL(request.url);
    const { limit } = parseSportsPageLimit(request);
    const cursor = String(url.searchParams.get("cursor") || "").trim() || null;
    const offset = decodeSportsCursor(cursor);

    const codes = new Set<string>();
    const [compRes, fixRes, teamRes] = await Promise.all([
      supabaseAdmin
        .from("sports_competitions")
        .select("country_code")
        .not("country_code", "is", null)
        .limit(300),
      supabaseAdmin
        .from("sports_fixtures")
        .select("country_code")
        .not("country_code", "is", null)
        .limit(300),
      supabaseAdmin
        .from("sports_teams")
        .select("country_code")
        .not("country_code", "is", null)
        .limit(300),
    ]);

    for (const row of [
      ...(compRes.data || []),
      ...(fixRes.data || []),
      ...(teamRes.data || []),
    ]) {
      if (row.country_code) codes.add(String(row.country_code).toUpperCase());
    }

    if (!codes.size) {
      return jsonSportsOk({ enabled: true, items: [], nextCursor: null });
    }

    const { data, error } = await supabaseAdmin
      .from("sports_countries")
      .select("code, name, region")
      .in("code", [...codes])
      .eq("status", "active")
      .order("name", { ascending: true })
      .range(offset, offset + limit);
    if (error) throw new Error(error.message);

    const rows = data || [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return jsonSportsOk({
      enabled: true,
      privatePilot: access.privatePilot || undefined,
      items: page.map((c) => ({
        code: c.code,
        name: c.name,
        region: c.region,
        artworkUrl: null,
      })),
      nextCursor: hasMore ? encodeSportsCursor(offset + limit) : null,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to list Sports countries.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
