import { NextRequest } from "next/server";

import { clampArtistPageSize, jsonArtistError, loadArtistVideos } from "@/lib/artistCatalog";
import {
  artistErrorResponse,
  artistListResponse,
  ArtistRouteContext,
  parseArtistListQuery,
  resolvePublicArtist,
} from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: ArtistRouteContext) {
  const { ref } = await context.params;
  const query = parseArtistListQuery(request.nextUrl.searchParams);
  const limit = clampArtistPageSize(query.limit);

  try {
    const resolved = await resolvePublicArtist(ref);
    if (!resolved) return jsonArtistError("Artist not found.", 404);
    const page = await loadArtistVideos(resolved.artistId, { limit, cursor: query.cursor });
    return artistListResponse(page.items, page);
  } catch (error) {
    return artistErrorResponse(error, "Failed to load artist videos.");
  }
}
