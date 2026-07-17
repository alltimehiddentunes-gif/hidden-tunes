import { NextRequest } from "next/server";

import { clampArtistPageSize, jsonArtistError, loadArtistReleases } from "@/lib/artistCatalog";
import {
  artistErrorResponse,
  artistListResponse,
  ArtistRouteContext,
  parseArtistListQuery,
  resolvePublicArtist,
  validateArtistRefParam,
} from "@/lib/artistPublicApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: ArtistRouteContext) {
  const { ref } = await context.params;
  const validated = validateArtistRefParam(ref);
  if (validated.error) return validated.error;

  const query = parseArtistListQuery(request.nextUrl.searchParams);
  const limit = clampArtistPageSize(query.limit);

  try {
    const resolved = await resolvePublicArtist(validated.ref);
    if (!resolved) return jsonArtistError("Artist not found.", 404);
    const page = await loadArtistReleases(resolved.artistId, {
      limit,
      cursor: query.cursor,
      releaseType: "album",
    });
    return artistListResponse(page.items, page, { release_filter: "album" });
  } catch (error) {
    return artistErrorResponse(error, "Failed to load artist albums.");
  }
}
