import { NextResponse } from "next/server";

import {
  jsonAudiobookError,
  loadAudiobookPlayback,
  logAudiobookError,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  try {
    const playback = await loadAudiobookPlayback(id, true);
    if (!playback) return jsonAudiobookError("Mature audiobook not found.", 404);
    if (!playback.file) {
      return jsonAudiobookError("Mature audiobook audio is unavailable.", 404);
    }

    return NextResponse.json({
      success: true,
      audiobook_id: playback.audiobook.id,
      title: playback.audiobook.title,
      file: playback.file,
      audio_url: playback.file.audio_url,
    });
  } catch (error) {
    logAudiobookError("Failed to resolve mature audiobook playback.", error);
    return jsonAudiobookError(
      "Failed to resolve mature audiobook playback.",
      500,
      error
    );
  }
}
