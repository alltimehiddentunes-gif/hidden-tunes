import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_SELECT =
  "id, name, slug, short_name, sport_id, country_code, competition_id, artwork_url, status, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        team: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const teamId = String(id || "").trim();
    if (!teamId) {
      return jsonSportsError("Team id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_teams")
      .select(TEAM_SELECT)
      .eq("id", teamId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Team not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({ enabled: true, team: data });
  } catch (err) {
    return jsonSportsError(
      "Failed to load team.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
