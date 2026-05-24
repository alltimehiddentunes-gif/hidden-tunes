import { NextRequest, NextResponse } from "next/server";

import { evaluateTrackLyricsAccess } from "@/lib/trackLyricsAccess";
import { requireCreatorLyricsPermission } from "@/lib/requireTrackLyricsPermission";
import { saveCreatorTrackLyrics } from "@/lib/saveCreatorTrackLyrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkSaveItem = {
  trackId?: string;
  releaseId?: string;
  mode?: string;
  value?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(request: NextRequest) {
  try {
    const permission = await requireCreatorLyricsPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const body = await request.json();
    const items = Array.isArray(body.items) ? (body.items as BulkSaveItem[]) : [];

    if (!items.length) {
      return NextResponse.json(
        { success: false, error: "No confirmed lyrics items were provided." },
        { status: 400 }
      );
    }

    if (items.length > 100) {
      return NextResponse.json(
        { success: false, error: "Bulk save is limited to 100 items per batch." },
        { status: 400 }
      );
    }

    const results: Array<{
      trackId: string;
      releaseId: string;
      success: boolean;
      message: string;
    }> = [];

    for (const item of items) {
      const trackId = String(item.trackId || "").trim();
      const releaseId = String(item.releaseId || "").trim();
      const mode = String(item.mode || "").trim();
      const value = String(item.value || "");

      if (!trackId || !releaseId) {
        results.push({
          trackId,
          releaseId,
          success: false,
          message: "Missing track or release id.",
        });
        continue;
      }

      if (mode !== "plain" && mode !== "synced") {
        results.push({
          trackId,
          releaseId,
          success: false,
          message: "Invalid lyrics mode.",
        });
        continue;
      }

      const access = await evaluateTrackLyricsAccess(
        permission.profile,
        trackId,
        releaseId
      );

      if (!access.allowed) {
        results.push({
          trackId,
          releaseId,
          success: false,
          message: "You do not have permission to edit this track.",
        });
        continue;
      }

      try {
        await saveCreatorTrackLyrics({
          trackId,
          releaseId,
          mode,
          value,
          source: "bulk_lyrics_intake",
        });

        results.push({
          trackId,
          releaseId,
          success: true,
          message:
            mode === "plain" ? "Plain lyrics saved." : "Synced lyrics saved.",
        });
      } catch (error: unknown) {
        results.push({
          trackId,
          releaseId,
          success: false,
          message: getErrorMessage(error, "Failed to save lyrics."),
        });
      }
    }

    const savedCount = results.filter((result) => result.success).length;
    const failedCount = results.length - savedCount;

    return NextResponse.json({
      success: failedCount === 0,
      savedCount,
      failedCount,
      results,
      message:
        failedCount === 0
          ? `${savedCount} lyrics file${savedCount === 1 ? "" : "s"} saved.`
          : `${savedCount} saved, ${failedCount} failed.`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to save bulk lyrics."),
      },
      { status: 500 }
    );
  }
}
