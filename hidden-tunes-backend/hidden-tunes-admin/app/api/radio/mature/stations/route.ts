import { NextRequest, NextResponse } from "next/server";

import { parseMatureRadioAccess } from "@/lib/radioMature/platformPolicy";
import { jsonRadioError } from "@/lib/radioPublicCatalog";
import {
  listMatureRadioStations,
  parseMatureRadioListParams,
} from "@/lib/radioMature/publicCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!parseMatureRadioAccess(request)) {
    return jsonRadioError("Mature radio requires age confirmation.", 403);
  }

  try {
    const params = parseMatureRadioListParams(request.nextUrl.searchParams);
    const result = await listMatureRadioStations(params);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return jsonRadioError(
      "Failed to load mature radio stations.",
      500,
      error instanceof Error ? error.message : error
    );
  }
}
