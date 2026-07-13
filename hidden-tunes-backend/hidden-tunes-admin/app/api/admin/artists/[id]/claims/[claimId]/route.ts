import { NextRequest, NextResponse } from "next/server";

import { reviewAdminArtistClaim } from "@/lib/artistAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; claimId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { claimId } = await context.params;
  try {
    const body = await request.json();
    const status = body.status === "approved" ? "approved" : "rejected";
    const claim = await reviewAdminArtistClaim(claimId, status, permission.user.id);
    return NextResponse.json({ success: true, claim });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to review artist claim.", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
