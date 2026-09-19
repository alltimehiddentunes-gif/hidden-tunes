import { NextRequest, NextResponse } from "next/server";
import { isCanonicalArtistUuid } from "@/lib/artistIdentityV1";
import type { ArtistRouteContext } from "@/lib/artistPublicApi";

type LegacyArtistGet = (request: NextRequest, context: ArtistRouteContext) => Promise<Response>;

export function artistV1CollectionRoute(handler: LegacyArtistGet) {
  return async (request: NextRequest, context: ArtistRouteContext) => {
    const { ref } = await context.params;
    if (!isCanonicalArtistUuid(ref)) {
      return NextResponse.json({ apiVersion: "v1", error: "invalid_artist_uuid" }, { status: 400 });
    }
    const response = await handler(request, context);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return response;
    const payload = await response.json();
    return NextResponse.json({ apiVersion: "v1", ...payload }, { status: response.status });
  };
}
