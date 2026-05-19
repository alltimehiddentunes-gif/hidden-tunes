import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  applyNormalizedGenreToSongInsert,
  normalizeIncomingGenrePayload,
} from "@/lib/uploadGenreTaxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const body = await request.json().catch(() => ({}));

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

    const patch = applyNormalizedGenreToSongInsert({}, normalizedGenre);

    const { data: updatedTrack, error: updateError } = await supabaseAdmin
      .from("songs")
      .update(patch)
      .eq("id", songId)
      .eq("album_id", releaseId)
      .select("id,title,genre,mood")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: `"${existingTrack.title}" genre updated to ${normalizedGenre.genre}.`,
      track: {
        id: updatedTrack.id,
        title: updatedTrack.title,
        genre: updatedTrack.genre || normalizedGenre.genre,
        mood: updatedTrack.mood || null,
      },
      genre: {
        mainGenreId: normalizedGenre.mainGenreId,
        subgenreId: normalizedGenre.subgenreId,
        genre: normalizedGenre.genre,
        mainGenre: normalizedGenre.mainGenre,
        subGenre: normalizedGenre.subGenre,
        genreSlug: normalizedGenre.genreSlug,
      },
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
