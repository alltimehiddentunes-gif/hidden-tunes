import { NextRequest, NextResponse } from "next/server";

import { canEditAllTrackLyrics } from "@/lib/adminPermissions";
import { loadCreatorLyricsCatalog } from "@/lib/creatorLyricsCatalog";
import { requireCreatorLyricsPermission } from "@/lib/requireTrackLyricsPermission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(request: NextRequest) {
  try {
    const permission = await requireCreatorLyricsPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const tracks = await loadCreatorLyricsCatalog(
      permission.profile.id,
      permission.profile.role
    );

    return NextResponse.json({
      success: true,
      role: permission.profile.role,
      scope: canEditAllTrackLyrics(permission.profile.role) ? "all" : "owned",
      tracks,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load bulk lyrics catalog."),
      },
      { status: 500 }
    );
  }
}
