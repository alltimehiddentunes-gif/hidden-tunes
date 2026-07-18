import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  batchLoadMatchCards,
  type FixtureRow,
} from "@/lib/sports/home/fixtureCards";
import { loadRelatedFixtures } from "@/lib/sports/fixtures/relatedFixtures";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";
import { resolveSportsBrowseAccess } from "@/lib/sports/pilotAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIXTURE_SELECT =
  "id, title, sport_id, competition_id, starts_at, ends_at, status, venue_id, country_code, metadata, availability_state, playable";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const access = await resolveSportsBrowseAccess(request, () =>
      isSportsFeatureEnabled("sports_enabled")
    );
    if (!access.enabled) {
      return jsonSportsOk({
        enabled: false,
        fixture: null,
        message: "Sports preview is unavailable.",
      });
    }

    const { id } = await context.params;
    const fixtureId = String(id || "").trim();
    if (!fixtureId) {
      return jsonSportsError(
        "Fixture id is required.",
        400,
        null,
        "INVALID_REQUEST"
      );
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
      return jsonSportsError(
        "Fixture not found.",
        404,
        null,
        "INVALID_REQUEST"
      );
    }

    const row = data as FixtureRow;
    const [card] = await batchLoadMatchCards([row]);
    if (!card) {
      return jsonSportsError(
        "Fixture not found.",
        404,
        null,
        "INVALID_REQUEST"
      );
    }

    const relatedFixtures = await loadRelatedFixtures({
      fixtureId: row.id,
      sportId: row.sport_id,
      competitionId: row.competition_id,
      countryCode: row.country_code,
      startsAt: row.starts_at,
    });

    return jsonSportsOk({
      enabled: true,
      privatePilot: access.privatePilot || undefined,
      fixture: {
        ...card,
        relatedFixtures,
        highlights: [],
        replays: [],
        timeline: [],
        broadcasts: [],
      },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load fixture.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
