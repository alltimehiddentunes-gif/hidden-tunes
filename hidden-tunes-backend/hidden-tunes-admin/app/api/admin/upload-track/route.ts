import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { uploadToR2 } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function detectLyricsType(text: string) {
  const hasTimestamp = /\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/.test(text);
  return hasTimestamp ? "lrc" : "plain";
}

function formatLrcTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  const wholeSeconds = Math.floor(remainingSeconds);
  const centiseconds = Math.floor((remainingSeconds - wholeSeconds) * 100);

  return `[${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(
    2,
    "0"
  )}.${String(centiseconds).padStart(2, "0")}]`;
}

function isSectionLabel(line: string) {
  return /^\[(intro|verse|chorus|bridge|outro|hook|pre-chorus|pre chorus|refrain|instrumental)\]$/i.test(
    line.trim()
  );
}

function generateEstimatedLrc(rawLyrics: string, durationSeconds: number) {
  const lines = String(rawLyrics || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isSectionLabel(line));

  if (lines.length === 0) return rawLyrics;

  const safeDuration =
    durationSeconds && durationSeconds > 20
      ? durationSeconds
      : Math.max(lines.length * 5, 60);

  const introSeconds = Math.min(8, Math.max(2, safeDuration * 0.04));
  const endingBufferSeconds = Math.min(8, Math.max(3, safeDuration * 0.04));

  const usableDuration = Math.max(
    safeDuration - introSeconds - endingBufferSeconds,
    lines.length * 3.5
  );

  const spacing = usableDuration / Math.max(lines.length - 1, 1);

  return lines
    .map((line, index) => {
      const time = index === 0 ? 0 : introSeconds + index * spacing;
      return `${formatLrcTime(time)} ${line}`;
    })
    .join("\n");
}

async function upsertArtist(name: string, slug: string, imageUrl: string) {
  const { data: existing } = await supabaseAdmin
    .from("artists")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("artists")
    .insert({
      name,
      slug,
      image_url: imageUrl,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function upsertAlbum(
  title: string,
  slug: string,
  artistId: string,
  artworkUrl: string
) {
  const { data: existing } = await supabaseAdmin
    .from("albums")
    .select("*")
    .eq("slug", slug)
    .eq("artist_id", artistId)
    .maybeSingle();

  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("albums")
    .insert({
      title,
      slug,
      artist_id: artistId,
      artwork_url: artworkUrl,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const title = String(body.title || body.titleOverride || "").trim();
    const artistName = String(body.artist || body.defaultArtist || "").trim();
    const albumTitle = String(body.album || body.defaultAlbum || "Singles").trim();
    const genre = String(body.genre || body.defaultGenre || "Afrobeat").trim();
    const mood = String(body.mood || body.defaultMood || "Premium").trim();

    const durationSeconds = Math.round(Number(body.duration || 0));

    const audioUrl = String(body.audioUrl || "").trim();
    const audioKey = String(body.audioKey || "").trim();

    const artworkUrlFromClient = String(body.artworkUrl || "").trim();
    const artworkKey = body.artworkKey ? String(body.artworkKey) : null;

    const lyricsText = String(body.lyricsText || "").trim();

    if (!title || !artistName || !audioUrl || !audioKey) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required song metadata or uploaded audio URL.",
        },
        { status: 400 }
      );
    }

    const songId = randomUUID();

    const artistSlug = slugify(artistName) || "unknown-artist";
    const titleSlug = slugify(title) || "untitled-song";
    const albumSlug = slugify(albumTitle) || "singles";

    const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").replace(
      /\/+$/,
      ""
    );

    const fallbackArtworkUrl = `${publicBaseUrl}/artists/${artistSlug}/profile.jpg`;

    const artworkUrl = artworkUrlFromClient || fallbackArtworkUrl;

    const artworkSource: "custom" | "fallback" = artworkUrlFromClient
      ? "custom"
      : "fallback";

    let lyricsUrl: string | null = null;
    let lyricsKey: string | null = null;
    let lyricsType: "lrc" | null = null;
    let syncedLrc: string | null = null;
    let plainLyrics: string | null = null;

    if (lyricsText) {
      const detectedType = detectLyricsType(lyricsText);

      lyricsType = "lrc";

      if (detectedType === "lrc") {
        syncedLrc = lyricsText;
        plainLyrics = null;
      } else {
        plainLyrics = lyricsText;
        syncedLrc = generateEstimatedLrc(lyricsText, durationSeconds);
      }

      lyricsKey = `lyrics/${artistSlug}/${songId}-${titleSlug}.lrc`;

      lyricsUrl = await uploadToR2({
        key: lyricsKey,
        body: Buffer.from(syncedLrc, "utf-8"),
        contentType: "text/plain; charset=utf-8",
      });
    }

    const artist = await upsertArtist(artistName, artistSlug, artworkUrl);
    const album = await upsertAlbum(albumTitle, albumSlug, artist.id, artworkUrl);

    const { data: song, error: songError } = await supabaseAdmin
      .from("songs")
      .insert({
        id: songId,

        title,
        slug: `${artistSlug}-${titleSlug}-${songId.slice(0, 8)}`,

        artist_id: artist.id,
        album_id: album.id,

        artist: artist.name,
        album: album.title,

        artist_name: artist.name,
        album_title: album.title,

        genre,
        mood,

        duration: durationSeconds,
        duration_seconds: durationSeconds,

        audio_url: audioUrl,
        cover_url: artworkUrl,

        url: audioUrl,
        artwork_url: artworkUrl,

        r2_audio_key: audioKey,
        r2_cover_key: artworkKey,

        lyrics_url: lyricsUrl,
        has_lyrics: Boolean(lyricsUrl),
        lyrics_type: lyricsType,
        lyrics_updated_at: lyricsUrl ? new Date().toISOString() : null,

        source_name: "Hidden Tunes",
        source_type: "r2",

        type: "r2",

        is_online: true,
        isOnline: true,
      })
      .select("*")
      .single();

    if (songError) throw songError;

    if (lyricsUrl && lyricsType) {
      const { error: lyricsError } = await supabaseAdmin
        .from("track_lyrics")
        .insert({
          song_id: song.id,
          lyrics_type: lyricsType,
          plain_lyrics: plainLyrics,
          synced_lrc: syncedLrc,
          word_sync_json: null,
          r2_lyrics_key: lyricsKey,
          lyrics_url: lyricsUrl,
          source: plainLyrics ? "auto_estimated_lrc" : "admin_upload",
        });

      if (lyricsError) throw lyricsError;
    }

    return NextResponse.json({
      success: true,
      track: {
        id: song.id,
        title: song.title,
        slug: song.slug,

        artist: song.artist || song.artist_name || artist.name,
        artistId: song.artist_id || artist.id,
        artist_id: song.artist_id || artist.id,
        artistSlug: artist.slug,

        album: song.album || song.album_title || album.title,
        albumId: song.album_id || album.id,
        album_id: song.album_id || album.id,
        albumSlug: album.slug,

        genre: song.genre,
        mood: song.mood,

        duration: song.duration_seconds || song.duration || durationSeconds,
        duration_seconds: song.duration_seconds || song.duration || durationSeconds,

        url: song.url || song.audio_url || audioUrl,
        audio_url: song.audio_url || song.url || audioUrl,

        artwork: song.artwork_url || song.cover_url || artworkUrl,
        cover_url: song.cover_url || song.artwork_url || artworkUrl,

        artworkSource,

        hasLyrics: Boolean(song.has_lyrics),
        has_lyrics: Boolean(song.has_lyrics),

        lyricsType: song.lyrics_type,
        lyrics_type: song.lyrics_type,

        lyricsUrl: song.lyrics_url,
        lyrics_url: song.lyrics_url,

        sourceName: song.source_name,
        source_name: song.source_name,

        type: song.type || song.source_type || "r2",
        source_type: song.source_type || song.type || "r2",

        isOnline: song.isOnline ?? song.is_online ?? true,
        is_online: song.is_online ?? song.isOnline ?? true,
      },
    });
  } catch (error: any) {
    console.error("Upload metadata save failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Upload metadata save failed.",
      },
      { status: 500 }
    );
  }
}