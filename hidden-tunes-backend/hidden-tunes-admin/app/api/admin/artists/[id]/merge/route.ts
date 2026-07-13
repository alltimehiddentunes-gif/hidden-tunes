import { NextRequest, NextResponse } from "next/server";

import { mergeAdminArtists } from "@/lib/artistAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id } = await context.params;
  try {
    const body = await request.json();
    const targetArtistId = String(body.target_artist_id || "").trim();
    if (!targetArtistId) {
      return NextResponse.json({ success: false, error: "target_artist_id is required." }, { status: 400 });
    }
    await mergeAdminArtists(id, targetArtistId, permission.user.id);
    return NextResponse.json({ success: true, merged_into: targetArtistId });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to merge artists.", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
