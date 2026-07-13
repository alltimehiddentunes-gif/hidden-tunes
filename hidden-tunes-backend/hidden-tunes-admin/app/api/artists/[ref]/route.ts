import { NextRequest, NextResponse } from "next/server";

import { jsonArtistError, loadArtistProfileShell } from "@/lib/artistCatalog";
import {
  artistErrorResponse,
  ArtistRouteContext,
  getOptionalViewerUserId,
} from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: ArtistRouteContext) {
  const { ref } = await context.params;

  try {
    const viewerUserId = await getOptionalViewerUserId(request);
    const profile = await loadArtistProfileShell(ref, viewerUserId);
    if (!profile) return jsonArtistError("Artist not found.", 404);

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return artistErrorResponse(error, "Failed to load artist profile.");
  }
}
