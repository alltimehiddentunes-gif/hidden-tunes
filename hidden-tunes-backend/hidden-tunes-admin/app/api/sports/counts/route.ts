import { NextRequest, NextResponse } from "next/server";

import { getSportsCorrectnessCounts } from "@/lib/sports/counts/service";
import { isSportsFeatureEnabled } from "@/lib/sports/featureFlags";
import {
  isSportsPrivatePilotRequest,
  resolveSportsBrowseAccess,
} from "@/lib/sports/pilotAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sports/counts
 *
 * Detailed operational counts are private-pilot / admin only while
 * sports_enabled remains false. Public callers receive a minimal disabled stub.
 */
export async function GET(req: NextRequest) {
  const pilot = isSportsPrivatePilotRequest(req);
  const access = await resolveSportsBrowseAccess(req, () =>
    isSportsFeatureEnabled("sports_enabled")
  );
  const adminHeader = String(req.headers.get("x-ht-sports-admin") || "").trim();
  const admin =
    adminHeader.length >= 16 &&
    adminHeader === String(process.env.SPORTS_ADMIN_COUNTS_TOKEN || "").trim();

  if (!pilot && !admin && !access.enabled) {
    return NextResponse.json(
      {
        success: true,
        enabled: false,
        message: "Sports counts require private pilot or admin access while Sports is disabled.",
        generatedAt: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=15" },
      }
    );
  }

  try {
    const counts = await getSportsCorrectnessCounts({
      privatePilot: pilot,
      admin,
      bypassCache: req.nextUrl.searchParams.get("fresh") === "1",
    });
    return NextResponse.json(
      {
        success: true,
        ...counts,
        // Never advertise public Sports as enabled from this diagnostic endpoint.
        enabled: false,
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=15" },
      }
    );
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        enabled: false,
        error: "counts_unavailable",
        message: e instanceof Error ? e.message : "unknown",
      },
      { status: 503 }
    );
  }
}
