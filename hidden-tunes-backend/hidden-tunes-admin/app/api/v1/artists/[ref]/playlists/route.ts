import { NextResponse } from "next/server";
import { isCanonicalArtistUuid } from "@/lib/artistIdentityV1";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ ref: string }> }) {
  const { ref } = await context.params;
  if (!isCanonicalArtistUuid(ref)) return NextResponse.json({ apiVersion: "v1", error: "invalid_artist_uuid" }, { status: 400 });
  return NextResponse.json({ apiVersion: "v1", supported: false, items: [], pagination: { limit: 0, hasMore: false, nextCursor: null } });
}
