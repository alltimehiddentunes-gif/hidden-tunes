import { NextRequest, NextResponse } from "next/server";

import { refreshAdminArtistStatistics } from "@/lib/artistAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id } = await context.params;
  try {
    const statistics = await refreshAdminArtistStatistics(id);
    return NextResponse.json({ success: true, statistics });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to refresh artist statistics.", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
