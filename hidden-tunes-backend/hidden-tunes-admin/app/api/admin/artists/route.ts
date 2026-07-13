import { NextRequest, NextResponse } from "next/server";

import { createAdminArtist, listAdminArtists } from "@/lib/artistAdminCatalog";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: string, status: number, details?: unknown) {
  return NextResponse.json({ success: false, error, details: details ?? null }, { status });
}

export async function GET(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const params = request.nextUrl.searchParams;
    const result = await listAdminArtists({
      search: params.get("search"),
      status: params.get("status"),
      page: Number(params.get("page") || 1),
      limit: Number(params.get("limit") || 50),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return jsonError("Failed to fetch artists.", 500, error instanceof Error ? error.message : error);
  }
}

export async function POST(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const body = await request.json();
    const artist = await createAdminArtist({
      name: body.name,
      slug: body.slug,
      bio: body.bio,
      image_url: body.image_url,
      status: body.status,
    });
    return NextResponse.json({ success: true, artist }, { status: 201 });
  } catch (error) {
    return jsonError("Failed to create artist.", 500, error instanceof Error ? error.message : error);
  }
}
