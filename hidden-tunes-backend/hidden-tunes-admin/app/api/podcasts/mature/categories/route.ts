import { NextRequest, NextResponse } from "next/server";

import {
  listMaturePodcastCategories,
  matureGateEnabled,
} from "@/lib/podcastMatureCatalog";
import { jsonPodcastError } from "@/lib/podcastPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  if (
    !matureGateEnabled({
      mature_enabled: params.get("mature_enabled"),
      matureEnabled: params.get("matureEnabled"),
      age_confirmed: params.get("age_confirmed"),
      ageConfirmed: params.get("ageConfirmed"),
    })
  ) {
    return jsonPodcastError(
      "Mature podcasts require age confirmation.",
      403
    );
  }

  try {
    const categories = await listMaturePodcastCategories();
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error.";
    return jsonPodcastError("Failed to load mature podcast categories.", 500, message);
  }
}
