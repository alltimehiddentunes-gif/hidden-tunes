import { NextRequest, NextResponse } from "next/server";

import { requireUploadPermission } from "@/lib/requireUploadPermission";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type SongRow = Record<string, string | number | boolean | null | undefined>;

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const permission = await requireUploadPermission(request);

    if (permission.errorResponse) {
      return permission.errorResponse;
    }

    const { id } = await context.params;
    const releaseId = String(id || "").trim();

    if (!releaseId) {
      return NextResponse.json(
        { success: false, error: "Missing release id." },
        { status: 400 }
      );
    }

    const { data: album, error: albumError } = await supabaseAdmin
      .from("albums")
      .select("id, title, slug, artist_id, artwork_url, release_year, created_at")
      .eq("id", releaseId)
      .maybeSingle();

    if (albumError) throw albumError;

    if (!album) {
      return NextResponse.json(
        { success: false, error: "Release not found." },
        { status: 404 }
      );
    }

    const { data: artist, error: artistError } = await supabaseAdmin
      .from("artists")
      .select("id, name, slug, image_url")
      .eq("id", album.artist_id)
      .maybeSingle();

    if (artistError) throw artistError;

    const { data: tracks, error: tracksError } = await supabaseAdmin
      .from("songs")
      .select(
        [
          "id",
          "title",
          "slug",
          "artist",
          "artist_name",
          "album",
          "album_title",
          "genre",
          "mood",
          "duration",
          "duration_seconds",
          "audio_url",
          "url",
          "cover_url",
          "artwork_url",
          "r2_audio_key",
          "r2_cover_key",
          "lyrics_url",
          "has_lyrics",
          "lyrics_type",
          "lyrics_updated_at",
          "source_name",
          "source_type",
          "type",
          "is_online",
          "isOnline",
          "created_at",
        ].join(",")
      )
      .eq("album_id", releaseId)
      .order("created_at", { ascending: true });

    if (tracksError) throw tracksError;

    const songRows = (tracks || []) as unknown as SongRow[];

    const normalizedTracks = songRows.map((track, index) => ({
      id: track.id,
      title: track.title || `Track ${index + 1}`,
      artist: track.artist || track.artist_name || artist?.name || "Unknown Artist",
      album: track.album || track.album_title || album.title,
      genre: track.genre || null,
      mood: track.mood || null,
      duration: track.duration_seconds || track.duration || 0,
      audioUrl: track.audio_url || track.url || null,
      artworkUrl: track.artwork_url || track.cover_url || album.artwork_url || null,
      audioKey: track.r2_audio_key || null,
      artworkKey: track.r2_cover_key || null,
      lyricsUrl: track.lyrics_url || null,
      hasLyrics: Boolean(track.has_lyrics || track.lyrics_url),
      lyricsType: track.lyrics_type || null,
      lyricsUpdatedAt: track.lyrics_updated_at || null,
      sourceName: track.source_name || "Hidden Tunes",
      sourceType: track.source_type || track.type || "r2",
      isOnline: track.is_online ?? track.isOnline ?? true,
      createdAt: track.created_at || null,
    }));

    return NextResponse.json({
      success: true,
      release: {
        id: album.id,
        title: album.title || "Untitled Release",
        slug: album.slug || null,
        artist: artist?.name || normalizedTracks[0]?.artist || "Unknown Artist",
        artistId: artist?.id || album.artist_id || null,
        artworkUrl:
          album.artwork_url ||
          normalizedTracks.find((track) => Boolean(track.artworkUrl))?.artworkUrl ||
          artist?.image_url ||
          null,
        releaseYear: album.release_year || null,
        createdAt: album.created_at || null,
        tracks: normalizedTracks,
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error, "Failed to load release."),
      },
      { status: 500 }
    );
  }
}
