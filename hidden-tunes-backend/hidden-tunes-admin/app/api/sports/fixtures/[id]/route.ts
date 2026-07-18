import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_SELECT =
  "id, title, sport_id, competition_id, season_id, starts_at, ends_at, status, venue_id, country_code, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        fixture: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const fixtureId = String(id || "").trim();
    if (!fixtureId) {
      return jsonSportsError("Fixture id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_fixtures")
      .select(FIXTURE_SELECT)
      .eq("id", fixtureId)
      .in("status", [
        ...SPORTS_PUBLIC_CATALOG_STATUSES,
        "completed",
        "postponed",
        "cancelled",
        "geo_blocked",
      ])
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Fixture not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({ enabled: true, fixture: data });
  } catch (err) {
    return jsonSportsError(
      "Failed to load fixture.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
