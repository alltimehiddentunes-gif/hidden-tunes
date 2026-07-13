import { NextRequest, NextResponse } from "next/server";

import { clampArtistPageSize, jsonArtistError, loadArtistEmotionalWorldDetail } from "@/lib/artistCatalog";
import { artistErrorResponse, ArtistWorldRouteContext, resolvePublicArtist } from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: ArtistWorldRouteContext) {
  const { ref, world } = await context.params;
  const limit = clampArtistPageSize(request.nextUrl.searchParams.get("limit"));

  try {
    const resolved = await resolvePublicArtist(ref);
    if (!resolved) return jsonArtistError("Artist not found.", 404);
    const detail = await loadArtistEmotionalWorldDetail(resolved.artistId, world, limit);
    if (!detail) return jsonArtistError("Emotional world not found.", 404);
    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    return artistErrorResponse(error, "Failed to load emotional world detail.");
  }
}
