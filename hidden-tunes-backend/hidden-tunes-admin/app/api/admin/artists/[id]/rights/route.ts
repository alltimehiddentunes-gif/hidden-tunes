import { NextRequest, NextResponse } from "next/server";

import { upsertAdminArtistRights } from "@/lib/artistAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id } = await context.params;
  try {
    const body = await request.json();
    const rights = await upsertAdminArtistRights(id, body);
    return NextResponse.json({ success: true, rights });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update artist rights.", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
