import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    trackId: string;
  }>;
};

type SongRow = {
  id: string;
  album_id: string | null;
  title: string | null;
  artwork_url?: string | null;
  cover_url?: string | null;
  audio_url?: string | null;
  url?: string | null;
  lyrics_url?: string | null;
};

type AlbumRow = {
  id: string;
  title: string | null;
  artwork_url?: string | null;
};

type LyricsRow = {
  song_id: string;
  lyrics_type: string | null;
  plain_lyrics: string | null;
  synced_lrc: string | null;
  word_sync_json: unknown | null;
  r2_lyrics_key: string | null;
  lyrics_url: string | null;
  source: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function hasLrcTimestamps(value: string) {
  if (!value.trim()) return true;
  return /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(value);
}

async function getTrack(releaseId: string, trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select(
      "id, album_id, title, artwork_url, cover_url, audio_url, url, lyrics_url"
    )
    .eq("id", trackId)
    .eq("album_id", releaseId)
    .maybeSingle();

  if (error) throw error;
  return data as SongRow | null;
}

async function getRelease(releaseId: string) {
  const { data, error } = await supabaseAdmin
    .from("albums")
    .select("id, title, artwork_url")
    .eq("id", releaseId)
    .maybeSingle();

  if (error) throw error;
  return data as AlbumRow | null;
}

async function getLyrics(trackId: string) {
  const { data, error } = await supabaseAdmin
    .from("track_lyrics")
    .select("*")
    .eq("song_id", trackId)
    .maybeSingle();

  if (error) throw error;
  return data as LyricsRow | null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id, trackId } = await context.params;
    const [release, track] = await Promise.all([
      getRelease(id),
      getTrack(id, trackId),
    ]);

    if (!release || !track) {
      return NextResponse.json(
        { success: false, error: "Release or track was not found." },
        { status: 404 }
      );
    }

    const lyrics = await getLyrics(trackId);
    const artworkUrl =
      track.artwork_url || track.cover_url || release.artwork_url || null;
    const audioUrl = String(track.audio_url || track.url || "").trim() || null;

    return NextResponse.json({
      success: true,
      release: {
        id: release.id,
        title: release.title || "Untitled Release",
        artworkUrl: release.artwork_url || null,
      },
      track: {
        id: track.id,
        title: track.title || "Untitled Track",
        artworkUrl,
        audioUrl,
      },
      lyrics: {
        plainLyrics: lyrics?.plain_lyrics || "",
        syncedLrc: lyrics?.synced_lrc || "",
        lyricsType: lyrics?.lyrics_type || null,
        lyricsUrl: lyrics?.lyrics_url || track.lyrics_url || null,
        source: lyrics?.source || null,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load lyrics."),
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id, trackId } = await context.params;
    const body = await request.json();
    const mode = String(body.mode || "").trim();
    const value = String(body.value || "");

    if (mode !== "plain" && mode !== "synced") {
      return NextResponse.json(
        { success: false, error: "Invalid lyrics editor mode." },
        { status: 400 }
      );
    }

    if (mode === "synced" && !hasLrcTimestamps(value)) {
      return NextResponse.json(
        {
          success: false,
          error: "Synced lyrics need at least one LRC timestamp like [00:12.34].",
        },
        { status: 400 }
      );
    }

    const track = await getTrack(id, trackId);

    if (!track) {
      return NextResponse.json(
        { success: false, error: "Track was not found for this release." },
        { status: 404 }
      );
    }

    const existingLyrics = await getLyrics(trackId);
    const plainLyrics =
      mode === "plain" ? value : String(existingLyrics?.plain_lyrics || "");
    const syncedLrc =
      mode === "synced" ? value : String(existingLyrics?.synced_lrc || "");
    const hasLyrics = Boolean(plainLyrics.trim() || syncedLrc.trim());
    const lyricsType = syncedLrc.trim() ? "lrc" : plainLyrics.trim() ? "plain" : null;
    const lyricsPayload = {
      song_id: trackId,
      lyrics_type: lyricsType,
      plain_lyrics: plainLyrics || null,
      synced_lrc: syncedLrc || null,
      word_sync_json: existingLyrics?.word_sync_json || null,
      r2_lyrics_key: existingLyrics?.r2_lyrics_key || null,
      lyrics_url: existingLyrics?.lyrics_url || track.lyrics_url || null,
      source: "admin_editor",
    };

    if (existingLyrics) {
      const { error: updateLyricsError } = await supabaseAdmin
        .from("track_lyrics")
        .update(lyricsPayload)
        .eq("song_id", trackId);

      if (updateLyricsError) throw updateLyricsError;
    } else {
      const { error: insertLyricsError } = await supabaseAdmin
        .from("track_lyrics")
        .insert(lyricsPayload);

      if (insertLyricsError) throw insertLyricsError;
    }

    const { error: updateSongError } = await supabaseAdmin
      .from("songs")
      .update({
        has_lyrics: hasLyrics,
        lyrics_type: lyricsType,
        lyrics_updated_at: new Date().toISOString(),
      })
      .eq("id", trackId)
      .eq("album_id", id);

    if (updateSongError) throw updateSongError;

    return NextResponse.json({
      success: true,
      message:
        mode === "plain"
          ? "Plain lyrics saved."
          : "Synced lyrics saved.",
      lyrics: {
        plainLyrics,
        syncedLrc,
        lyricsType,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to save lyrics."),
      },
      { status: 500 }
    );
  }
}
