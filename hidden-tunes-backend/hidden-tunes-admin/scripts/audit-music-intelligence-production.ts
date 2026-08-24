import { classifySong, isBackendPlayableSong } from "../lib/emotionalWorldIntelligence";
import { normalizeLyrics } from "../lib/musicIntelligence/lyricsNormalization";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
const PAGE = 1_000;
async function all(table: string, fields: string): Promise<Row[]> {
  const db = getSupabaseAdmin(); const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(fields).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} audit failed: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}
async function optionalAll(table: string, fields: string): Promise<{ rows: Row[]; exists: boolean }> {
  try { return { rows: await all(table, fields), exists: true }; }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/schema cache|does not exist|not find the table/i.test(message)) return { rows: [], exists: false };
    throw error;
  }
}
const text = (value: unknown) => String(value ?? "").trim();
const hasAny = (row: Row, keys: string[]) => keys.some((key) => text(row[key]));
const words = (value: unknown) => normalizeLyrics(value).split(" ").filter(Boolean).length;

async function main() {
  const songs = await all("songs", "id,is_public,audio_url,url,genre,mood,has_lyrics,lyrics_type,review_status,rejection_reason,energy,tempo_bpm,atmosphere,emotion,texture,time_of_day,vocal_feel,instrumentation,analysis_status,analysis_source,created_at,artist_id,album_id,title,cover_url,artwork_url,duration,duration_seconds");
  const trackLyrics = await all("track_lyrics", "song_id,plain_lyrics,synced_lrc,lyrics_type,source");
  const syncedResult = await optionalAll("synced_lyrics", "song_id,plain_lyrics,lyrics_lrc,lyrics_json");
  const syncedLyrics = syncedResult.rows;
  const published = songs.filter((song) => song.is_public !== false);
  const playable = published.filter((song) => isBackendPlayableSong(song as { id: string; title: string }));
  const unavailable = published.length - playable.length;
  const unpublished = songs.length - published.length;
  const quarantined = songs.filter((song) => ["rejected", "quarantined", "blocked"].includes(text(song.review_status).toLowerCase()) || Boolean(text(song.rejection_reason))).length;

  const plainIds = new Set(trackLyrics.filter((row) => text(row.plain_lyrics)).map((row) => text(row.song_id)));
  const lrcIds = new Set([
    ...trackLyrics.filter((row) => text(row.synced_lrc)).map((row) => text(row.song_id)),
    ...syncedLyrics.filter((row) => text(row.lyrics_lrc) || (Array.isArray(row.lyrics_json) && row.lyrics_json.length)).map((row) => text(row.song_id)),
  ]);
  const transcriptionIds = new Set(trackLyrics.filter((row) => /transcription/i.test(text(row.source))).map((row) => text(row.song_id)));
  const trustedIds = new Set(trackLyrics.filter((row) => /admin_upload_plain|admin_upload_supplied_lrc|creator_lyrics_editor|supplied/i.test(text(row.source)) && !/unverified/i.test(text(row.source))).map((row) => text(row.song_id)));
  const anyLyrics = new Set([...plainIds, ...lrcIds]);
  const lyricWordCounts = trackLyrics.map((row) => Math.max(words(row.plain_lyrics), words(row.synced_lrc))).filter((n) => n > 0);
  const worldAssigned = published.filter((song) => classifySong(song as { id: string; title: string }).length > 0).length;
  const emotionalFields = ["energy", "tempo_bpm", "atmosphere", "emotion", "texture", "time_of_day", "vocal_feel", "instrumentation"];
  const sourceCounts = Object.fromEntries([...new Set(trackLyrics.map((row) => text(row.source) || "unspecified"))].sort().map((source) => [source, trackLyrics.filter((row) => (text(row.source) || "unspecified") === source).length]));
  const anonUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const anon = createClient(anonUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonSongs = await anon.from("songs").select("id", { count: "exact", head: true });
  const anonLyrics = await anon.from("track_lyrics").select("song_id", { count: "exact", head: true });

  console.log(JSON.stringify({
    auditedAt: new Date().toISOString(),
    counts: {
      totalSongs: songs.length, publishedSongs: published.length, playablePublishedSongs: playable.length,
      plainLyrics: plainIds.size, syncedLrc: lrcIds.size, audioTranscription: transcriptionIds.size,
      trustedSuppliedLyrics: trustedIds.size, anyUsableLyrics: anyLyrics.size,
      noLyrics: Math.max(0, published.length - [...anyLyrics].filter((id) => published.some((song) => text(song.id) === id)).length),
      withMood: published.filter((song) => text(song.mood)).length,
      withGenre: published.filter((song) => text(song.genre)).length,
      withEmotionalMetadata: published.filter((song) => hasAny(song, emotionalFields)).length,
      persistedVectorColumn: 0, persistedSongTagsColumn: 0,
      emotionalWorldAssigned: worldAssigned, unavailablePublished: unavailable, unpublished, quarantined,
    },
    lyricsScale: {
      measuredRows: lyricWordCounts.length,
      averageWords: lyricWordCounts.length ? Math.round(lyricWordCounts.reduce((a, b) => a + b, 0) / lyricWordCounts.length) : 0,
      minimumWords: lyricWordCounts.length ? Math.min(...lyricWordCounts) : 0,
      maximumWords: lyricWordCounts.length ? Math.max(...lyricWordCounts) : 0,
      sourceCounts,
    },
    directAccessProbe: {
      anonymousSongsReadAllowed: !anonSongs.error,
      anonymousTrackLyricsReadAllowed: !anonLyrics.error,
    },
    schemaColumnsObserved: {
      songs: Object.keys(songs[0] ?? {}).sort(),
      trackLyrics: Object.keys(trackLyrics[0] ?? {}).filter((key) => !["plain_lyrics", "synced_lrc"].includes(key)).sort(),
      syncedLyrics: Object.keys(syncedLyrics[0] ?? {}).filter((key) => !["plain_lyrics", "lyrics_lrc", "lyrics_json"].includes(key)).sort(),
      syncedLyricsTableExists: syncedResult.exists,
    },
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "production audit failed"); process.exitCode = 1; });
