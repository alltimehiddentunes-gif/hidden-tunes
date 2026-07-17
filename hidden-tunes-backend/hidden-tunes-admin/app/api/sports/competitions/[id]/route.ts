import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPETITION_SELECT =
  "id, name, slug, short_name, sport_id, country_code, competition_type, gender, age_group, artwork_url, status, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        competition: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const competitionId = String(id || "").trim();
    if (!competitionId) {
      return jsonSportsError("Competition id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_competitions")
      .select(COMPETITION_SELECT)
      .eq("id", competitionId)
      .in("status", [...SPORTS_PUBLIC_CATALOG_STATUSES, "active"])
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Competition not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({ enabled: true, competition: data });
  } catch (err) {
    return jsonSportsError(
      "Failed to load competition.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
