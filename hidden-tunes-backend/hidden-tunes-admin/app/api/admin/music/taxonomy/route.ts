import { NextRequest, NextResponse } from "next/server";

import { canManageMusicTaxonomy } from "@/lib/adminPermissions";
import { musicTaxonomyErrorResponse } from "@/lib/musicTaxonomyHttp";
import {
  MUSIC_TAXONOMY_TYPES,
  MusicTaxonomyType,
  isMusicTaxonomyType,
} from "@/lib/musicTaxonomy";
import {
  createMusicTaxonomyTerm,
  listMusicTaxonomyTerms,
} from "@/lib/musicTaxonomyRepository";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["ACTIVE", "HIDDEN", "DEPRECATED", "MERGED"] as const;

export async function GET(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  const params = request.nextUrl.searchParams;
  const requestedType = String(params.get("type") || "").trim();
  const taxonomyType = isMusicTaxonomyType(requestedType)
    ? (requestedType as MusicTaxonomyType)
    : undefined;
  const includeManagerTerms = canManageMusicTaxonomy(permission.profile.role);
  const requestedStatus = String(params.get("status") || "").trim().toUpperCase();
  const statuses: Array<(typeof STATUSES)[number]> = includeManagerTerms
    ? requestedStatus && (STATUSES as readonly string[]).includes(requestedStatus)
      ? [requestedStatus as (typeof STATUSES)[number]]
      : [...STATUSES]
    : ["ACTIVE"];

  try {
    const result = await listMusicTaxonomyTerms({
      query: String(params.get("q") || "").trim().slice(0, 80) || undefined,
      taxonomyType,
      parentId:
        params.get("parentId") === "root"
          ? null
          : String(params.get("parentId") || "").trim() || undefined,
      statuses,
      page: Number(params.get("page")) || 1,
      pageSize: Number(params.get("pageSize")) || 50,
      includeUsage: includeManagerTerms,
    });

    return NextResponse.json({
      success: true,
      ...result,
      taxonomyTypes: MUSIC_TAXONOMY_TYPES,
    });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to load music taxonomy.");
  }
}

export async function POST(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;
  if (!canManageMusicTaxonomy(permission.profile.role)) {
    return NextResponse.json(
      { success: false, error: "Taxonomy term management requires an owner or admin role." },
      { status: 403 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const term = await createMusicTaxonomyTerm(body);
    return NextResponse.json({ success: true, term }, { status: 201 });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to create taxonomy term.");
  }
}
