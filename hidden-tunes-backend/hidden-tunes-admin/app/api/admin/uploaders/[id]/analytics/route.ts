import { NextRequest, NextResponse } from "next/server";

import { canManageUploaders } from "@/lib/adminPermissions";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { computeUploaderAnalytics } from "@/lib/uploaderAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest, context: RouteContext) {
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

    const { id } = await context.params;
    const uploaderId = String(id || "").trim();

    if (!uploaderId) {
      return NextResponse.json(
        { success: false, error: "Missing uploader id." },
        { status: 400 }
      );
    }

    const analytics = await computeUploaderAnalytics(uploaderId);

    return NextResponse.json({
      success: true,
      analytics,
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
