import { NextRequest, NextResponse } from "next/server";
import { resolveArtistV1 } from "@/lib/artistIdentityV1Catalog";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  const result = await resolveArtistV1({ id: query.get("id") || undefined, provider: query.get("provider") || undefined, externalId: query.get("externalId") || undefined, slug: query.get("slug") || undefined, name: query.get("name") || undefined });
  return NextResponse.json(
    { apiVersion: "v1", ...result },
    { status: result.status === "invalid" ? 400 : result.status === "not_found" ? 404 : result.status === "restricted" ? 403 : 200 },
  );
}
