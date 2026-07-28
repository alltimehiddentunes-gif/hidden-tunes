import { NextRequest, NextResponse } from "next/server";

import { jsonRadioError } from "@/lib/radioPublicCatalog";
import { parseMatureRadioAccess } from "@/lib/radioMature/platformPolicy";
import {
  listMatureRadioStations,
  parseMatureRadioListParams,
} from "@/lib/radioMature/publicCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!parseMatureRadioAccess(request)) {
    return jsonRadioError("Mature radio search requires age confirmation.", 403);
  }

  const params = parseMatureRadioListParams(request.nextUrl.searchParams);
  if (!params.searchQuery) {
    return jsonRadioError("Search query q is required.", 400);
  }

  try {
    const result = await listMatureRadioStations(params);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return jsonRadioError(
      "Failed to search mature radio stations.",
      500,
      error instanceof Error ? error.message : error
    );
  }
}
