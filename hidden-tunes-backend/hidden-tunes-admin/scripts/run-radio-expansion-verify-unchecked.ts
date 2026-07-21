import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import { chunk } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  remainingPublicPlayableGap,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";
import {
  applyRadioVerificationProbe,
  probeRadioStream,
  type RadioStreamProbeResult,
} from "@/lib/radioStreamVerification";
import { RADIO_EXPANSION_BATCH3_NAME, radioExpansionBatchPaths } from "@/lib/radioExpansion25k/constants";
import {
  parseVerificationCheckpoint,
  shouldSkipVerification,
} from "@/lib/radioExpansion25k/verificationCheckpointPolicy";

const BATCH_NAME = "radio-expansion-verify-unchecked";
const adminRoot = path.resolve(__dirname, "..");
const checkpointPath = path.join(adminRoot, "data", `${BATCH_NAME}-checkpoint.json`);
const resultPath = path.join(adminRoot, "data", `${BATCH_NAME}-result.json`);
const batch3ResultPath = radioExpansionBatchPaths(adminRoot, RADIO_EXPANSION_BATCH3_NAME).result;

type Mode = "dry-run" | "execute";

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

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const limitIndex = process.argv.indexOf("--limit");
  const sampleIndex = process.argv.indexOf("--sample");
  return {
    mode: args.has("--execute") ? ("execute" as Mode) : ("dry-run" as Mode),
    source: args.has("--from-batch3-result") ? ("batch3_result" as const) : ("unchecked_db" as const),
    limit: limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : null,
    sample: sampleIndex >= 0 ? Number(process.argv[sampleIndex + 1]) : null,
    force: args.has("--force"),
    concurrency: Number(process.env.RADIO_VERIFY_CONCURRENCY || 4),
    timeoutMs: Number(process.env.RADIO_VERIFY_TIMEOUT_MS || 12_000),
    maxRedirects: Number(process.env.RADIO_VERIFY_MAX_REDIRECTS || 5),
    maxPlaylistBytes: Number(process.env.RADIO_VERIFY_MAX_PLAYLIST_BYTES || 128 * 1024),
    maxReadBytes: Number(process.env.RADIO_VERIFY_MAX_READ_BYTES || 24 * 1024),
    retries: Number(process.env.RADIO_VERIFY_RETRIES || 2),
    checkpointEvery: Number(process.env.RADIO_VERIFY_CHECKPOINT_EVERY || 100),
    pageSize: Number(process.env.RADIO_VERIFY_PAGE_SIZE || 1000),
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
  const raw = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as unknown;
  const parsed = parseVerificationCheckpoint(raw);
  if (!parsed.ok) {
    // Malformed checkpoint: start fresh rather than skip the world.
    return {
      version: 1,
      updated_at: new Date().toISOString(),
      verified_station_ids: [],
      results: {},
    };
  }
  return {
    version: 1,
    updated_at: new Date().toISOString(),
    verified_station_ids: parsed.verified_station_ids,
    results: parsed.results,
  };
}

function saveCheckpoint(checkpoint: Checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  ensureDir(checkpointPath);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

let checkpointWriteChain = Promise.resolve();

function queueCheckpointSave(checkpoint: Checkpoint) {
  checkpointWriteChain = checkpointWriteChain
    .then(() => {
      saveCheckpoint({
        ...checkpoint,
        verified_station_ids: Array.from(new Set(checkpoint.verified_station_ids)),
      });
    })
    .catch(() => undefined);
  return checkpointWriteChain;
}

function loadBatch3InsertedIds() {
  if (!fs.existsSync(batch3ResultPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(batch3ResultPath, "utf8")) as {
    inserted_station_ids?: string[];
  };
  return parsed.inserted_station_ids || [];
}

async function loadUncheckedStationIds(
  supabase: SupabaseClient,
  options: ReturnType<typeof readArgs>
) {
  const ids: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("radio_stations")
      .select("id")
      .eq("playback_status", "unchecked")
      .eq("is_mature", false)
      .is("disabled_at", null)
      .order("imported_at", { ascending: false })
      .range(offset, offset + options.pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      ids.push(String(row.id));
    }
    if (options.limit && ids.length >= options.limit) return ids.slice(0, options.limit);
    if (data.length < options.pageSize) break;
    offset += options.pageSize;
  }

  return ids;
}

async function loadStationsByIds(supabase: SupabaseClient, ids: string[]) {
  const rows: RadioVerifyRow[] = [];
  const select =
    "id, name, stream_url, source_stream_url, playback_status, reliability_score, consecutive_failures, status, is_active, is_verified, is_mature, quarantined_at, disabled_at, metadata_locked, manual_override, is_curated, is_featured, source_name, source_station_id, normalized_name, normalized_stream_url, station_fingerprint";

  for (const idChunk of chunk(ids, 100)) {
    const { data, error } = await supabase
      .from("radio_stations")
      .select(select)
      .in("id", idChunk)
      .eq("is_mature", false);
    if (error) throw error;
    rows.push(...((data || []) as RadioVerifyRow[]));
  }

  return rows.filter((row) => row.playback_status === "unchecked");
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
  const payload: Record<string, unknown> = { ...update };
  if (probe.playable && probe.finalUrl) payload.stream_url = probe.finalUrl;
  const { error } = await supabase.from("radio_stations").update(payload).eq("id", row.id);
  if (error) throw error;
  return update;
}

async function recordRun(supabase: SupabaseClient, report: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("radio_import_runs").upsert(
    {
      run_id: `${BATCH_NAME}-${report.mode}`,
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
      error_count: Number(report.update_errors || 0),
      updated_at: now,
    },
    { onConflict: "run_id" }
  );
  if (error) throw error;
}

async function runVerification(
  supabase: SupabaseClient,
  rows: RadioVerifyRow[],
  options: ReturnType<typeof readArgs>
) {
  const checkpoint = loadCheckpoint();
  const completed = new Set(checkpoint.verified_station_ids);
  const selectedRows = options.sample ? rows.slice(0, Math.max(0, options.sample)) : rows;
  const stats = {
    mode: options.mode,
    source: options.source,
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
      if (
        shouldSkipVerification({
          stationId: row.id,
          playbackStatus: row.playback_status,
          quarantinedAt: row.quarantined_at,
          disabledAt: row.disabled_at,
          completedIds: completed,
          force: options.force,
        })
      ) {
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
      if (stats.attempted % options.checkpointEvery === 0) await queueCheckpointSave(checkpoint);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, options.concurrency) }, () => worker()));
  stats.total_duration_ms = Math.round(performance.now() - started);
  await queueCheckpointSave(checkpoint);
  return stats;
}

async function main() {
  loadAdminEnv(adminRoot);
  const options = readArgs();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase environment variables.");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const productionPublicBefore = await fetchProductionPublicCount().catch(() => null);
  const beforeCounts = await getRadioCatalogCounts(supabase);

  const stationIds =
    options.source === "batch3_result"
      ? (options.limit ? loadBatch3InsertedIds().slice(0, options.limit) : loadBatch3InsertedIds())
      : await loadUncheckedStationIds(supabase, options);

  const rows = await loadStationsByIds(supabase, stationIds);
  const stats = await runVerification(supabase, rows, options);
  const afterCounts = await getRadioCatalogCounts(supabase);
  const productionPublicAfter = await fetchProductionPublicCount().catch(() => null);

  const report = {
    batch: BATCH_NAME,
    ...stats,
    limit_requested: options.limit,
    sample_requested: options.sample,
    station_ids_loaded: stationIds.length,
    target_public_playable: RADIO_PUBLIC_PLAYABLE_TARGET,
    before_counts: beforeCounts,
    after_counts: afterCounts,
    production_public_before: productionPublicBefore,
    production_public_after: productionPublicAfter,
    remaining_gap_before: remainingPublicPlayableGap(
      productionPublicBefore ?? beforeCounts.public_general
    ),
    remaining_gap_after: remainingPublicPlayableGap(
      productionPublicAfter ?? afterCounts.public_general
    ),
    average_verification_duration_ms:
      stats.attempted > 0 ? Math.round(stats.total_duration_ms / stats.attempted) : 0,
    existing_rows_updated_on_existing_catalog: 0,
    existing_public_stations_modified: 0,
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
