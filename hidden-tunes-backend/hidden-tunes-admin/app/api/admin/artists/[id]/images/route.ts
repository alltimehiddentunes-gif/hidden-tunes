import { NextRequest, NextResponse } from "next/server";

import { upsertAdminArtistImage } from "@/lib/artistAdminCatalog";
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
    if (!body.image_url) {
      return NextResponse.json({ success: false, error: "image_url is required." }, { status: 400 });
    }
    const image = await upsertAdminArtistImage(id, body);
    return NextResponse.json({ success: true, image }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to save artist image.", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
