import { NextRequest, NextResponse } from "next/server";

import { getAdminArtistDetail, updateAdminArtist } from "@/lib/artistAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ success: false, error, details: details ?? null }, { status });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id } = await context.params;
  try {
    const detail = await getAdminArtistDetail(id);
    if (!detail) return jsonError("Artist not found.", 404);
    return NextResponse.json({ success: true, ...detail });
  } catch (error) {
    return jsonError("Failed to load artist.", 500, error instanceof Error ? error.message : error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const { id } = await context.params;
  try {
    const body = await request.json();
    const artist = await updateAdminArtist(id, { ...body, actor_user_id: permission.user.id });
    return NextResponse.json({ success: true, artist });
  } catch (error) {
    return jsonError("Failed to update artist.", 500, error instanceof Error ? error.message : error);
  }
}
