import { NextRequest, NextResponse } from "next/server";

import {
  buildEmotionalApplyItemBody,
  buildEmotionalMetadata,
  buildEmotionalMetadataPatch,
} from "@/lib/emotionalMetadata";
import { EMOTIONAL_ANALYSIS_QUEUE_MAX } from "@/lib/emotionalAnalysisQueue";
import { EMOTIONAL_ANALYSIS_APPLY_SOURCE } from "@/lib/emotionalTaxonomy";
import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_SELECT =
  "id,title,genre,mood,energy,tempo_bpm,atmosphere,emotion,texture,time_of_day,vocal_feel,instrumentation,analysis_status,analysis_source";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type ApplyItem = Record<string, unknown> & {
  songId?: unknown;
};

function normalizeApplyItems(value: unknown) {
  if (!Array.isArray(value)) return [] as ApplyItem[];

  return value.filter(
    (entry): entry is ApplyItem =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
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
    const items = normalizeApplyItems(body.items);

    if (!items.length) {
      return NextResponse.json(
        { success: false, error: "Provide at least one song to apply." },
        { status: 400 }
      );
    }

    if (items.length > EMOTIONAL_ANALYSIS_QUEUE_MAX) {
      return NextResponse.json(
        {
          success: false,
          error: `Batch limit is ${EMOTIONAL_ANALYSIS_QUEUE_MAX} songs per request.`,
        },
        { status: 400 }
      );
    }

    const applied: Array<{
      songId: string;
      title: string;
      emotionalMetadata: ReturnType<typeof buildEmotionalMetadata>;
    }> = [];
    const failures: Array<{ songId: string; error: string }> = [];

    for (const item of items) {
      const songId = String(item.songId || "").trim();

      if (!songId) {
        failures.push({ songId: "", error: "Missing song id." });
        continue;
      }

      const emotionalResult = buildEmotionalMetadataPatch(
        buildEmotionalApplyItemBody({
          ...item,
          analysisStatus: "approved",
          analysisSource: EMOTIONAL_ANALYSIS_APPLY_SOURCE,
        })
      );

      if (!emotionalResult.ok) {
        failures.push({ songId, error: emotionalResult.error });
        continue;
      }

      const { data: existingSong, error: existingError } = await supabaseAdmin
        .from("songs")
        .select("id,title")
        .eq("id", songId)
        .maybeSingle();

      if (existingError) throw existingError;

      if (!existingSong) {
        failures.push({ songId, error: "Song not found in catalog." });
        continue;
      }

      const { data: updatedSong, error: updateError } = await supabaseAdmin
        .from("songs")
        .update(emotionalResult.patch)
        .eq("id", songId)
        .select(TRACK_SELECT)
        .single();

      if (updateError) {
        failures.push({
          songId,
          error: updateError.message || "Failed to update song.",
        });
        continue;
      }

      applied.push({
        songId,
        title: String(updatedSong.title || existingSong.title || "Untitled"),
        emotionalMetadata: buildEmotionalMetadata(
          updatedSong as Record<string, unknown>
        ),
      });
    }

    return NextResponse.json({
      success: applied.length > 0,
      message:
        failures.length === 0
          ? `Applied emotional metadata to ${applied.length} song(s).`
          : `Applied ${applied.length} song(s). ${failures.length} failed.`,
      applied,
      failures,
      summary: {
        requested: items.length,
        applied: applied.length,
        failed: failures.length,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(
          error,
          "Failed to apply emotional metadata analysis."
        ),
      },
      { status: 500 }
    );
  }
}
