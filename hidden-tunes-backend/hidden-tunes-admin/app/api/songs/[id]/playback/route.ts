import { NextRequest, NextResponse } from "next/server";

import {
  getMusicRenditionStorageKey,
  isMusicPlaybackAuthorized,
  selectMusicRendition,
  signMusicRendition,
} from "@/lib/musicPlaybackResolver";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { qualityMode?: unknown };
    const { data, error } = await supabaseAdmin
      .from("songs")
      .select("id, is_public, audio_url, url, audio_versions, rights_status, rights_expires_at, rights_regions")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    const song = data as Record<string, unknown> | null;
    const region = request.headers.get("cf-ipcountry") || "";
    if (!isMusicPlaybackAuthorized(song, region)) {
      return NextResponse.json({ error: "This track is unavailable." }, { status: 404 });
    }

    const selected = selectMusicRendition(song?.audio_versions, body.qualityMode);
    const storageKey = getMusicRenditionStorageKey(selected?.rendition || null);
    let playbackUrl = storageKey ? await signMusicRendition(storageKey) : "";
    let expiresAt: string | null = storageKey
      ? new Date(Date.now() + 900_000).toISOString()
      : null;

    if (!playbackUrl && selected?.rendition) {
      playbackUrl = String(selected.rendition.url || "").trim();
      expiresAt = null;
    }
    if (!playbackUrl) {
      playbackUrl = String(song?.audio_url || song?.url || "").trim();
      expiresAt = null;
    }
    if (!playbackUrl) {
      return NextResponse.json(
        { error: "This track has no playable rendition." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      songId: id,
      playbackUrl,
      qualityMode: selected?.mode || "legacy",
      tier: selected?.tier || "legacy",
      codec: selected?.rendition?.codec || null,
      bitrateKbps:
        selected?.rendition?.bitrateKbps ?? selected?.rendition?.bitrate_kbps ?? null,
      expiresAt,
    });
  } catch (error) {
    console.error("POST /api/songs/[id]/playback failed", error);
    return NextResponse.json({ error: "Could not resolve playback." }, { status: 500 });
  }
}
