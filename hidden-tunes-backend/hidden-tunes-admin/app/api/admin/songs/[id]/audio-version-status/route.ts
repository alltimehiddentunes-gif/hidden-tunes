import { NextRequest, NextResponse } from "next/server";

import { proxyWorkerSongAudioVersionStatus } from "@/lib/audioVersionWorkerProxy";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { getSongAudioVersionStatus } from "@/lib/songAudioVersionGeneration";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id: songId } = await context.params;

    const workerProxy = await proxyWorkerSongAudioVersionStatus(songId);

    if (workerProxy) {
      return NextResponse.json(workerProxy.data || { success: false }, {
        status: workerProxy.status,
      });
    }

    const result = await getSongAudioVersionStatus({
      supabase: supabaseAdmin,
      songId,
    });

    return NextResponse.json(
      {
        success: result.success,
        status: result.audio_version_status ?? null,
        ...result,
      },
      { status: result.httpStatus || (result.success ? 200 : 500) }
    );
  } catch (error: unknown) {
    console.error("audio-version-status error:", error);

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Could not load audio version status."),
      },
      { status: 500 }
    );
  }
}
