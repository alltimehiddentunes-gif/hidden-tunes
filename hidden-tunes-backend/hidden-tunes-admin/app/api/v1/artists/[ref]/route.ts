import { NextRequest, NextResponse } from "next/server";
import { assertArtistProfileV1 } from "@/lib/artistIdentityV1";
import { loadArtistProfileV1 } from "@/lib/artistIdentityV1Catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ ref: string }> }) {
  const { ref } = await context.params;
  const result = await loadArtistProfileV1(ref);
  if (result.status === "invalid") return NextResponse.json({ apiVersion: "v1", status: "not_found", error: "invalid_artist_uuid" }, { status: 400 });
  if (result.status === "not_found") return NextResponse.json({ apiVersion: "v1", status: "not_found" }, { status: 404 });
  if (result.status === "restricted") return NextResponse.json({ apiVersion: "v1", status: "restricted" }, { status: 403 });
  if (result.status === "merged_redirect") return NextResponse.json({ apiVersion: "v1", status: "merged_redirect", canonicalArtistId: result.canonicalId, artist: assertArtistProfileV1(result.profile) });
  return NextResponse.json({ apiVersion: "v1", status: "resolved", artist: assertArtistProfileV1(result.profile) });
}
