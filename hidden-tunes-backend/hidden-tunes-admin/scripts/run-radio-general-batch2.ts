import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import {
  RADIO_WORKER_CATEGORIES,
  importNormalizedRadioStation,
} from "@/lib/radioCatalogWorker";
import {
  NormalizedRadioStation,
  RadioBrowserStation,
  normalizeRadioBrowserStationForImport,
} from "@/lib/radioNormalization";

const adminRoot = path.resolve(__dirname, "..");
const checkpointPath = path.join(adminRoot, "data", "radio-general-batch2-candidates.json");
const resultPath = path.join(adminRoot, "data", "radio-general-batch2-result.json");
const RADIO_BROWSER_SERVERS = [
  "https://de1.api.radio-browser.info",
  "https://all.api.radio-browser.info",
] as const;
const USER_AGENT = "HiddenTunes/1.0 radio batch2";

type Mode = "dry-run" | "execute";
type BatchFailure = {
  category: string;
  offset: number;
  attempts: number;
  reason: string;
  timestamp: string;
};
type CandidateRecord = NormalizedRadioStation & {
  discovered_category: string;
  discovered_offset: number;
};
type Checkpoint = {
  version: 1;
  created_at: string;
  updated_at: string;
  candidates: CandidateRecord[];
  completed_batches: Array<{ category: string; offset: number }>;
  failed_batches: BatchFailure[];
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
  const mode: Mode = args.has("--execute") ? "execute" : "dry-run";
  const targetIndex = process.argv.indexOf("--target");
  const maxBatchesIndex = process.argv.indexOf("--max-batches");
  return {
    mode,
    target: targetIndex >= 0 ? Number(process.argv[targetIndex + 1]) : 10000,
    maxBatches: maxBatchesIndex >= 0 ? Number(process.argv[maxBatchesIndex + 1]) : 420,
    concurrency: Number(process.env.RADIO_BATCH_CONCURRENCY || 2),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 750),
    maxRetries: Number(process.env.RADIO_BATCH_MAX_RETRIES || 5),
    pageSize: Number(process.env.RADIO_BATCH_PAGE_SIZE || 25),
    timeoutMs: Number(process.env.RADIO_BATCH_TIMEOUT_MS || 12_000),
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      candidates: [],
      completed_batches: [],
      failed_batches: [],
    };
  }
  return JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as Checkpoint;
}

function saveCheckpoint(checkpoint: Checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  ensureDir(checkpointPath);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function batchKey(category: string, offset: number) {
  return `${category}@${offset}`;
}

function buildRadioBrowserPath(category: (typeof RADIO_WORKER_CATEGORIES)[number], limit: number, offset: number) {
  if (category.countryCode) {
    return `/json/stations/bycountrycodeexact/${encodeURIComponent(
      category.countryCode
    )}?limit=${limit}&offset=${offset}&order=votes&reverse=true&hidebroken=true`;
  }
  if (category.tag) {
    return `/json/stations/search?tag=${encodeURIComponent(
      category.tag
    )}&limit=${limit}&offset=${offset}&order=votes&reverse=true&hidebroken=true`;
  }
  return `/json/stations/search?limit=${limit}&offset=${offset}&order=votes&reverse=true&hidebroken=true`;
}

async function fetchJson(server: string, requestPath: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${server}${requestPath}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`radio_browser_${response.status}`);
    const text = await response.text();
    if (!text.trim().startsWith("[")) throw new Error("radio_browser_invalid_json");
    return JSON.parse(text) as RadioBrowserStation[];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBatch(
  category: (typeof RADIO_WORKER_CATEGORIES)[number],
  offset: number,
  options: ReturnType<typeof readArgs>
) {
  const requestPath = buildRadioBrowserPath(category, options.pageSize, offset);
  let lastError = "unknown";
  let attempts = 0;
  for (attempts = 1; attempts <= options.maxRetries; attempts += 1) {
    for (const server of RADIO_BROWSER_SERVERS) {
      try {
        const stations = await fetchJson(server, requestPath, options.timeoutMs);
        return { stations, server, attempts };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    const backoff = Math.min(60_000, 2_000 * 2 ** (attempts - 1));
    const jitter = Math.floor(Math.random() * 750);
    await sleep(backoff + jitter);
  }
  throw new Error(`${lastError} after ${attempts - 1} attempts`);
}

function isMatureCandidate(station: NormalizedRadioStation) {
  const text = [station.name, station.tags.join(" "), station.category_slug]
    .join(" ")
    .toLowerCase();
  if (/adult contemporary|adult hits|adult pop/.test(text)) return false;
  return /\b(erotic|sex|xxx|porn|adult entertainment|explicit talk)\b/.test(text);
}

function uniqueIndexes(candidates: CandidateRecord[]) {
  return {
    source: new Set(candidates.map((candidate) => `${candidate.source_name}:${candidate.source_station_id}`)),
    stream: new Set(candidates.map((candidate) => candidate.normalized_stream_url)),
    fingerprint: new Set(candidates.map((candidate) => candidate.station_fingerprint)),
  };
}

type CountFilter =
  | { op: "eq"; column: string; value: string | number | boolean }
  | { op: "gte"; column: string; value: number }
  | { op: "is"; column: string; value: null }
  | { op: "not_is"; column: string; value: null };

async function getCounts(supabase: SupabaseClient) {
  async function count(name: string, filters: CountFilter[] = []) {
    let query = supabase.from("radio_stations").select("id", { count: "exact", head: true });
    for (const filter of filters) {
      if (filter.op === "eq") query = query.eq(filter.column, filter.value);
      else if (filter.op === "gte") query = query.gte(filter.column, filter.value);
      else if (filter.op === "is") query = query.is(filter.column, filter.value);
      else query = query.not(filter.column, "is", filter.value);
    }
    const { count, error } = await query;
    if (error) throw error;
    return [name, count || 0] as const;
  }
  return Object.fromEntries(
    await Promise.all([
      count("total"),
      count("verified", [{ op: "eq", column: "is_verified", value: true }]),
      count("playable", [{ op: "eq", column: "playback_status", value: "playable" }]),
      count("unchecked", [{ op: "eq", column: "playback_status", value: "unchecked" }]),
      count("quarantined", [{ op: "not_is", column: "quarantined_at", value: null }]),
      count("disabled", [{ op: "not_is", column: "disabled_at", value: null }]),
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

async function recordImportRun(supabase: SupabaseClient, report: Record<string, unknown>) {
  const isExecute = report.mode === "execute";
  const now = new Date().toISOString();
  const { error } = await supabase.from("radio_import_runs").upsert(
    {
      run_id: `radio-general-batch2-${report.mode}`,
      source_name: "radio_browser",
      started_at: now,
      completed_at: now,
      status: isExecute ? "completed_metadata_import" : "completed_dry_run",
      records_received: Number(report.records_received || 0),
      records_normalized: Number(report.records_normalized || 0),
      records_inserted: Number(report.inserted || 0),
      records_updated: Number(report.updated || 0),
      records_unchanged: Number(report.unchanged || 0),
      duplicate_source_count: Number(report.duplicate_source_ids || 0),
      duplicate_canonical_count: Number(report.duplicate_canonical_stations || 0),
      conflict_count: Number(report.conflicts || 0),
      invalid_count: Number(report.invalid_records || 0),
      error_count: Number(report.failed_writes || 0),
      updated_at: now,
    },
    { onConflict: "run_id" }
  );
  if (error) throw error;
}

function distribution(candidates: CandidateRecord[], selector: (candidate: CandidateRecord) => string | null) {
  const result: Record<string, number> = {};
  for (const candidate of candidates) {
    const key = selector(candidate) || "unknown";
    result[key] = (result[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([, a], [, b]) => b - a));
}

async function discover(checkpoint: Checkpoint, options: ReturnType<typeof readArgs>) {
  const completed = new Set(checkpoint.completed_batches.map((batch) => batchKey(batch.category, batch.offset)));
  const indexes = uniqueIndexes(checkpoint.candidates);
  const stats = {
    previous_candidates_reused: checkpoint.candidates.length,
    newly_discovered_candidates: 0,
    records_received: 0,
    records_normalized: 0,
    duplicate_source_ids: 0,
    duplicate_normalized_stream_urls: 0,
    duplicate_fingerprints: 0,
    mature_candidates_excluded: 0,
    invalid_records: 0,
    source_batches_attempted: 0,
    successful_source_batches: 0,
    failed_source_batches: 0,
    retries_performed: 0,
  };

  const tasks: Array<{ categoryIndex: number; offset: number }> = [];
  for (let round = 0; round < Math.ceil(options.maxBatches / RADIO_WORKER_CATEGORIES.length); round += 1) {
    for (let categoryIndex = 0; categoryIndex < RADIO_WORKER_CATEGORIES.length; categoryIndex += 1) {
      tasks.push({ categoryIndex, offset: round * options.pageSize });
    }
  }

  let cursor = 0;
  async function worker() {
    while (checkpoint.candidates.length < options.target && cursor < tasks.length) {
      const task = tasks[cursor++];
      const category = RADIO_WORKER_CATEGORIES[task.categoryIndex];
      const key = batchKey(category.id, task.offset);
      if (completed.has(key)) continue;
      stats.source_batches_attempted += 1;
      await sleep(options.delayMs);
      try {
        const fetched = await fetchBatch(category, task.offset, options);
        stats.retries_performed += Math.max(0, fetched.attempts - 1);
        stats.records_received += fetched.stations.length;
        for (const raw of fetched.stations) {
          const normalized = normalizeRadioBrowserStationForImport(raw, category.id, {
            sourceServer: fetched.server,
          });
          if (!normalized) {
            stats.invalid_records += 1;
            continue;
          }
          stats.records_normalized += 1;
          if (isMatureCandidate(normalized)) {
            stats.mature_candidates_excluded += 1;
            continue;
          }
          const sourceKey = `${normalized.source_name}:${normalized.source_station_id}`;
          if (indexes.source.has(sourceKey)) {
            stats.duplicate_source_ids += 1;
            continue;
          }
          if (indexes.stream.has(normalized.normalized_stream_url)) {
            stats.duplicate_normalized_stream_urls += 1;
            continue;
          }
          if (indexes.fingerprint.has(normalized.station_fingerprint)) {
            stats.duplicate_fingerprints += 1;
            continue;
          }
          indexes.source.add(sourceKey);
          indexes.stream.add(normalized.normalized_stream_url);
          indexes.fingerprint.add(normalized.station_fingerprint);
          checkpoint.candidates.push({
            ...normalized,
            discovered_category: category.id,
            discovered_offset: task.offset,
          });
          stats.newly_discovered_candidates += 1;
          if (checkpoint.candidates.length >= options.target) break;
        }
        checkpoint.completed_batches.push({ category: category.id, offset: task.offset });
        completed.add(key);
        stats.successful_source_batches += 1;
        saveCheckpoint(checkpoint);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        checkpoint.failed_batches.push({
          category: category.id,
          offset: task.offset,
          attempts: options.maxRetries,
          reason,
          timestamp: new Date().toISOString(),
        });
        stats.failed_source_batches += 1;
        saveCheckpoint(checkpoint);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  return stats;
}

async function classifyCandidates(candidates: CandidateRecord[], mode: Mode) {
  const stats = {
    would_insert: 0,
    would_update: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    duplicate_canonical_stations: 0,
    conflicts: 0,
    failed_writes: 0,
    curated_field_protections_triggered: 0,
    verification_fields_preserved: 0,
  };
  for (const candidate of candidates) {
    try {
      const result = await importNormalizedRadioStation(candidate, { dryRun: mode === "dry-run" });
      if (result.classification === "inserted") {
        if (mode === "dry-run") stats.would_insert += 1;
        else stats.inserted += 1;
      } else if (result.classification === "updated") {
        if (mode === "dry-run") stats.would_update += 1;
        else stats.updated += 1;
      } else if (result.classification === "unchanged") {
        stats.unchanged += 1;
      } else if (result.classification === "duplicate_canonical") {
        stats.duplicate_canonical_stations += 1;
      } else if (result.classification === "conflict") {
        stats.conflicts += 1;
      }
      if (result.curatedProtected) stats.curated_field_protections_triggered += 1;
      if (result.verificationPreserved) stats.verification_fields_preserved += 1;
    } catch {
      stats.failed_writes += 1;
    }
  }
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

  const started = performance.now();
  const beforeCounts = await getCounts(supabase);
  const checkpoint = loadCheckpoint();
  const discovery = options.mode === "dry-run" ? await discover(checkpoint, options) : {
    previous_candidates_reused: checkpoint.candidates.length,
    newly_discovered_candidates: 0,
    records_received: 0,
    records_normalized: 0,
    duplicate_source_ids: 0,
    duplicate_normalized_stream_urls: 0,
    duplicate_fingerprints: 0,
    mature_candidates_excluded: 0,
    invalid_records: 0,
    source_batches_attempted: 0,
    successful_source_batches: 0,
    failed_source_batches: 0,
    retries_performed: 0,
  };
  const candidates = checkpoint.candidates.slice(0, options.target);
  const classification = await classifyCandidates(candidates, options.mode);
  const afterCounts = await getCounts(supabase);
  const runtimeSeconds = Math.round((performance.now() - started) / 1000);
  const report = {
    mode: options.mode,
    checkpoint_path: checkpointPath,
    requested_candidate_floor: options.target,
    unique_candidates_collected: checkpoint.candidates.length,
    approved_candidate_snapshot_size: candidates.length,
    completed_candidate_floor: checkpoint.candidates.length >= options.target,
    ...discovery,
    ...classification,
    general_candidates: candidates.length,
    mature_candidates_excluded: discovery.mature_candidates_excluded,
    category_distribution: distribution(candidates, (candidate) => candidate.discovered_category),
    country_distribution: distribution(candidates, (candidate) => candidate.country_code || candidate.country),
    language_distribution: distribution(candidates, (candidate) => candidate.language),
    source_runtime_seconds: runtimeSeconds,
    average_source_request_rate_per_minute: discovery.source_batches_attempted > 0
      ? Number((discovery.source_batches_attempted / Math.max(1, runtimeSeconds / 60)).toFixed(2))
      : 0,
    before_counts: beforeCounts,
    after_counts: afterCounts,
    production_row_count_unchanged: beforeCounts.total === afterCounts.total,
    public_rows_unchanged: beforeCounts.public_general === afterCounts.public_general && beforeCounts.public_mature === afterCounts.public_mature,
    verification_rows_unchanged: beforeCounts.verified === afterCounts.verified && beforeCounts.playable === afterCounts.playable,
    quarantine_rows_unchanged: beforeCounts.quarantined === afterCounts.quarantined,
    no_stream_probing_performed: true,
    failed_batches: checkpoint.failed_batches.slice(-50),
  };
  ensureDir(resultPath);
  await recordImportRun(supabase, report);
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

