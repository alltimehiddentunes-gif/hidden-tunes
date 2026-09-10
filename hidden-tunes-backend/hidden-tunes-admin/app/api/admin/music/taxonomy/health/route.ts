import { NextRequest, NextResponse } from "next/server";

import { musicTaxonomyErrorResponse } from "@/lib/musicTaxonomyHttp";
import { getMusicTaxonomyHealth } from "@/lib/musicTaxonomyRepository";
import { requireUploadPermission } from "@/lib/requireUploadPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const permission = await requireUploadPermission(request);
  if (permission.errorResponse) return permission.errorResponse;

  try {
    const health = await getMusicTaxonomyHealth();
    return NextResponse.json({ success: true, health });
  } catch (error) {
    return musicTaxonomyErrorResponse(error, "Failed to load music taxonomy health.");
  }
}
