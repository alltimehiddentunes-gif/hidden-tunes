import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Metadata-only related broadcasts for a fixture — never permanent stream URLs. */
const BROADCAST_META_SELECT =
  "id, title, broadcast_type, starts_at, ends_at, availability_status, access_type, official_status, published_at, quarantined_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        fixtureId: null,
        broadcasts: [],
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const fixtureId = String(id || "").trim();
    if (!fixtureId) {
      return jsonSportsError("Fixture id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data: fixture, error: fixtureError } = await supabaseAdmin
      .from("sports_fixtures")
      .select("id, title, status, starts_at, ends_at")
      .eq("id", fixtureId)
      .maybeSingle();

    if (fixtureError) throw new Error(fixtureError.message);
    if (!fixture) {
      return jsonSportsError("Fixture not found.", 404, null, "INVALID_REQUEST");
    }

    const { data: broadcasts, error: broadcastsError } = await supabaseAdmin
      .from("sports_broadcasts")
      .select(BROADCAST_META_SELECT)
      .eq("fixture_id", fixtureId)
      .in("availability_status", [...SPORTS_PUBLIC_CATALOG_STATUSES])
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .order("starts_at", { ascending: true });

    if (broadcastsError) throw new Error(broadcastsError.message);

    const items = (broadcasts || []).map((row) => ({
      id: row.id,
      title: row.title,
      broadcastType: row.broadcast_type,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.availability_status,
      accessType: row.access_type,
      officialStatus: row.official_status,
      published: Boolean(row.published_at),
      quarantined: Boolean(row.quarantined_at),
      // Metadata only — resolve playback via /broadcasts/[id]/play.
      watchAction: "none" as const,
      watchLabel: "Resolve on tap",
    }));

    return jsonSportsOk({
      enabled: true,
      fixtureId: fixture.id,
      fixtureTitle: fixture.title,
      fixtureStatus: fixture.status,
      broadcasts: items,
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load fixture watch options.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
