import { NextRequest } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SPORTS_PUBLIC_CATALOG_STATUSES } from "@/lib/sports/constants";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNEL_SELECT =
  "id, name, slug, description, sport_id, country_code, artwork_url, status, verification_status, published_at, quarantined_at, created_at, updated_at";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        channel: null,
        message: "Sports is disabled by feature flag.",
      });
    }

    const { id } = await context.params;
    const channelId = String(id || "").trim();
    if (!channelId) {
      return jsonSportsError("Channel id is required.", 400, null, "INVALID_REQUEST");
    }

    const { data, error } = await supabaseAdmin
      .from("sports_channels")
      .select(CHANNEL_SELECT)
      .eq("id", channelId)
      .in("status", [...SPORTS_PUBLIC_CATALOG_STATUSES])
      .not("published_at", "is", null)
      .is("unpublished_at", null)
      .is("quarantined_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return jsonSportsError("Channel not found.", 404, null, "INVALID_REQUEST");
    }

    return jsonSportsOk({
      enabled: true,
      channel: {
        id: data.id,
        name: data.name,
        slug: data.slug,
        description: data.description,
        sportId: data.sport_id,
        countryCode: data.country_code,
        artworkUrl: data.artwork_url,
        status: data.status,
        verificationStatus: data.verification_status,
        published: Boolean(data.published_at),
        quarantined: Boolean(data.quarantined_at),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load channel.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
