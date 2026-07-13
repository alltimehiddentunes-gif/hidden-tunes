import { NextResponse } from "next/server";

import { jsonArtistError, loadArtistAbout } from "@/lib/artistCatalog";
import { artistErrorResponse, ArtistRouteContext, resolvePublicArtist } from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: ArtistRouteContext) {
  const { ref } = await context.params;

  try {
    const resolved = await resolvePublicArtist(ref);
    if (!resolved) return jsonArtistError("Artist not found.", 404);
    const about = await loadArtistAbout(resolved.artistId);
    return NextResponse.json({ success: true, about });
  } catch (error) {
    return artistErrorResponse(error, "Failed to load artist about section.");
  }
}
