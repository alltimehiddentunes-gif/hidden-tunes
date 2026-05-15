import express from "express";
import { supabase } from "../services/supabase.js";

const router = express.Router();

function normalizeLyricsResponse(songId, row, fallbackSong = null) {
  const syncedLrc =
    row?.synced_lrc ||
    row?.syncedLrc ||
    fallbackSong?.synced_lrc ||
    fallbackSong?.synced_lyrics ||
    fallbackSong?.lrc ||
    null;

  const plainLyrics =
    row?.plain_lyrics ||
    row?.plainLyrics ||
    fallbackSong?.plain_lyrics ||
    fallbackSong?.lyrics ||
    null;

  const lyricsUrl = row?.lyrics_url || fallbackSong?.lyrics_url || null;

  return {
    success: true,
    songId,
    lyrics_type: row?.lyrics_type || (syncedLrc ? "lrc" : plainLyrics ? "plain" : null),
    lyricsType: row?.lyrics_type || (syncedLrc ? "lrc" : plainLyrics ? "plain" : null),
    synced_lrc: syncedLrc,
    syncedLrc,
    lrc: syncedLrc,
    plain_lyrics: plainLyrics,
    plainLyrics,
    lyrics: plainLyrics,
    lyrics_url: lyricsUrl,
    lyricsUrl,
    source: row?.source || (fallbackSong ? "songs_table" : null),
  };
}

async function getLyricsPayload(songId) {
  const { data: lyricRow, error: lyricError } = await supabase
    .from("track_lyrics")
    .select(
      `
      song_id,
      lyrics_type,
      plain_lyrics,
      synced_lrc,
      lyrics_url,
      source
    `
    )
    .eq("song_id", songId)
    .maybeSingle();

  if (lyricError) throw lyricError;

  if (lyricRow?.plain_lyrics || lyricRow?.synced_lrc || lyricRow?.lyrics_url) {
    return normalizeLyricsResponse(songId, lyricRow);
  }

  const { data: songRow, error: songError } = await supabase
    .from("songs")
    .select(
      `
      id,
      lyrics,
      synced_lyrics,
      lyrics_url
    `
    )
    .eq("id", songId)
    .maybeSingle();

  if (songError) throw songError;

  if (
    songRow?.lyrics ||
    songRow?.synced_lyrics ||
    songRow?.lyrics_url
  ) {
    return normalizeLyricsResponse(songId, null, songRow);
  }

  return null;
}

export async function handleLyricsRequest(req, res) {
  try {
    const songId = String(req.params.id || req.params.songId || "").trim();

    if (!songId) {
      return res.status(400).json({
        success: false,
        error: "Missing song id.",
      });
    }

    const lyrics = await getLyricsPayload(songId);

    if (!lyrics) {
      return res.status(404).json({
        success: false,
        error: "No lyrics found for this song.",
        songId,
      });
    }

    return res.json(lyrics);
  } catch (error) {
    console.error("Lyrics route failed:", error);

    return res.status(500).json({
      success: false,
      error: "Lyrics fetch failed.",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

router.get("/:id", handleLyricsRequest);

export default router;
