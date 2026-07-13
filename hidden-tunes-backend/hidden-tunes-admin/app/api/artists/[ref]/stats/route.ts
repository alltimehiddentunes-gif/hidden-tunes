import { NextResponse } from "next/server";

import { jsonArtistError, loadArtistStatsOnly } from "@/lib/artistCatalog";
import { artistErrorResponse, ArtistRouteContext } from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: ArtistRouteContext) {
  const { ref } = await context.params;

  try {
    const stats = await loadArtistStatsOnly(ref);
    if (!stats) return jsonArtistError("Artist not found.", 404);
    return NextResponse.json({ success: true, statistics: stats });
  } catch (error) {
    return artistErrorResponse(error, "Failed to load artist statistics.");
  }
}
