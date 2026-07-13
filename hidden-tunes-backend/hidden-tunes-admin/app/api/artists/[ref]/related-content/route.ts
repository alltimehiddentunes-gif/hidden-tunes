import { NextRequest, NextResponse } from "next/server";

import { clampArtistPageSize, jsonArtistError, loadArtistRelatedContent } from "@/lib/artistCatalog";
import { artistErrorResponse, ArtistRouteContext, resolvePublicArtist } from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: ArtistRouteContext) {
  const { ref } = await context.params;
  const limit = clampArtistPageSize(request.nextUrl.searchParams.get("limit"));

  try {
    const resolved = await resolvePublicArtist(ref);
    if (!resolved) return jsonArtistError("Artist not found.", 404);
    const items = await loadArtistRelatedContent(resolved.artistId, limit);
    return NextResponse.json({ success: true, items });
  } catch (error) {
    return artistErrorResponse(error, "Failed to load related content.");
  }
}
