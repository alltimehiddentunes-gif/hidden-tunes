import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import {
  RadioStreamProbeResult,
  applyRadioVerificationProbe,
  probeRadioStream,
} from "@/lib/radioStreamVerification";

const adminRoot = path.resolve(__dirname, "..");
const candidatePath = path.join(adminRoot, "data", "radio-general-batch2-candidates.json");
const checkpointPath = path.join(adminRoot, "data", "radio-general-batch2-verification-checkpoint.json");
const resultPath = path.join(adminRoot, "data", "radio-general-batch2-verification-result.json");

type Mode = "dry-run" | "execute";
type CandidateRecord = {
  source_name: string;
  source_station_id: string;
};
type RadioVerifyRow = {
  id: string;
  name: string | null;
  stream_url: string | null;
  source_stream_url: string | null;
  playback_status: string | null;
  reliability_score: number | null;
  consecutive_failures: number | null;
  status: string | null;
  is_active: boolean | null;
  is_verified: boolean | null;
  is_mature: boolean | null;
  quarantined_at: string | null;
  disabled_at: string | null;
  metadata_locked: boolean | null;
  manual_override: boolean | null;
  is_curated: boolean | null;
  is_featured: boolean | null;
  source_name: string | null;
  source_station_id: string | null;
  normalized_name: string | null;
  normalized_stream_url: string | null;
  station_fingerprint: string | null;
};
type Checkpoint = {
  version: 1;
  updated_at: string;
  verified_station_ids: string[];
  results: Record<string, string>;
};
type VerificationStats = {
  mode: Mode;
  eligible: number;
  attempted: number;
  skipped_already_complete: number;
  playable: number;
  failed: number;
  timed_out: number;
  retryable: number;
  quarantined: number;
  redirects_resolved: number;
  playlists_resolved: number;
  unsupported_streams: number;
  html_responses: number;
  retries: number;
  updated: number;
  update_errors: number;
  dry_run_no_rows_changed: boolean;
  total_duration_ms: number;
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const sampleIndex = process.argv.indexOf("--sample");
  return {
    mode: args.has("--execute") ? ("execute" as const) : ("dry-run" as const),
    sample: sampleIndex >= 0 ? Number(process.argv[sampleIndex + 1]) : null,
    force: args.has("--force"),
    concurrency: Number(process.env.RADIO_VERIFY_CONCURRENCY || 4),
    timeoutMs: Number(process.env.RADIO_VERIFY_TIMEOUT_MS || 12_000),
    maxRedirects: Number(process.env.RADIO_VERIFY_MAX_REDIRECTS || 5),
    maxPlaylistBytes: Number(process.env.RADIO_VERIFY_MAX_PLAYLIST_BYTES || 128 * 1024),
    maxReadBytes: Number(process.env.RADIO_VERIFY_MAX_READ_BYTES || 24 * 1024),
    retries: Number(process.env.RADIO_VERIFY_RETRIES || 2),
    checkpointEvery: Number(process.env.RADIO_VERIFY_CHECKPOINT_EVERY || 100),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(checkpointPath)) {
    return {
      version: 1,
      updated_at: new Date().toISOString(),
      verified_station_ids: [],
      results: {},
    };
  }
  return JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as Checkpoint;
}

function saveCheckpoint(checkpoint: Checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  ensureDir(checkpointPath);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function loadCandidates() {
  const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as {
    candidates?: CandidateRecord[];
  };
  return parsed.candidates || [];
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function loadBatchStationIds(supabase: SupabaseClient, candidates: CandidateRecord[]) {
  const sourceKeys = Array.from(
    new Set(candidates.map((candidate) => `${candidate.source_name}:${candidate.source_station_id}`))
  );
  const ids = new Set<string>();

  for (const sourceChunk of chunk(sourceKeys, 50)) {
    const sourceNames = sourceChunk.map((key) => key.split(":")[0]);
    const sourceIds = sourceChunk.map((key) => key.slice(key.indexOf(":") + 1));
    const { data, error } = await supabase
      .from("radio_station_sources")
      .select("station_id, source_name, source_station_id")
      .in("source_name", Array.from(new Set(sourceNames)))
      .in("source_station_id", sourceIds);
    if (error) throw error;
    for (const row of data || []) {
      const key = `${row.source_name}:${row.source_station_id}`;
      if (sourceChunk.includes(key) && row.station_id) ids.add(String(row.station_id));
    }
  }

  return Array.from(ids);
}

async function loadStations(supabase: SupabaseClient, ids: string[], force: boolean) {
  const rows: RadioVerifyRow[] = [];
  const select =
    "id, name, stream_url, source_stream_url, playback_status, reliability_score, consecutive_failures, status, is_active, is_verified, is_mature, quarantined_at, disabled_at, metadata_locked, manual_override, is_curated, is_featured, source_name, source_station_id, normalized_name, normalized_stream_url, station_fingerprint";

  for (const idChunk of chunk(ids, 100)) {
    let query = supabase.from("radio_stations").select(select).in("id", idChunk).eq("is_mature", false);
    if (!force) {
      query = query.or("is_verified.eq.false,is_verified.is.null,playback_status.neq.playable");
    }
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data || []) as RadioVerifyRow[]));
  }

  return rows;
}

async function getCounts(supabase: SupabaseClient) {
  type CountFilter =
    | { op: "eq"; column: string; value: string | number | boolean }
    | { op: "gte"; column: string; value: number }
    | { op: "is"; column: string; value: null }
    | { op: "not_is"; column: string; value: null };

  async function count(name: string, filters: CountFilter[] = []) {
    let query = supabase.from("radio_stations").select("id", { count: "exact", head: true });
    for (const filter of filters) {
      if (filter.op === "eq") query = query.eq(filter.column, filter.value);
      else if (filter.op === "gte") query = query.gte(filter.column, filter.value);
      else if (filter.op === "is") query = query.is(filter.column, filter.value);
      else query = query.not(filter.column, "is", filter.value);
    }
    const { count: total, error } = await query;
    if (error) throw error;
    return [name, total || 0] as const;
  }
  return Object.fromEntries(
    await Promise.all([
      count("total"),
      count("verified", [{ op: "eq", column: "is_verified", value: true }]),
      count("playable", [{ op: "eq", column: "playback_status", value: "playable" }]),
      count("unchecked", [{ op: "eq", column: "playback_status", value: "unchecked" }]),
      count("failed", [{ op: "eq", column: "playback_status", value: "failed" }]),
      count("quarantined", [{ op: "not_is", column: "quarantined_at", value: null }]),
      count("public_general", [
        { op: "eq", column: "status", value: "approved" },
        { op: "eq", column: "is_active", value: true },
        { op: "eq", column: "is_verified", value: true },
        { op: "eq", column: "playback_status", value: "playable" },
        { op: "eq", column: "is_mature", value: false },
        { op: "is", column: "quarantined_at", value: null },
        { op: "is", column: "disabled_at", value: null },
        { op: "gte", column: "reliability_score", value: 60 },
      ]),
      count("public_mature", [
        { op: "eq", column: "status", value: "approved" },
        { op: "eq", column: "is_active", value: true },
        { op: "eq", column: "is_verified", value: true },
        { op: "eq", column: "playback_status", value: "playable" },
        { op: "eq", column: "is_mature", value: true },
        { op: "is", column: "quarantined_at", value: null },
        { op: "is", column: "disabled_at", value: null },
        { op: "gte", column: "reliability_score", value: 60 },
      ]),
    ])
  );
}

async function probeWithRetries(row: RadioVerifyRow, options: ReturnType<typeof readArgs>) {
  let retries = 0;
  let last: RadioStreamProbeResult | null = null;
  const url = row.stream_url || row.source_stream_url;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    const probe = await probeRadioStream(url, {
      timeoutMs: options.timeoutMs,
      maxRedirects: options.maxRedirects,
      maxPlaylistBytes: options.maxPlaylistBytes,
      maxReadBytes: options.maxReadBytes,
    });
    last = probe;
    if (probe.playable || !probe.retryable) return { probe, retries };
    if (attempt < options.retries) {
      retries += 1;
      const backoff = Math.min(15_000, 1_500 * 2 ** attempt) + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
  }
  return { probe: last as RadioStreamProbeResult, retries };
}

async function updateStation(
  supabase: SupabaseClient,
  row: RadioVerifyRow,
  probe: RadioStreamProbeResult
) {
  const update = applyRadioVerificationProbe(row, probe);
  const payload: Record<string, unknown> = update;
  if (probe.playable && probe.finalUrl) payload.stream_url = probe.finalUrl;

  const { error } = await supabase.from("radio_stations").update(payload).eq("id", row.id);
  if (error) throw error;
  return update;
}

async function recordRun(supabase: SupabaseClient, report: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("radio_import_runs").upsert(
    {
      run_id: `radio-general-batch2-verification-${report.mode}`,
      source_name: "radio_browser_verification",
      started_at: now,
      completed_at: now,
      status: report.mode === "execute" ? "completed_verification" : "completed_verification_dry_run",
      records_received: Number(report.eligible || 0),
      records_normalized: Number(report.attempted || 0),
      records_inserted: 0,
      records_updated: Number(report.updated || 0),
      records_unchanged: Number(report.skipped_already_complete || 0),
      duplicate_source_count: 0,
      duplicate_canonical_count: 0,
      conflict_count: 0,
      invalid_count: Number(report.failed || 0),
      error_count: 0,
      updated_at: now,
    },
    { onConflict: "run_id" }
  );
  if (error) throw error;
}

async function runVerification(supabase: SupabaseClient, rows: RadioVerifyRow[], options: ReturnType<typeof readArgs>) {
  const checkpoint = loadCheckpoint();
  const completed = new Set(checkpoint.verified_station_ids);
  const selectedRows = options.sample ? rows.slice(0, Math.max(0, options.sample)) : rows;
  const stats: VerificationStats = {
    mode: options.mode,
    eligible: rows.length,
    attempted: 0,
    skipped_already_complete: 0,
    playable: 0,
    failed: 0,
    timed_out: 0,
    retryable: 0,
    quarantined: 0,
    redirects_resolved: 0,
    playlists_resolved: 0,
    unsupported_streams: 0,
    html_responses: 0,
    retries: 0,
    updated: 0,
    update_errors: 0,
    dry_run_no_rows_changed: options.mode === "dry-run",
    total_duration_ms: 0,
  };

  const started = performance.now();
  let cursor = 0;

  async function worker() {
    for (;;) {
      const row = selectedRows[cursor++];
      if (!row) break;
      if (completed.has(row.id) && !options.force) {
        stats.skipped_already_complete += 1;
        continue;
      }

      let probe: RadioStreamProbeResult;
      let retries = 0;
      try {
        const result = await probeWithRetries(row, options);
        probe = result.probe;
        retries = result.retries;
      } catch (error) {
        probe = {
          playable: false,
          outcome: "failed",
          reason: error instanceof Error ? error.message : "Verification failed.",
          finalUrl: null,
          contentType: null,
          bytesRead: 0,
          redirects: 0,
          playlistResolved: false,
          retryable: true,
          durationMs: 0,
        };
      }
      stats.attempted += 1;
      stats.retries += retries;
      if (probe.playable) stats.playable += 1;
      else stats.failed += 1;
      if (probe.outcome === "timed_out") stats.timed_out += 1;
      if (probe.retryable) stats.retryable += 1;
      if (probe.redirects > 0) stats.redirects_resolved += 1;
      if (probe.playlistResolved) stats.playlists_resolved += 1;
      if (probe.outcome === "unsupported_content") stats.unsupported_streams += 1;
      if (probe.outcome === "html_response") stats.html_responses += 1;

      if (options.mode === "execute") {
        try {
          const update = await updateStation(supabase, row, probe);
          stats.updated += 1;
          if (update.quarantined_at) stats.quarantined += 1;
        } catch {
          stats.update_errors += 1;
        }
      }

      completed.add(row.id);
      checkpoint.verified_station_ids = Array.from(completed);
      checkpoint.results[row.id] = probe.outcome;
      if (stats.attempted % options.checkpointEvery === 0) saveCheckpoint(checkpoint);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, () => worker()));
  stats.total_duration_ms = Math.round(performance.now() - started);
  saveCheckpoint(checkpoint);
  return stats;
}

async function main() {
  loadEnvFile(path.join(adminRoot, ".env.production"));
  loadEnvFile(path.join(adminRoot, ".env.local"));
  loadEnvFile(path.join(adminRoot, ".env"));
  const options = readArgs();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const candidates = loadCandidates();
  const beforeCounts = await getCounts(supabase);
  const stationIds = await loadBatchStationIds(supabase, candidates);
  const rows = await loadStations(supabase, stationIds, options.force);
  const stats = await runVerification(supabase, rows, options);
  const afterCounts = await getCounts(supabase);
  const report = {
    ...stats,
    sample_requested: options.sample,
    batch_candidate_count: candidates.length,
    batch_station_ids: stationIds.length,
    before_counts: beforeCounts,
    after_counts: afterCounts,
    average_verification_duration_ms:
      stats.attempted > 0 ? Math.round(stats.total_duration_ms / stats.attempted) : 0,
    estimated_full_run_minutes:
      stats.attempted > 0 && options.sample
        ? Number(((stats.total_duration_ms / stats.attempted) * rows.length / 60_000).toFixed(1))
        : null,
  };

  if (options.mode === "execute") await recordRun(supabase, report);
  ensureDir(resultPath);
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

