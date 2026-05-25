import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  buildEmotionalMetadata,
  buildEmotionalMetadataPatch,
} from "@/lib/emotionalMetadata";
import {
  applyNormalizedGenreToSongInsert,
  normalizeIncomingGenrePayload,
} from "@/lib/uploadGenreTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_SELECT =
  "id,title,genre,mood,energy,tempo_bpm,atmosphere,emotion,texture,time_of_day,vocal_feel,instrumentation,analysis_status,analysis_source";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type RouteContext = {
  params: Promise<{
    id: string;
    trackId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id, trackId } = await context.params;
    const releaseId = String(id || "").trim();
    const songId = String(trackId || "").trim();
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!releaseId || !songId) {
      return NextResponse.json(
        { success: false, error: "Missing release or track id." },
        { status: 400 }
      );
    }

    const normalizedGenre = normalizeIncomingGenrePayload({
      ...body,
      genre:
        body.legacyGenreOverride ||
        body.genre ||
        body.defaultGenre,
    });

    const emotionalResult = buildEmotionalMetadataPatch(body);

    if (!emotionalResult.ok) {
      return NextResponse.json(
        { success: false, error: emotionalResult.error },
        { status: 400 }
      );
    }

    const { data: existingTrack, error: trackError } = await supabaseAdmin
      .from("songs")
      .select("id, album_id, title, genre")
      .eq("id", songId)
      .eq("album_id", releaseId)
      .maybeSingle();

    if (trackError) throw trackError;

    if (!existingTrack) {
      return NextResponse.json(
        { success: false, error: "Track not found for this release." },
        { status: 404 }
      );
    }

    const patch = {
      ...applyNormalizedGenreToSongInsert({}, normalizedGenre),
      ...emotionalResult.patch,
    };

    const { data: updatedTrack, error: updateError } = await supabaseAdmin
      .from("songs")
      .update(patch)
      .eq("id", songId)
      .eq("album_id", releaseId)
      .select(TRACK_SELECT)
      .single();

    if (updateError) throw updateError;

    const emotionalMetadata = buildEmotionalMetadata(
      updatedTrack as Record<string, unknown>
    );

    return NextResponse.json({
      success: true,
      message: `"${existingTrack.title}" genre updated to ${normalizedGenre.genre}.`,
      track: {
        id: updatedTrack.id,
        title: updatedTrack.title,
        genre: updatedTrack.genre || normalizedGenre.genre,
        mood: updatedTrack.mood || null,
        emotionalMetadata,
      },
      genre: {
        mainGenreId: normalizedGenre.mainGenreId,
        subgenreId: normalizedGenre.subgenreId,
        genre: normalizedGenre.genre,
        mainGenre: normalizedGenre.mainGenre,
        subGenre: normalizedGenre.subGenre,
        genreSlug: normalizedGenre.genreSlug,
      },
      emotionalMetadata,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to update track metadata."),
      },
      { status: 500 }
    );
  }
}
