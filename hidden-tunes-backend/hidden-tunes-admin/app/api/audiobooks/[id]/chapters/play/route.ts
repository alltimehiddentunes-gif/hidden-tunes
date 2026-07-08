import { NextRequest, NextResponse } from "next/server";

import {
  jsonAudiobookError,
  loadAudiobookChapterQueuePlayback,
  logAudiobookError,
} from "@/lib/audiobookCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const fromChapterId = String(request.nextUrl.searchParams.get("from") || "").trim();

  if (!fromChapterId) {
    return jsonAudiobookError("Missing chapter id.", 400);
  }

  try {
    const playback = await loadAudiobookChapterQueuePlayback(id, fromChapterId, false);
    if (!playback) return jsonAudiobookError("Audiobook chapter not found.", 404);
    if (!playback.chapters.length) {
      return jsonAudiobookError("Audiobook chapter audio is unavailable.", 404);
    }

    return NextResponse.json({
      success: true,
      audiobook_id: playback.audiobook.id,
      audiobook: playback.audiobook,
      from_chapter_id: playback.from_chapter_id,
      start_index: playback.start_index,
      chapters: playback.chapters,
    });
  } catch (error) {
    logAudiobookError("Failed to resolve audiobook chapter queue.", error);
    return jsonAudiobookError("Failed to resolve audiobook chapter queue.", 500, error);
  }
}
