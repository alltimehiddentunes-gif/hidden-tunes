import { hasLrcTimestamps } from "@/lib/bulkLyricsIntake";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type LyricsRow = {
  plain_lyrics: string | null;
  synced_lrc: string | null;
  word_sync_json: unknown | null;
  r2_lyrics_key: string | null;
  lyrics_url: string | null;
};

export type SaveCreatorTrackLyricsInput = {
  releaseId: string;
  trackId: string;
  mode: "plain" | "synced";
  value: string;
  source?: string;
};

export async function saveCreatorTrackLyrics(input: SaveCreatorTrackLyricsInput) {
  const releaseId = String(input.releaseId || "").trim();
  const trackId = String(input.trackId || "").trim();
  const mode = input.mode;
  const value = String(input.value || "");

  if (!releaseId || !trackId) {
    throw new Error("Missing release or track id.");
  }

  if (mode !== "plain" && mode !== "synced") {
    throw new Error("Invalid lyrics editor mode.");
  }

  if (mode === "synced" && !hasLrcTimestamps(value)) {
    throw new Error("Synced lyrics need at least one LRC timestamp like [00:12.34].");
  }

  const { data: track, error: trackError } = await supabaseAdmin
    .from("songs")
    .select("id, album_id, lyrics_url")
    .eq("id", trackId)
    .eq("album_id", releaseId)
    .maybeSingle();

  if (trackError) throw trackError;

  if (!track) {
    throw new Error("Track was not found for this release.");
  }

  const { data: existingLyrics, error: lyricsError } = await supabaseAdmin
    .from("track_lyrics")
    .select("plain_lyrics, synced_lrc, word_sync_json, r2_lyrics_key, lyrics_url")
    .eq("song_id", trackId)
    .maybeSingle();

  if (lyricsError) throw lyricsError;

  const lyricsRow = (existingLyrics || null) as LyricsRow | null;
  const plainLyrics =
    mode === "plain" ? value : String(lyricsRow?.plain_lyrics || "");
  const syncedLrc =
    mode === "synced" ? value : String(lyricsRow?.synced_lrc || "");
  const hasLyrics = Boolean(plainLyrics.trim() || syncedLrc.trim());
  const lyricsType = syncedLrc.trim() ? "lrc" : plainLyrics.trim() ? "plain" : null;
  const lyricsPayload = {
    song_id: trackId,
    lyrics_type: lyricsType,
    plain_lyrics: plainLyrics || null,
    synced_lrc: syncedLrc || null,
    word_sync_json: lyricsRow?.word_sync_json || null,
    r2_lyrics_key: lyricsRow?.r2_lyrics_key || null,
    lyrics_url: lyricsRow?.lyrics_url || track.lyrics_url || null,
    source: input.source || "creator_lyrics_editor",
  };

  if (lyricsRow) {
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
    .eq("album_id", releaseId);

  if (updateSongError) throw updateSongError;

  return {
    plainLyrics,
    syncedLrc,
    lyricsType,
  };
}
