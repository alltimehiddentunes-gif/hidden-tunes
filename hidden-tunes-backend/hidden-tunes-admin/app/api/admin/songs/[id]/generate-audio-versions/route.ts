import { NextRequest, NextResponse } from "next/server";

import { proxyWorkerGenerateSongAudioVersions } from "@/lib/audioVersionWorkerProxy";
import { uploadToR2 } from "@/lib/r2";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { generateSongAudioVersions } from "@/lib/songAudioVersionGeneration";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id: songId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      force?: boolean;
    };
    const force = Boolean(body.force);

    const workerProxy = await proxyWorkerGenerateSongAudioVersions(songId, {
      force,
    });

    if (workerProxy) {
      return NextResponse.json(workerProxy.data || { success: false }, {
        status: workerProxy.status,
      });
    }

    const result = await generateSongAudioVersions({
      supabase: supabaseAdmin,
      songId,
      force,
      uploadToR2: async ({ key, body: fileBody, contentType }) =>
        uploadToR2({
          key,
          body: fileBody,
          contentType,
        }),
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
    console.error("generate-audio-versions error:", error);

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Audio version generation failed."),
      },
      { status: 500 }
    );
  }
}
