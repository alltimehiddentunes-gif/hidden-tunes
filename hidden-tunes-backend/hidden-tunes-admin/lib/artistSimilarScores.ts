/**
 * Honest artist similarity helpers.
 *
 * Available signals (when present):
 * - shared song genres (songs.genre) — available now
 * - shared song moods (songs.mood) — available now
 * - artist_genres rows — soft, when infrastructure schema applied
 * - artist_collaborations — soft
 * - artist_credits.related_artist_id — soft
 * - artist_relationships (editorial) — soft
 * - co-listening via recently_played — soft (table exists, currently empty)
 * - shared country_code — weak only; never enough alone
 *
 * Never uses artist-name similarity or random recommendations.
 * Safe when artist_similar_scores schema is absent.
 */

import fs from "node:fs";
import path from "node:path";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const ARTIST_SIMILARITY_WEIGHTS = {
  genreOverlap: 6,
  moodOverlap: 4,
  collaboration: 5,
  credit: 4,
  editorial: 6,
  coListen: 3,
  country: 0.4,
} as const;

/** Minimum score to write/show a similar artist. Country alone cannot pass. */
export const ARTIST_SIMILARITY_MIN_SCORE = 2.5;

export const ARTIST_SIMILARITY_DEFAULT_BATCH_SIZE = 20;
export const ARTIST_SIMILARITY_DEFAULT_ARTIST_LIMIT = 40;
export const ARTIST_SIMILARITY_MAX_RESULTS_PER_ARTIST = 24;
export const ARTIST_SIMILARITY_CANDIDATE_SCAN_LIMIT = 120;
export const ARTIST_SIMILARITY_SONGS_PER_ARTIST = 80;

export type ArtistSimilaritySignals = {
  sharedGenres: number;
  sharedMoods: number;
  collaboration: boolean;
  sharedCredits: number;
  editorial: boolean;
  coListenUsers: number;
  sharedCountry: boolean;
};

export type ArtistSimilarityScoreResult = {
  score: number;
  hasStrongSignal: boolean;
  signals: ArtistSimilaritySignals;
  reason: string | null;
};

export type ArtistSimilarityCheckpoint = {
  version: 1;
  updated_at: string;
  cursor_artist_id: string | null;
  processed_artists: number;
  written_pairs: number;
  skipped_no_signal: number;
  schema_missing: boolean;
  last_error: string | null;
};

export type ArtistSimilarityRunOptions = {
  batchSize?: number;
  artistLimit?: number;
  checkpointPath?: string;
  dryRun?: boolean;
  resume?: boolean;
};

export type ArtistSimilarityRunResult = {
  ok: boolean;
  schemaMissing: boolean;
  dryRun: boolean;
  processedArtists: number;
  writtenPairs: number;
  skippedNoSignal: number;
  checkpoint: ArtistSimilarityCheckpoint;
  message: string;
};

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

function nowIso() {
  return new Date().toISOString();
}

function emptyCheckpoint(): ArtistSimilarityCheckpoint {
  return {
    version: 1,
    updated_at: nowIso(),
    cursor_artist_id: null,
    processed_artists: 0,
    written_pairs: 0,
    skipped_no_signal: 0,
    schema_missing: false,
    last_error: null,
  };
}

export function defaultArtistSimilarityCheckpointPath(adminRoot: string) {
  return path.join(adminRoot, "data", "artist-similarity", "checkpoint.json");
}

export function loadArtistSimilarityCheckpoint(
  filePath: string,
): ArtistSimilarityCheckpoint {
  try {
    if (!fs.existsSync(filePath)) return emptyCheckpoint();
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ArtistSimilarityCheckpoint;
    if (!parsed || parsed.version !== 1) return emptyCheckpoint();
    return { ...emptyCheckpoint(), ...parsed, version: 1 };
  } catch {
    return emptyCheckpoint();
  }
}

export function saveArtistSimilarityCheckpoint(
  filePath: string,
  checkpoint: ArtistSimilarityCheckpoint,
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const next = { ...checkpoint, updated_at: nowIso() };
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function normalizeSimilarityToken(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 64);
}

export function tokenizeGenreField(value: unknown) {
  const tokens = new Set<string>();
  for (const part of String(value || "").split(/[,/|]/)) {
    const token = normalizeSimilarityToken(part);
    if (token && token !== "unknown" && token !== "n/a") tokens.add(token);
  }
  return tokens;
}

export function tokenizeMoodField(value: unknown) {
  const tokens = new Set<string>();
  const raw = String(value || "").trim();
  if (!raw) return tokens;
  // Prefer short primary mood tokens; long free-text moods become one head token.
  const head = normalizeSimilarityToken(raw.split(/[,;/|]/)[0] || "").slice(0, 48);
  if (head) tokens.add(head);
  return tokens;
}

function setOverlapRatio(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return { shared: 0, ratio: 0, sharedValues: [] as string[] };
  const sharedValues: string[] = [];
  for (const value of a) {
    if (b.has(value)) sharedValues.push(value);
  }
  const union = new Set([...a, ...b]).size;
  return {
    shared: sharedValues.length,
    ratio: union > 0 ? sharedValues.length / union : 0,
    sharedValues,
  };
}

export function computeArtistSimilarityScore(input: {
  genresA: Iterable<string>;
  genresB: Iterable<string>;
  moodsA: Iterable<string>;
  moodsB: Iterable<string>;
  collaboration?: boolean;
  sharedCredits?: number;
  editorial?: boolean;
  coListenUsers?: number;
  sharedCountry?: boolean;
}): ArtistSimilarityScoreResult {
  const genresA = new Set(
    [...input.genresA].map(normalizeSimilarityToken).filter(Boolean),
  );
  const genresB = new Set(
    [...input.genresB].map(normalizeSimilarityToken).filter(Boolean),
  );
  const moodsA = new Set(
    [...input.moodsA].map(normalizeSimilarityToken).filter(Boolean),
  );
  const moodsB = new Set(
    [...input.moodsB].map(normalizeSimilarityToken).filter(Boolean),
  );

  const genreOverlap = setOverlapRatio(genresA, genresB);
  const moodOverlap = setOverlapRatio(moodsA, moodsB);
  const collaboration = input.collaboration === true;
  const sharedCredits = Math.max(0, Number(input.sharedCredits) || 0);
  const editorial = input.editorial === true;
  const coListenUsers = Math.max(0, Number(input.coListenUsers) || 0);
  const sharedCountry = input.sharedCountry === true;

  const score =
    genreOverlap.ratio * ARTIST_SIMILARITY_WEIGHTS.genreOverlap +
    moodOverlap.ratio * ARTIST_SIMILARITY_WEIGHTS.moodOverlap +
    (collaboration ? ARTIST_SIMILARITY_WEIGHTS.collaboration : 0) +
    Math.min(3, sharedCredits) * (ARTIST_SIMILARITY_WEIGHTS.credit / 2) +
    (editorial ? ARTIST_SIMILARITY_WEIGHTS.editorial : 0) +
    Math.min(5, coListenUsers) * (ARTIST_SIMILARITY_WEIGHTS.coListen / 3) +
    (sharedCountry ? ARTIST_SIMILARITY_WEIGHTS.country : 0);

  const hasStrongSignal =
    genreOverlap.shared > 0 ||
    moodOverlap.shared > 0 ||
    collaboration ||
    sharedCredits > 0 ||
    editorial ||
    coListenUsers > 0;

  let reason: string | null = null;
  if (editorial) reason = "Related artists";
  else if (collaboration) reason = "Collaborated together";
  else if (sharedCredits > 0) reason = "Shared credits";
  else if (coListenUsers > 0) reason = "Listeners also play";
  else if (genreOverlap.sharedValues[0]) {
    reason = `Shared genre: ${genreOverlap.sharedValues[0].replace(/\b\w/g, (c) => c.toUpperCase())}`;
  } else if (moodOverlap.sharedValues[0]) {
    reason = `Shared mood: ${moodOverlap.sharedValues[0].replace(/\b\w/g, (c) => c.toUpperCase())}`;
  }

  return {
    score: Number(score.toFixed(4)),
    hasStrongSignal,
    signals: {
      sharedGenres: genreOverlap.shared,
      sharedMoods: moodOverlap.shared,
      collaboration,
      sharedCredits,
      editorial,
      coListenUsers,
      sharedCountry,
    },
    reason,
  };
}

export function passesArtistSimilarityThreshold(result: ArtistSimilarityScoreResult) {
  return result.hasStrongSignal && result.score >= ARTIST_SIMILARITY_MIN_SCORE;
}

export async function artistSimilarScoresTableAvailable() {
  const { error } = await supabaseAdmin.from("artist_similar_scores").select("artist_id").limit(1);
  if (!error) return true;
  if (isMissingSchemaError(error)) return false;
  throw new Error(error.message);
}

type ArtistSignalProfile = {
  id: string;
  genres: Set<string>;
  moods: Set<string>;
  countryCode: string | null;
  mergedInto: string | null;
  isPublic: boolean;
};

async function listArtistBatch(options: { limit: number; afterArtistId: string | null }) {
  let query = supabaseAdmin
    .from("artists")
    .select("id,name,merged_into_artist_id,status,is_suspended,country_code")
    .order("id", { ascending: true })
    .limit(options.limit);

  if (options.afterArtistId) query = query.gt("id", options.afterArtistId);

  const { data, error } = await query;
  if (error && isMissingSchemaError(error)) {
    // Baseline artists table without extended columns.
    let baseline = supabaseAdmin
      .from("artists")
      .select("id,name")
      .order("id", { ascending: true })
      .limit(options.limit);
    if (options.afterArtistId) baseline = baseline.gt("id", options.afterArtistId);
    const fallback = await baseline;
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || "Unknown Artist"),
      mergedInto: null as string | null,
      status: "published",
      isSuspended: false,
      countryCode: null as string | null,
    }));
  }
  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name || "Unknown Artist"),
    mergedInto: row.merged_into_artist_id ? String(row.merged_into_artist_id) : null,
    status: String(row.status || "published"),
    isSuspended: row.is_suspended === true,
    countryCode: row.country_code ? String(row.country_code).trim().toUpperCase() : null,
  }));
}

async function loadSongSignalsForArtist(artistId: string) {
  const genres = new Set<string>();
  const moods = new Set<string>();
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select("genre, mood")
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .limit(ARTIST_SIMILARITY_SONGS_PER_ARTIST);

  if (error) throw new Error(error.message);
  for (const row of data || []) {
    for (const token of tokenizeGenreField(row.genre)) genres.add(token);
    for (const token of tokenizeMoodField(row.mood)) moods.add(token);
  }
  return { genres, moods };
}

async function loadArtistGenreTableSignals(artistId: string) {
  const genres = new Set<string>();
  const { data, error } = await supabaseAdmin
    .from("artist_genres")
    .select("genre")
    .eq("artist_id", artistId)
    .limit(40);
  if (error) {
    if (isMissingSchemaError(error)) return genres;
    return genres;
  }
  for (const row of data || []) {
    const token = normalizeSimilarityToken(row.genre);
    if (token) genres.add(token);
  }
  return genres;
}

async function loadCollaborationIds(artistId: string) {
  const ids = new Set<string>();
  const { data, error } = await supabaseAdmin
    .from("artist_collaborations")
    .select("collaborator_artist_id, is_published")
    .eq("artist_id", artistId)
    .limit(100);
  if (error) {
    if (isMissingSchemaError(error)) return ids;
    return ids;
  }
  for (const row of data || []) {
    if (row.is_published === false) continue;
    const id = String(row.collaborator_artist_id || "");
    if (id) ids.add(id);
  }
  return ids;
}

async function loadCreditRelatedArtistIds(artistId: string) {
  const ids = new Map<string, number>();
  const { data, error } = await supabaseAdmin
    .from("artist_credits")
    .select("related_artist_id, is_published")
    .eq("artist_id", artistId)
    .not("related_artist_id", "is", null)
    .limit(100);
  if (error) {
    if (isMissingSchemaError(error)) return ids;
    return ids;
  }
  for (const row of data || []) {
    if (row.is_published === false) continue;
    const id = String(row.related_artist_id || "");
    if (!id || id === artistId) continue;
    ids.set(id, (ids.get(id) || 0) + 1);
  }
  return ids;
}

async function loadEditorialRelatedIds(artistId: string) {
  const ids = new Set<string>();
  const { data, error } = await supabaseAdmin
    .from("artist_relationships")
    .select("related_artist_id, is_published")
    .eq("artist_id", artistId)
    .limit(100);
  if (error) {
    if (isMissingSchemaError(error)) return ids;
    return ids;
  }
  for (const row of data || []) {
    if (row.is_published === false) continue;
    const id = String(row.related_artist_id || "");
    if (id && id !== artistId) ids.add(id);
  }
  return ids;
}

async function loadCoListenArtistCounts(artistId: string) {
  const counts = new Map<string, number>();
  const songs = await supabaseAdmin
    .from("songs")
    .select("id")
    .eq("artist_id", artistId)
    .eq("is_public", true)
    .limit(60);
  if (songs.error) return counts;
  const songIds = (songs.data || []).map((row) => String(row.id)).filter(Boolean);
  if (songIds.length === 0) return counts;

  const played = await supabaseAdmin
    .from("recently_played")
    .select("user_id, song_id")
    .in("song_id", songIds)
    .limit(2000);
  if (played.error) {
    if (isMissingSchemaError(played.error)) return counts;
    return counts;
  }

  const userIds = [
    ...new Set((played.data || []).map((row) => String(row.user_id || "")).filter(Boolean)),
  ].slice(0, 80);
  if (userIds.length === 0) return counts;

  const otherPlays = await supabaseAdmin
    .from("recently_played")
    .select("user_id, song_id")
    .in("user_id", userIds)
    .limit(4000);
  if (otherPlays.error) return counts;

  const otherSongIds = [
    ...new Set((otherPlays.data || []).map((row) => String(row.song_id || "")).filter(Boolean)),
  ].slice(0, 400);
  if (otherSongIds.length === 0) return counts;

  const otherSongs = await supabaseAdmin
    .from("songs")
    .select("id, artist_id")
    .in("id", otherSongIds)
    .eq("is_public", true)
    .limit(400);
  if (otherSongs.error) return counts;

  const songArtist = new Map(
    (otherSongs.data || []).map((row) => [String(row.id), String(row.artist_id || "")] as const),
  );
  const usersByArtist = new Map<string, Set<string>>();
  for (const row of otherPlays.data || []) {
    const userId = String(row.user_id || "");
    const otherArtistId = songArtist.get(String(row.song_id || "")) || "";
    if (!userId || !otherArtistId || otherArtistId === artistId) continue;
    const bucket = usersByArtist.get(otherArtistId) || new Set<string>();
    bucket.add(userId);
    usersByArtist.set(otherArtistId, bucket);
  }
  for (const [otherArtistId, users] of usersByArtist.entries()) {
    counts.set(otherArtistId, users.size);
  }
  return counts;
}

async function buildArtistSignalProfile(artist: {
  id: string;
  mergedInto: string | null;
  status: string;
  isSuspended: boolean;
  countryCode: string | null;
}): Promise<ArtistSignalProfile> {
  const songSignals = await loadSongSignalsForArtist(artist.id);
  const tableGenres = await loadArtistGenreTableSignals(artist.id);
  const genres = new Set([...songSignals.genres, ...tableGenres]);
  return {
    id: artist.id,
    genres,
    moods: songSignals.moods,
    countryCode: artist.countryCode,
    mergedInto: artist.mergedInto,
    isPublic: !artist.mergedInto && !artist.isSuspended && artist.status === "published",
  };
}

function canonicalArtistId(profile: ArtistSignalProfile) {
  return profile.mergedInto || profile.id;
}

export async function buildArtistSimilarPairs(artistId: string) {
  const sourceMetaRows = await supabaseAdmin
    .from("artists")
    .select("id,name,merged_into_artist_id,status,is_suspended,country_code")
    .eq("id", artistId)
    .limit(1);
  let sourceMeta = sourceMetaRows.data?.[0];
  if (sourceMetaRows.error && isMissingSchemaError(sourceMetaRows.error)) {
    const baseline = await supabaseAdmin.from("artists").select("id,name").eq("id", artistId).limit(1);
    sourceMeta = baseline.data?.[0]
      ? {
          id: baseline.data[0].id,
          name: baseline.data[0].name,
          merged_into_artist_id: null,
          status: "published",
          is_suspended: false,
          country_code: null,
        }
      : undefined;
  } else if (sourceMetaRows.error) {
    throw new Error(sourceMetaRows.error.message);
  }
  if (!sourceMeta) return [];

  const source = await buildArtistSignalProfile({
    id: String(sourceMeta.id),
    mergedInto: sourceMeta.merged_into_artist_id
      ? String(sourceMeta.merged_into_artist_id)
      : null,
    status: String(sourceMeta.status || "published"),
    isSuspended: sourceMeta.is_suspended === true,
    countryCode: sourceMeta.country_code
      ? String(sourceMeta.country_code).trim().toUpperCase()
      : null,
  });

  const sourceCanonical = canonicalArtistId(source);
  if (sourceCanonical !== source.id) {
    // Merged source artists are not written; profiles resolve to canonical.
    return [];
  }

  const [collaborators, credits, editorial, coListen] = await Promise.all([
    loadCollaborationIds(artistId),
    loadCreditRelatedArtistIds(artistId),
    loadEditorialRelatedIds(artistId),
    loadCoListenArtistCounts(artistId),
  ]);

  const candidateIds = new Set<string>();
  for (const id of collaborators) candidateIds.add(id);
  for (const id of credits.keys()) candidateIds.add(id);
  for (const id of editorial) candidateIds.add(id);
  for (const id of coListen.keys()) candidateIds.add(id);

  // Bounded song scan: only artists sharing a genre/mood token become candidates.
  if (source.genres.size > 0 || source.moods.size > 0) {
    const songs = await supabaseAdmin
      .from("songs")
      .select("artist_id, genre, mood")
      .eq("is_public", true)
      .neq("artist_id", artistId)
      .limit(1200);
    if (!songs.error) {
      for (const row of songs.data || []) {
        const otherId = String(row.artist_id || "");
        if (!otherId) continue;
        const genres = tokenizeGenreField(row.genre);
        const moods = tokenizeMoodField(row.mood);
        let shared = false;
        for (const token of genres) {
          if (source.genres.has(token)) {
            shared = true;
            break;
          }
        }
        if (!shared) {
          for (const token of moods) {
            if (source.moods.has(token)) {
              shared = true;
              break;
            }
          }
        }
        if (shared) candidateIds.add(otherId);
        if (candidateIds.size >= ARTIST_SIMILARITY_CANDIDATE_SCAN_LIMIT) break;
      }
    }
  }

  const pairs: Array<{
    artist_id: string;
    similar_artist_id: string;
    similarity_score: number;
    refreshed_at: string;
  }> = [];

  for (const candidateId of candidateIds) {
    if (candidateId === artistId) continue;
    const candidateMetaRows = await supabaseAdmin
      .from("artists")
      .select("id,merged_into_artist_id,status,is_suspended,country_code")
      .eq("id", candidateId)
      .limit(1);
    let candidateMeta = candidateMetaRows.data?.[0];
    if (candidateMetaRows.error && isMissingSchemaError(candidateMetaRows.error)) {
      const baseline = await supabaseAdmin
        .from("artists")
        .select("id")
        .eq("id", candidateId)
        .limit(1);
      candidateMeta = baseline.data?.[0]
        ? {
            id: baseline.data[0].id,
            merged_into_artist_id: null,
            status: "published",
            is_suspended: false,
            country_code: null,
          }
        : undefined;
    }
    if (!candidateMeta) continue;

    const candidate = await buildArtistSignalProfile({
      id: String(candidateMeta.id),
      mergedInto: candidateMeta.merged_into_artist_id
        ? String(candidateMeta.merged_into_artist_id)
        : null,
      status: String(candidateMeta.status || "published"),
      isSuspended: candidateMeta.is_suspended === true,
      countryCode: candidateMeta.country_code
        ? String(candidateMeta.country_code).trim().toUpperCase()
        : null,
    });

    const candidateCanonical = canonicalArtistId(candidate);
    if (candidateCanonical === sourceCanonical) continue;
    if (candidate.mergedInto) {
      // Target the canonical artist instead of the merged shell.
    } else if (!candidate.isPublic) {
      continue;
    }
    const targetId = candidateCanonical;
    if (targetId === sourceCanonical) continue;

    const scored = computeArtistSimilarityScore({
      genresA: source.genres,
      genresB: candidate.genres,
      moodsA: source.moods,
      moodsB: candidate.moods,
      collaboration: collaborators.has(candidateId) || collaborators.has(targetId),
      sharedCredits: credits.get(candidateId) || credits.get(targetId) || 0,
      editorial: editorial.has(candidateId) || editorial.has(targetId),
      coListenUsers: coListen.get(candidateId) || coListen.get(targetId) || 0,
      sharedCountry: Boolean(
        source.countryCode &&
          candidate.countryCode &&
          source.countryCode === candidate.countryCode,
      ),
    });

    if (!passesArtistSimilarityThreshold(scored)) continue;

    pairs.push({
      artist_id: sourceCanonical,
      similar_artist_id: targetId,
      similarity_score: scored.score,
      refreshed_at: nowIso(),
    });
  }

  // Dedupe by similar_artist_id keeping highest score.
  const best = new Map<string, (typeof pairs)[number]>();
  for (const pair of pairs) {
    const existing = best.get(pair.similar_artist_id);
    if (!existing || pair.similarity_score > existing.similarity_score) {
      best.set(pair.similar_artist_id, pair);
    }
  }

  return [...best.values()]
    .sort(
      (a, b) =>
        b.similarity_score - a.similarity_score ||
        a.similar_artist_id.localeCompare(b.similar_artist_id),
    )
    .slice(0, ARTIST_SIMILARITY_MAX_RESULTS_PER_ARTIST);
}

async function replaceArtistSimilarScores(
  artistId: string,
  rows: Array<{
    artist_id: string;
    similar_artist_id: string;
    similarity_score: number;
    refreshed_at: string;
  }>,
  dryRun: boolean,
) {
  if (dryRun) return rows.length;

  const { error: deleteError } = await supabaseAdmin
    .from("artist_similar_scores")
    .delete()
    .eq("artist_id", artistId);
  if (deleteError) throw new Error(deleteError.message);

  if (rows.length === 0) return 0;

  const { error: insertError } = await supabaseAdmin.from("artist_similar_scores").insert(rows);
  if (insertError) throw new Error(insertError.message);
  return rows.length;
}

export async function runArtistSimilarScoresJob(
  options: ArtistSimilarityRunOptions = {},
): Promise<ArtistSimilarityRunResult> {
  const batchSize = Math.max(
    1,
    Math.min(80, Number(options.batchSize) || ARTIST_SIMILARITY_DEFAULT_BATCH_SIZE),
  );
  const artistLimit = Math.max(
    1,
    Math.min(400, Number(options.artistLimit) || ARTIST_SIMILARITY_DEFAULT_ARTIST_LIMIT),
  );
  const dryRun = options.dryRun === true;
  const checkpointPath =
    options.checkpointPath ||
    defaultArtistSimilarityCheckpointPath(path.resolve(process.cwd()));

  let checkpoint = options.resume
    ? loadArtistSimilarityCheckpoint(checkpointPath)
    : emptyCheckpoint();

  const available = await artistSimilarScoresTableAvailable();
  if (!available) {
    checkpoint = saveArtistSimilarityCheckpoint(checkpointPath, {
      ...checkpoint,
      schema_missing: true,
      last_error: "artist_similar_scores table is not available",
    });
    return {
      ok: true,
      schemaMissing: true,
      dryRun,
      processedArtists: 0,
      writtenPairs: 0,
      skippedNoSignal: 0,
      checkpoint,
      message:
        "Skipped similarity write: artist_similar_scores schema is not applied yet. Artist Profile continues without Similar Artists.",
    };
  }

  const baseProcessed = options.resume ? checkpoint.processed_artists : 0;
  const baseWritten = options.resume ? checkpoint.written_pairs : 0;
  const baseSkipped = options.resume ? checkpoint.skipped_no_signal : 0;

  let processedArtists = 0;
  let writtenPairs = 0;
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
      if (artist.mergedInto) {
        skippedNoSignal += 1;
        if (!dryRun) await replaceArtistSimilarScores(artist.id, [], false);
      } else {
        const rows = await buildArtistSimilarPairs(artist.id);
        if (rows.length === 0) {
          skippedNoSignal += 1;
          if (!dryRun) await replaceArtistSimilarScores(artist.id, [], false);
        } else {
          writtenPairs += await replaceArtistSimilarScores(artist.id, rows, dryRun);
        }
      }

      processedArtists += 1;
      cursor = artist.id;
      checkpoint = saveArtistSimilarityCheckpoint(checkpointPath, {
        ...checkpoint,
        cursor_artist_id: cursor,
        processed_artists: baseProcessed + processedArtists,
        written_pairs: baseWritten + writtenPairs,
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
    writtenPairs,
    skippedNoSignal,
    checkpoint,
    message: dryRun
      ? `Dry run complete for ${processedArtists} artists (${writtenPairs} similar pairs would be written).`
      : `Wrote similar artists for ${processedArtists} artists (${writtenPairs} pairs, ${skippedNoSignal} artists with no valid similarities).`,
  };
}
