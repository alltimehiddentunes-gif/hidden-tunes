import { NextRequest, NextResponse } from "next/server";

import {
  analyzeSongEmotionalMetadata,
  type EmotionalSongAnalysisResult,
} from "@/lib/emotionalAudioAnalysis";
import { EMOTIONAL_ANALYSIS_MAX_BATCH } from "@/lib/emotionalTaxonomy";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SONG_SELECT =
  "id,title,audio_url,url,mood,genre,duration,duration_seconds";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizeSongIds(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
}

export async function POST(request: NextRequest) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const songIds = normalizeSongIds(body.songIds);

    if (!songIds.length) {
      return NextResponse.json(
        { success: false, error: "Provide at least one song id to analyze." },
        { status: 400 }
      );
    }

    if (songIds.length > EMOTIONAL_ANALYSIS_MAX_BATCH) {
      return NextResponse.json(
        {
          success: false,
          error: `Batch limit is ${EMOTIONAL_ANALYSIS_MAX_BATCH} songs per request.`,
        },
        { status: 400 }
      );
    }

    const { data: songs, error: songsError } = await supabaseAdmin
      .from("songs")
      .select(SONG_SELECT)
      .in("id", songIds);

    if (songsError) throw songsError;

    const songMap = new Map(
      (songs || []).map((song) => [String(song.id), song])
    );

    const results: EmotionalSongAnalysisResult[] = [];

    for (const songId of songIds) {
      const song = songMap.get(songId);

      if (!song) {
        results.push({
          songId,
          title: "Unknown song",
          status: "failed",
          error: "Song not found in catalog.",
          confidence: 0,
          signals: {
            bpm: null,
            durationSeconds: null,
            bitrateKbps: null,
            codec: null,
            moodHint: null,
            genreHint: null,
          },
          suggestion: null,
        });
        continue;
      }

      const analysis = await analyzeSongEmotionalMetadata({
        id: String(song.id),
        title: String(song.title || "Untitled"),
        audio_url: song.audio_url,
        url: song.url,
        mood: song.mood,
        genre: song.genre,
        duration: song.duration,
        duration_seconds: song.duration_seconds,
      });

      results.push(analysis);
    }

    const suggestedCount = results.filter(
      (entry) => entry.status === "suggested"
    ).length;
    const failedCount = results.filter((entry) => entry.status === "failed").length;

    return NextResponse.json({
      success: true,
      message: `Generated ${suggestedCount} suggestion(s). ${failedCount} failed.`,
      maxBatchSize: EMOTIONAL_ANALYSIS_MAX_BATCH,
      results,
      summary: {
        requested: songIds.length,
        suggested: suggestedCount,
        failed: failedCount,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(
          error,
          "Failed to analyze emotional metadata suggestions."
        ),
      },
      { status: 500 }
    );
  }
}
