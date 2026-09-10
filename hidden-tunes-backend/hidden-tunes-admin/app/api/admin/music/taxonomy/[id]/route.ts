import { NextRequest, NextResponse } from "next/server";

import { canManageMusicTaxonomy } from "@/lib/adminPermissions";
import { musicTaxonomyErrorResponse } from "@/lib/musicTaxonomyHttp";
import {
  getMusicTaxonomyTerm,
  updateMusicTaxonomyTerm,
} from "@/lib/musicTaxonomyRepository";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const { id } = await context.params;
    const term = await getMusicTaxonomyTerm(String(id || "").trim());
    if (!term) return NextResponse.json({ success: false, error: "Taxonomy term not found." }, { status: 404 });
    return NextResponse.json({ success: true, term });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to load taxonomy term.");
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;
  if (!canManageMusicTaxonomy(permission.profile.role)) {
    return NextResponse.json(
      { success: false, error: "Taxonomy term management requires an owner or admin role." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const term = await updateMusicTaxonomyTerm(String(id || "").trim(), body);
    if (!term) {
      return NextResponse.json({ success: false, error: "Taxonomy term not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, term });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to update taxonomy term.");
  }
}

export async function DELETE() {
  return NextResponse.json(
    {
      success: false,
      error: "Taxonomy terms are never destructively deleted. Hide, deprecate, or merge the term instead.",
    },
    { status: 405, headers: { Allow: "PATCH" } }
  );
}
