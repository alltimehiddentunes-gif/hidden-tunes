import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Metadata only — never source_url / encrypted / manifest fields. */
const BROADCAST_SELECT =
  "id, fixture_id, channel_id, broadcast_type, title, description, starts_at, ends_at, availability_status, access_type, registration_required, subscription_required, official_status, verification_status, published_at, quarantined_at, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        broadcast: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const broadcastId = String(id || "").trim();
    if (!broadcastId) {
      return jsonSportsError("Broadcast id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_broadcasts")
      .select(BROADCAST_SELECT)
      .eq("id", broadcastId)
      .in("availability_status", [...SPORTS_PUBLIC_CATALOG_STATUSES])
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Broadcast not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({
      enabled: true,
      broadcast: {
        id: data.id,
        fixtureId: data.fixture_id,
        channelId: data.channel_id,
        broadcastType: data.broadcast_type,
        title: data.title,
        description: data.description,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        status: data.availability_status,
        accessType: data.access_type,
        registrationRequired: data.registration_required,
        subscriptionRequired: data.subscription_required,
        officialStatus: data.official_status,
        verificationStatus: data.verification_status,
        published: Boolean(data.published_at),
        quarantined: Boolean(data.quarantined_at),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load broadcast.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
