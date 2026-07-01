import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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
    const body = await request.json();

    if (!releaseId || !songId) {
      return NextResponse.json(
        { success: false, error: "Missing release or track id." },
        { status: 400 }
      );
    }

    const { data: existingTrack, error: trackError } = await supabaseAdmin
      .from("songs")
      .select("id, album_id, title")
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

    const patch: Record<string, string | null> = {};
    const audioUrl = String(body.audioUrl || "").trim();
    const audioKey = String(body.audioKey || "").trim();
    const artworkUrl = String(body.artworkUrl || "").trim();
    const artworkKey = String(body.artworkKey || "").trim();

    if (audioUrl && audioKey) {
      patch.audio_url = audioUrl;
      patch.url = audioUrl;
      patch.r2_audio_key = audioKey;
      patch.source_name = "Hidden Tunes";
      patch.source_type = "r2";
      patch.type = "r2";
    }

    if (artworkUrl) {
      patch.artwork_url = artworkUrl;
      patch.cover_url = artworkUrl;
      patch.r2_cover_key = artworkKey || null;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: "No replacement asset was provided." },
        { status: 400 }
      );
    }

    const { data: updatedTrack, error: updateError } = await supabaseAdmin
      .from("songs")
      .update(patch)
      .eq("id", songId)
      .eq("album_id", releaseId)
      .select(
        "id,title,audio_url,url,artwork_url,cover_url,r2_audio_key,r2_cover_key"
      )
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: `"${existingTrack.title}" was updated successfully.`,
      track: {
        id: updatedTrack.id,
        title: updatedTrack.title,
        audioUrl: updatedTrack.audio_url || updatedTrack.url || null,
        artworkUrl: updatedTrack.artwork_url || updatedTrack.cover_url || null,
        audioKey: updatedTrack.r2_audio_key || null,
        artworkKey: updatedTrack.r2_cover_key || null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to update track assets."),
      },
      { status: 500 }
    );
  }
}
