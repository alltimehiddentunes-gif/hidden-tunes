import { NextRequest, NextResponse } from "next/server";

import { canManageMusicTaxonomy } from "@/lib/adminPermissions";
import { musicTaxonomyErrorResponse } from "@/lib/musicTaxonomyHttp";
import { mergeMusicTaxonomyTerm } from "@/lib/musicTaxonomyRepository";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;
  if (!canManageMusicTaxonomy(permission.profile.role)) {
    return NextResponse.json(
      { success: false, error: "Taxonomy merge requires an owner or admin role." },
      { status: 403 }
    );
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const targetTermId = String(body.targetTermId || body.target_term_id || "").trim();
    const sourceTerm = await mergeMusicTaxonomyTerm(
      String(id || "").trim(),
      targetTermId,
      permission.profile.id
    );
    return NextResponse.json({ success: true, sourceTerm });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to merge taxonomy term.");
  }
}
