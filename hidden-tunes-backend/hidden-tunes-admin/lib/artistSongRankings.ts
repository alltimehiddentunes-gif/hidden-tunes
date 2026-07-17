/**
 * Honest artist song ranking helpers.
 * Uses only real signals: songs.play_count, favorites(song_id), recently_played(song_id).
 * Never fabricates popularity. Safe when ranking tables/columns are absent.
 */

import fs from "node:fs";
import path from "node:path";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ARTIST_RANKING_WEIGHTS = {
  playCount: 1,
  favorite: 5,
  recentUniqueListener: 2,
} as const;

function isMissingSchemaError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";
  const lower = message.toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "42P01" ||
    lower.includes("does not exist") ||
    lower.includes("could not find the table") ||
    lower.includes("schema cache")
  );
}

export const ARTIST_RANKING_RECENT_DAYS = 30;
export const ARTIST_RANKING_DEFAULT_BATCH_SIZE = 25;
export const ARTIST_RANKING_DEFAULT_ARTIST_LIMIT = 50;
export const ARTIST_RANKING_MAX_SONGS_PER_ARTIST = 40;

export type ArtistRankingMode = "ranked" | "play_count" | "latest";

export type ArtistRankingMeta = {
  mode: ArtistRankingMode;
  label: "Popular tracks" | "Essential tracks";
  has_positive_scores: boolean;
};

export type ArtistRankingCheckpoint = {
  version: 1;
  updated_at: string;
  cursor_artist_id: string | null;
  processed_artists: number;
  written_rankings: number;
  skipped_no_signal: number;
  schema_missing: boolean;
  last_error: string | null;
};

export type ArtistRankingRunOptions = {
  batchSize?: number;
  artistLimit?: number;
  checkpointPath?: string;
  dryRun?: boolean;
  resume?: boolean;
};

export type ArtistRankingRunResult = {
  ok: boolean;
  schemaMissing: boolean;
  dryRun: boolean;
  processedArtists: number;
  writtenRankings: number;
  skippedNoSignal: number;
  checkpoint: ArtistRankingCheckpoint;
  message: string;
};

function nowIso() {
  return new Date().toISOString();
}

function emptyCheckpoint(): ArtistRankingCheckpoint {
  return {
    version: 1,
    updated_at: nowIso(),
    cursor_artist_id: null,
    processed_artists: 0,
    written_rankings: 0,
    skipped_no_signal: 0,
    schema_missing: false,
    last_error: null,
  };
}

export function defaultArtistRankingCheckpointPath(adminRoot: string) {
  return path.join(adminRoot, "data", "artist-rankings", "checkpoint.json");
}

export function loadArtistRankingCheckpoint(filePath: string): ArtistRankingCheckpoint {
  try {
    if (!fs.existsSync(filePath)) return emptyCheckpoint();
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ArtistRankingCheckpoint;
    if (!parsed || parsed.version !== 1) return emptyCheckpoint();
    return {
      ...emptyCheckpoint(),
      ...parsed,
      version: 1,
    };
  } catch {
    return emptyCheckpoint();
  }
}

export function saveArtistRankingCheckpoint(
  filePath: string,
  checkpoint: ArtistRankingCheckpoint,
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = { ...checkpoint, updated_at: nowIso() };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function computeArtistSongPlayScore(input: {
  playCount?: number | null;
  favoriteCount?: number | null;
  recentUniqueListeners?: number | null;
}) {
  const playCount = Math.max(0, Number(input.playCount) || 0);
  const favoriteCount = Math.max(0, Number(input.favoriteCount) || 0);
  const recentUniqueListeners = Math.max(0, Number(input.recentUniqueListeners) || 0);
  return (
    playCount * ARTIST_RANKING_WEIGHTS.playCount +
    favoriteCount * ARTIST_RANKING_WEIGHTS.favorite +
    recentUniqueListeners * ARTIST_RANKING_WEIGHTS.recentUniqueListener
  );
}

export function rankingMetaForMode(mode: ArtistRankingMode): ArtistRankingMeta {
  if (mode === "ranked" || mode === "play_count") {
    return {
      mode,
      label: "Popular tracks",
      has_positive_scores: true,
    };
  }
  return {
    mode: "latest",
    label: "Essential tracks",
    has_positive_scores: false,
  };
}

export async function artistSongRankingsTableAvailable() {
  const { error } = await supabaseAdmin.from("artist_song_rankings").select("artist_id").limit(1);
  if (!error) return true;
  if (isMissingSchemaError(error)) return false;
  throw new Error(error.message);
}

async function listArtistBatch(options: {
  limit: number;
  afterArtistId: string | null;
}) {
  let query = supabaseAdmin
    .from("artists")
    .select("id,name")
    .order("id", { ascending: true })
    .limit(options.limit);

  if (options.afterArtistId) {
    query = query.gt("id", options.afterArtistId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name || "Unknown Artist"),
  }));
}

async function loadArtistPublicSongs(artistId: string) {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("id, play_count, is_public")
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    playCount: Number(row.play_count) || 0,
  }));
}

async function countFavoritesBySong(songIds: string[]) {
  const counts = new Map<string, number>();
  if (songIds.length === 0) return counts;

  const { data, error } = await supabaseAdmin
    .from("favorites")
    .select("song_id")
    .in("song_id", songIds)
    .limit(5000);

  if (error) {
    if (isMissingSchemaError(error)) return counts;
    // Favorites schema drift should not fail ranking.
    return counts;
  }

  for (const row of data || []) {
    const songId = String(row.song_id || "");
    if (!songId) continue;
    counts.set(songId, (counts.get(songId) || 0) + 1);
  }
  return counts;
}

async function countRecentUniqueListenersBySong(songIds: string[]) {
  const counts = new Map<string, number>();
  if (songIds.length === 0) return counts;

  const since = new Date(
    Date.now() - ARTIST_RANKING_RECENT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabaseAdmin
    .from("recently_played")
    .select("song_id, user_id, played_at")
    .in("song_id", songIds)
    .gte("played_at", since)
    .limit(8000);

  if (error) {
    if (isMissingSchemaError(error)) return counts;
    return counts;
  }

  const unique = new Map<string, Set<string>>();
  for (const row of data || []) {
    const songId = String(row.song_id || "");
    const userId = String(row.user_id || "");
    if (!songId || !userId) continue;
    const bucket = unique.get(songId) || new Set<string>();
    bucket.add(userId);
    unique.set(songId, bucket);
  }

  for (const [songId, users] of unique.entries()) {
    counts.set(songId, users.size);
  }
  return counts;
}

export async function buildArtistSongRankings(artistId: string) {
  const songs = await loadArtistPublicSongs(artistId);
  const songIds = songs.map((song) => song.id);
  const [favoriteCounts, recentCounts] = await Promise.all([
    countFavoritesBySong(songIds),
    countRecentUniqueListenersBySong(songIds),
  ]);

  const ranked = songs
    .map((song) => {
      const playScore = computeArtistSongPlayScore({
        playCount: song.playCount,
        favoriteCount: favoriteCounts.get(song.id) || 0,
        recentUniqueListeners: recentCounts.get(song.id) || 0,
      });
      return {
        artist_id: artistId,
        song_id: song.id,
        play_score: playScore,
      };
    })
    .filter((row) => row.play_score > 0)
    .sort((a, b) => b.play_score - a.play_score || a.song_id.localeCompare(b.song_id))
    .slice(0, ARTIST_RANKING_MAX_SONGS_PER_ARTIST)
    .map((row, index) => ({
      ...row,
      rank_position: index + 1,
      refreshed_at: nowIso(),
    }));

  return ranked;
}

async function replaceArtistRankings(
  artistId: string,
  rows: Array<{
    artist_id: string;
    song_id: string;
    rank_position: number;
    play_score: number;
    refreshed_at: string;
  }>,
  dryRun: boolean,
) {
  if (dryRun) return rows.length;

  const { error: deleteError } = await supabaseAdmin
    .from("artist_song_rankings")
    .delete()
    .eq("artist_id", artistId);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length === 0) return 0;

  const { error: insertError } = await supabaseAdmin.from("artist_song_rankings").insert(rows);
  if (insertError) throw new Error(insertError.message);
  return rows.length;
}

export async function runArtistSongRankingsJob(
  options: ArtistRankingRunOptions = {},
): Promise<ArtistRankingRunResult> {
  const batchSize = Math.max(
    1,
    Math.min(100, Number(options.batchSize) || ARTIST_RANKING_DEFAULT_BATCH_SIZE),
  );
  const artistLimit = Math.max(
    1,
    Math.min(500, Number(options.artistLimit) || ARTIST_RANKING_DEFAULT_ARTIST_LIMIT),
  );
  const dryRun = options.dryRun === true;
  const checkpointPath =
    options.checkpointPath ||
    defaultArtistRankingCheckpointPath(path.resolve(process.cwd()));

  let checkpoint = options.resume
    ? loadArtistRankingCheckpoint(checkpointPath)
    : emptyCheckpoint();

  const available = await artistSongRankingsTableAvailable();
  if (!available) {
    checkpoint = saveArtistRankingCheckpoint(checkpointPath, {
      ...checkpoint,
      schema_missing: true,
      last_error: "artist_song_rankings table is not available",
    });
    return {
      ok: true,
      schemaMissing: true,
      dryRun,
      processedArtists: 0,
      writtenRankings: 0,
      skippedNoSignal: 0,
      checkpoint,
      message:
        "Skipped ranking write: artist_song_rankings schema is not applied yet. Artist Profile continues with Essential/Latest fallback.",
    };
  }

  const baseProcessed = options.resume ? checkpoint.processed_artists : 0;
  const baseWritten = options.resume ? checkpoint.written_rankings : 0;
  const baseSkipped = options.resume ? checkpoint.skipped_no_signal : 0;

  let processedArtists = 0;
  let writtenRankings = 0;
  let skippedNoSignal = 0;
  let cursor = options.resume ? checkpoint.cursor_artist_id : null;

  while (processedArtists < artistLimit) {
    const remaining = artistLimit - processedArtists;
    const batch = await listArtistBatch({
      limit: Math.min(batchSize, remaining),
      afterArtistId: cursor,
    });
    if (batch.length === 0) break;

    for (const artist of batch) {
      const rows = await buildArtistSongRankings(artist.id);
      if (rows.length === 0) {
        skippedNoSignal += 1;
        if (!dryRun) {
          await replaceArtistRankings(artist.id, [], false);
        }
      } else {
        writtenRankings += await replaceArtistRankings(artist.id, rows, dryRun);
      }

      processedArtists += 1;
      cursor = artist.id;
      checkpoint = saveArtistRankingCheckpoint(checkpointPath, {
        ...checkpoint,
        cursor_artist_id: cursor,
        processed_artists: baseProcessed + processedArtists,
        written_rankings: baseWritten + writtenRankings,
        skipped_no_signal: baseSkipped + skippedNoSignal,
        schema_missing: false,
        last_error: null,
      });
    }
  }

  return {
    ok: true,
    schemaMissing: false,
    dryRun,
    processedArtists,
    writtenRankings,
    skippedNoSignal,
    checkpoint,
    message: dryRun
      ? `Dry run complete for ${processedArtists} artists (${writtenRankings} ranking rows would be written).`
      : `Wrote rankings for ${processedArtists} artists (${writtenRankings} rows, ${skippedNoSignal} artists with no positive signals).`,
  };
}
