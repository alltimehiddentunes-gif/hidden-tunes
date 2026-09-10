import { NextRequest, NextResponse } from "next/server";

import { canManageMusicTaxonomy } from "@/lib/adminPermissions";
import { musicTaxonomyErrorResponse } from "@/lib/musicTaxonomyHttp";
import {
  createMusicTaxonomyAlias,
  deleteMusicTaxonomyAlias,
  listMusicTaxonomyAliases,
} from "@/lib/musicTaxonomyRepository";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function requireManager(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission;
  if (!canManageMusicTaxonomy(permission.profile.role)) {
    return {
      ...permission,
      errorResponse: NextResponse.json(
        { success: false, error: "Taxonomy alias management requires an owner or admin role." },
        { status: 403 }
      ),
    };
  }
  return permission;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const permission = await requireManager(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const alias = await createMusicTaxonomyAlias(
      String(id || "").trim(),
      body.alias,
      permission.profile.id
    );
    if (!alias) {
      return NextResponse.json({ success: false, error: "Taxonomy term not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, alias }, { status: 201 });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to create taxonomy alias.");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const { id } = await context.params;
    const aliases = await listMusicTaxonomyAliases(String(id || "").trim());
    return NextResponse.json({ success: true, aliases });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to load taxonomy aliases.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const permission = await requireManager(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const { id } = await context.params;
    const aliasId = String(request.nextUrl.searchParams.get("aliasId") || "").trim();
    if (!aliasId) {
      return NextResponse.json({ success: false, error: "aliasId is required." }, { status: 400 });
    }
    await deleteMusicTaxonomyAlias(String(id || "").trim(), aliasId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to delete taxonomy alias.");
  }
}
