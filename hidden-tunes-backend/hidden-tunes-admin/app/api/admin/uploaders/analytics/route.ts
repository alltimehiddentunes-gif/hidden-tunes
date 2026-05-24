import { NextRequest, NextResponse } from "next/server";

import { canManageUploaders } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeAllUploaderAnalytics } from "@/lib/uploaderAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    if (!canManageUploaders(permission.profile.role)) {
      return NextResponse.json(
        { success: false, error: "Owner access is required for uploader analytics." },
        { status: 403 }
      );
    }

    const { data: uploaders, error } = await supabaseAdmin
      .from("uploader_profiles")
      .select("id")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const uploaderIds = ((uploaders || []) as Array<{ id?: string }>)
      .map((row) => String(row.id || "").trim())
      .filter(Boolean);

    const analyticsMap = await computeAllUploaderAnalytics(uploaderIds);

    return NextResponse.json({
      success: true,
      analytics: Object.fromEntries(analyticsMap.entries()),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load uploader analytics."),
      },
      { status: 500 }
    );
  }
}
