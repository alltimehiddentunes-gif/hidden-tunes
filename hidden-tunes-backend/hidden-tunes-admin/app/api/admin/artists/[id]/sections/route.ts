import { NextRequest, NextResponse } from "next/server";

import { replaceAdminArtistSections } from "@/lib/artistAdminCatalog";
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
    await replaceAdminArtistSections(id, Array.isArray(body.sections) ? body.sections : []);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to update profile sections.", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
