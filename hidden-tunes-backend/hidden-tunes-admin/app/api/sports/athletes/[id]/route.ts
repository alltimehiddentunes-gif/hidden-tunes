import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ATHLETE_SELECT =
  "id, name, slug, short_name, sport_id, country_code, team_id, artwork_url, status, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        athlete: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const athleteId = String(id || "").trim();
    if (!athleteId) {
      return jsonSportsError("Athlete id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_athletes")
      .select(ATHLETE_SELECT)
      .eq("id", athleteId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Athlete not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({ enabled: true, athlete: data });
  } catch (err) {
    return jsonSportsError(
      "Failed to load athlete.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
