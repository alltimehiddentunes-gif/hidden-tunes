import { NextRequest, NextResponse } from "next/server";

import {
  followArtist,
  getViewerFromAuthorizationHeader,
  jsonArtistError,
  unfollowArtist,
} from "@/lib/artistCatalog";
import { artistErrorResponse, ArtistRouteContext, requireArtistUuid } from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: ArtistRouteContext) {
  const { ref } = await context.params;

  try {
    const resolved = await requireArtistUuid(ref);
    if (resolved.error) return resolved.error;

    const viewer = await getViewerFromAuthorizationHeader(request.headers.get("authorization"));
    if (!viewer) return jsonArtistError("Authentication required to follow an artist.", 401);

    const result = await followArtist(resolved.artistId, viewer.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return artistErrorResponse(error, "Failed to follow artist.");
  }
}

export async function DELETE(request: NextRequest, context: ArtistRouteContext) {
  const { ref } = await context.params;

  try {
    const resolved = await requireArtistUuid(ref);
    if (resolved.error) return resolved.error;

    const viewer = await getViewerFromAuthorizationHeader(request.headers.get("authorization"));
    if (!viewer) return jsonArtistError("Authentication required to unfollow an artist.", 401);

    const result = await unfollowArtist(resolved.artistId, viewer.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return artistErrorResponse(error, "Failed to unfollow artist.");
  }
}
