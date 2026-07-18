import { NextRequest } from "next/server";

import { jsonSportsOk } from "@/lib/sports/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Non-secret deployment metadata for production verification.
 * Never expose env vars, tokens, or database URLs.
 */
export async function GET(_request: NextRequest) {
  const commit =
    process.env.HIDDEN_TUNES_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_VERSION ||
    null;
  const buildTime =
    process.env.HIDDEN_TUNES_BUILD_TIME ||
    process.env.BUILD_TIME ||
    null;

  return jsonSportsOk({
    service: "hidden-tunes-admin",
    environment: process.env.NODE_ENV || "unknown",
    commit,
    buildTime,
    sports: {
      publicEnabledHint: "see sports_feature_flags.sports_enabled",
      privatePilotConfigured: Boolean(
        String(process.env.SPORTS_PRIVATE_PILOT_TOKEN || "").trim().length >= 16
      ),
    },
    generatedAt: new Date().toISOString(),
  });
}
