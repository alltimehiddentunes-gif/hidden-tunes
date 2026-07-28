import { NextResponse } from "next/server";

import {
  getLecturePlayableItem,
  jsonLectureError,
  logLectureError,
} from "@/lib/lectureCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const lessonId = new URL(request.url).searchParams.get("lessonId");

  try {
    const playback = await getLecturePlayableItem(id, lessonId);
    if (!playback) return jsonLectureError("Lecture not found.", 404);

    if (lessonId && !playback.media) {
      return jsonLectureError("Lesson not found.", 404);
    }

    if (!playback.media) {
      return jsonLectureError("Lecture media is unavailable.", 404);
    }

    if (lessonId && playback.media.id !== lessonId) {
      return jsonLectureError("Lesson not found.", 404);
    }

    const playableUrl = playback.media.audio_url || playback.media.video_url || "";
    const mediaType = playback.media.audio_url ? "audio" : "video";

    return NextResponse.json(
      {
        success: true,
        item_id: playback.media.id,
        program_id: playback.lecture.id,
        title: playback.media.title || playback.lecture.title,
        speaker: playback.lecture.speaker_name || playback.lecture.instructor_name || playback.lecture.coach_name,
        media_type: mediaType,
        playback_url: playableUrl,
        duration_seconds: playback.media.duration_seconds ?? null,
        mime_type: playback.media.mime_type || (mediaType === "audio" ? "audio/mpeg" : "video/mp4"),
        artwork_url: playback.lecture.artwork_url,
        expires_at: null,
        media: {
          id: playback.media.id,
          item_id: playback.media.item_id,
          title: playback.media.title,
          lesson_number: playback.media.lesson_number,
          media_type: mediaType,
          mime_type: playback.media.mime_type,
          duration_seconds: playback.media.duration_seconds,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    logLectureError("Failed to resolve lecture playback.", error);
    return jsonLectureError("Failed to resolve lecture playback.", 500, error);
  }
}
