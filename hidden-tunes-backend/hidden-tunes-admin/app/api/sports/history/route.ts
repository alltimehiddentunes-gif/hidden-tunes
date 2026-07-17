import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import { jsonSportsError, jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 1 stub — watch history is not enabled yet. Auth not required. */
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
      message: "Sports history is not enabled in Phase 1.",
    });
  } catch (err) {
    return jsonSportsError(
      "Failed to load Sports history.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}

export async function POST() {
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
      "Sports history is not enabled in Phase 1.",
      501,
      { enabled: true, featureEnabled: false },
      "FEATURE_DISABLED"
    );
  } catch (err) {
    return jsonSportsError(
      "Failed to update Sports history.",
      500,
      err instanceof Error ? err.message : String(err)
    );
  }
}
