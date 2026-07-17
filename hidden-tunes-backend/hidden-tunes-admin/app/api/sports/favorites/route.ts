import { NextRequest } from "next/server";

import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 1 stub — favorites are not enabled yet. Auth not required. */
export async function GET() {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsOk({
        enabled: false,
        items: [],
        message: "Sports is disabled by feature flag.",
      });
    }

    return jsonSportsOk({
      enabled: true,
      featureEnabled: false,
      items: [],
      message: "Sports favorites are not enabled in Phase 1.",
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load Sports favorites.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function POST(_request: NextRequest) {
  try {
    const enabled = await isSportsFeatureEnabled("sports_enabled");
    if (!enabled) {
      return jsonSportsError(
        "Sports is disabled by feature flag.",
        501,
        { enabled: false },
        "FEATURE_DISABLED"
      );
    }

    return jsonSportsError(
      "Sports favorites are not enabled in Phase 1.",
      501,
      { enabled: true, featureEnabled: false },
      "FEATURE_DISABLED"
    );
  } catch (err) {
    return jsonSportsError(
      "Failed to update Sports favorites.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
