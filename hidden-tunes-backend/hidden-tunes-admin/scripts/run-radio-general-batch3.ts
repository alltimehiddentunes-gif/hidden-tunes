import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  CatalogDedupeIndex,
  isCatalogDuplicate,
  loadCatalogDedupeIndex,
  mergeCatalogIntoCandidateIndexes,
} from "@/lib/radioExpansion25k/catalogDedupeIndex";
import { insertNewRadioStationOnly } from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  remainingPublicPlayableGap,
  RADIO_PUBLIC_PLAYABLE_TARGET,
} from "@/lib/radioExpansion25k/publicCounts";
import {
  distribution,
  fetchRadioBrowserJson,
  isMatureRadioCandidate,
  sleep,
} from "@/lib/radioExpansion25k/radioBrowserFetch";
import { buildRadioExpansionBatch5Queries } from "@/lib/radioExpansion25k/batch5Queries";
import { buildRadioExpansionBatch6Queries } from "@/lib/radioExpansion25k/batch6Queries";
import { buildRadioExpansionBatch7Queries } from "@/lib/radioExpansion25k/batch7Queries";
import { buildRadioExpansionBatch8Queries } from "@/lib/radioExpansion25k/batch8Queries";
import { buildRadioExpansionBatch9Queries } from "@/lib/radioExpansion25k/batch9Queries";
import { buildRadioExpansionBatch10Queries } from "@/lib/radioExpansion25k/batch10Queries";
import {
  buildRadioBrowserPath,
  buildRadioExpansionQueries,
  type RadioExpansionQuery,
} from "@/lib/radioExpansion25k/sourceQueries";
import {
  RADIO_EXPANSION_BATCH3_NAME,
  RADIO_EXPANSION_BATCH5_NAME,
  RADIO_EXPANSION_BATCH6_NAME,
  RADIO_EXPANSION_BATCH7_NAME,
  RADIO_EXPANSION_BATCH8_NAME,
  RADIO_EXPANSION_BATCH9_NAME,
  RADIO_EXPANSION_BATCH10_NAME,
  radioExpansionBatchPaths,
} from "@/lib/radioExpansion25k/constants";

const BATCH_NAME = process.env.RADIO_EXPANSION_BATCH || RADIO_EXPANSION_BATCH3_NAME;
import {
  NormalizedRadioStation,
  normalizeRadioBrowserStationForImport,
} from "@/lib/radioNormalization";

const adminRoot = path.resolve(__dirname, "..");
const batchPaths = radioExpansionBatchPaths(adminRoot, BATCH_NAME);
const checkpointPath = batchPaths.candidates;
const resultPath = batchPaths.result;
const USER_AGENT = "HiddenTunes/1.0 radio batch3";

type Mode = "dry-run" | "execute";

export type Batch3Candidate = NormalizedRadioStation & {
  discovered_query_key: string;
  discovered_offset: number;
};

export type Batch3Checkpoint = {
  version: 2;
  run_id: string;
  created_at: string;
  updated_at: string;
  candidates: Batch3Candidate[];
  query_offsets: Record<string, number>;
  completed_pages: Array<{ query_key: string; offset: number }>;
  exhausted_queries: string[];
  failed_pages: Array<{
    query_key: string;
    offset: number;
    attempts: number;
    reason: string;
    timestamp: string;
  }>;
  empty_streak: Record<string, number>;
  last_public_count: number | null;
  remaining_gap: number | null;
};

function readArgs() {
  const args = new Set(process.argv.slice(2));
  const targetIndex = process.argv.indexOf("--target");
  const maxPagesIndex = process.argv.indexOf("--max-pages");
  return {
    mode: args.has("--execute") ? ("execute" as Mode) : ("dry-run" as Mode),
    target: targetIndex >= 0 ? Number(process.argv[targetIndex + 1]) : 20_000,
    maxPages: maxPagesIndex >= 0 ? Number(process.argv[maxPagesIndex + 1]) : 12_000,
    discoverOnly: args.has("--discover-only"),
    importOnly: args.has("--import-only"),
    concurrency: Number(process.env.RADIO_BATCH_CONCURRENCY || 2),
    delayMs: Number(process.env.RADIO_BATCH_DELAY_MS || 750),
    maxRetries: Number(process.env.RADIO_BATCH_MAX_RETRIES || 5),
    pageSize: Number(process.env.RADIO_BATCH_PAGE_SIZE || 25),
    timeoutMs: Number(process.env.RADIO_BATCH_TIMEOUT_MS || 12_000),
    checkpointEvery: Number(process.env.RADIO_BATCH_CHECKPOINT_EVERY || 100),
  };
}

function ensureDir(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function loadBatch3Checkpoint(): Batch3Checkpoint {
  if (!fs.existsSync(checkpointPath)) {
    return {
      version: 2,
      run_id: BATCH_NAME,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      candidates: [],
      query_offsets: {},
      completed_pages: [],
      exhausted_queries: [],
      failed_pages: [],
      empty_streak: {},
      last_public_count: null,
      remaining_gap: null,
    };
  }
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8")) as Batch3Checkpoint;
  if (!checkpoint.empty_streak) checkpoint.empty_streak = {};
  return checkpoint;
}

export function saveBatch3Checkpoint(checkpoint: Batch3Checkpoint) {
  checkpoint.updated_at = new Date().toISOString();
  checkpoint.completed_pages = [];
  ensureDir(checkpointPath);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function pageKey(queryKey: string, offset: number) {
  return `${queryKey}@${offset}`;
}

function uniqueIndexes(candidates: Batch3Candidate[]) {
  return {
    source: new Set(candidates.map((c) => `${c.source_name}:${c.source_station_id}`)),
    stream: new Set(candidates.map((c) => c.normalized_stream_url)),
    fingerprint: new Set(candidates.map((c) => c.station_fingerprint)),
  };
}

const EMPTY_PAGE_EXHAUST_THRESHOLD = 5;

async function fetchQueryPage(
  query: RadioExpansionQuery,
  offset: number,
  options: ReturnType<typeof readArgs>
) {
  const path = buildRadioBrowserPath(query, options.pageSize, offset);
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= options.maxRetries; attempt += 1) {
    try {
      return await fetchRadioBrowserJson(path, {
        timeoutMs: options.timeoutMs,
        userAgent: USER_AGENT,
        maxRetries: 1,
      });
    } catch (error) {
      lastError = error;
      if (attempt < options.maxRetries) {
        await sleep(Math.min(30_000, 1_500 * 2 ** (attempt - 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("radio_browser_fetch_failed");
}

function markQueryExhausted(checkpoint: Batch3Checkpoint, queryKey: string) {
  if (!checkpoint.exhausted_queries.includes(queryKey)) {
    checkpoint.exhausted_queries.push(queryKey);
  }
}

function buildExpansionQueriesForBatch(batchName: string) {
  if (batchName === RADIO_EXPANSION_BATCH5_NAME) {
    return buildRadioExpansionBatch5Queries();
  }
  if (batchName === RADIO_EXPANSION_BATCH6_NAME) {
    return buildRadioExpansionBatch6Queries();
  }
  if (batchName === RADIO_EXPANSION_BATCH7_NAME) {
    return buildRadioExpansionBatch7Queries();
  }
  if (batchName === RADIO_EXPANSION_BATCH8_NAME) {
    return buildRadioExpansionBatch8Queries();
  }
  if (batchName === RADIO_EXPANSION_BATCH9_NAME) {
    return buildRadioExpansionBatch9Queries();
  }
  if (batchName === RADIO_EXPANSION_BATCH10_NAME) {
    return buildRadioExpansionBatch10Queries();
  }
  return buildRadioExpansionQueries();
}

async function discoverCandidates(
  supabase: SupabaseClient,
  checkpoint: Batch3Checkpoint,
  options: ReturnType<typeof readArgs>
) {
  const queries = buildExpansionQueriesForBatch(BATCH_NAME);
  const exhausted = new Set(checkpoint.exhausted_queries);
  const activeQueries = queries.filter((query) => !exhausted.has(query.key));
  const catalogIndex = await loadCatalogDedupeIndex(supabase);
  const indexes = uniqueIndexes(checkpoint.candidates);
  mergeCatalogIntoCandidateIndexes(indexes, catalogIndex);

  const stats = {
    catalog_index: {
      source_keys: catalogIndex.source_key_count,
      streams: catalogIndex.stream_count,
      fingerprints: catalogIndex.fingerprint_count,
      legacy_uuids: catalogIndex.legacy_uuid_count,
    },
    records_received: 0,
    records_normalized: 0,
    duplicate_source_ids: 0,
    duplicate_normalized_stream_urls: 0,
    duplicate_fingerprints: 0,
    catalog_duplicates_skipped: 0,
    mature_candidates_excluded: 0,
    invalid_records: 0,
    source_pages_attempted: 0,
    source_pages_successful: 0,
    source_pages_failed: 0,
    source_pages_exhausted: 0,
    newly_discovered_candidates: 0,
    retries_performed: 0,
  };

  let queryCursor = 0;
  let idleRounds = 0;

  while (
    checkpoint.candidates.length < options.target &&
    activeQueries.length > exhausted.size &&
    idleRounds < activeQueries.length * 2
  ) {
    const query = activeQueries[queryCursor % activeQueries.length];
    queryCursor += 1;
    if (exhausted.has(query.key)) {
      idleRounds += 1;
      continue;
    }

    const offset = checkpoint.query_offsets[query.key] || 0;
    stats.source_pages_attempted += 1;
    await sleep(options.delayMs);

    try {
      const fetched = await fetchQueryPage(query, offset, options);
      stats.records_received += fetched.stations.length;
      let pageNew = 0;

      if (fetched.stations.length === 0) {
        markQueryExhausted(checkpoint, query.key);
        exhausted.add(query.key);
        stats.source_pages_exhausted += 1;
      } else {
        for (const raw of fetched.stations) {
          const normalized = normalizeRadioBrowserStationForImport(raw, query.categorySlug, {
            sourceServer: fetched.server,
          });
          if (!normalized) {
            stats.invalid_records += 1;
            continue;
          }
          stats.records_normalized += 1;
          if (isMatureRadioCandidate(normalized)) {
            stats.mature_candidates_excluded += 1;
            continue;
          }

          const catalogDup = isCatalogDuplicate(normalized, catalogIndex);
          if (catalogDup) {
            stats.catalog_duplicates_skipped += 1;
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
            discovered_query_key: query.key,
            discovered_offset: offset,
          });
          pageNew += 1;
          stats.newly_discovered_candidates += 1;
          if (checkpoint.candidates.length >= options.target) break;
        }

        checkpoint.query_offsets[query.key] = offset + options.pageSize;
        if (pageNew === 0) {
          checkpoint.empty_streak[query.key] = (checkpoint.empty_streak[query.key] || 0) + 1;
          if (checkpoint.empty_streak[query.key] >= EMPTY_PAGE_EXHAUST_THRESHOLD) {
            markQueryExhausted(checkpoint, query.key);
            exhausted.add(query.key);
            stats.source_pages_exhausted += 1;
          }
          idleRounds += 1;
        } else {
          checkpoint.empty_streak[query.key] = 0;
          idleRounds = 0;
        }
      }

      stats.source_pages_successful += 1;
      if (stats.source_pages_attempted % 25 === 0) {
        console.log(
          JSON.stringify({
            discovery_progress: {
              batch: BATCH_NAME,
              candidates: checkpoint.candidates.length,
              target: options.target,
              pages_attempted: stats.source_pages_attempted,
              catalog_duplicates_skipped: stats.catalog_duplicates_skipped,
              newly_discovered_candidates: stats.newly_discovered_candidates,
            },
          })
        );
        saveBatch3Checkpoint(checkpoint);
      }
      if (stats.newly_discovered_candidates > 0 && stats.newly_discovered_candidates % options.checkpointEvery === 0) {
        saveBatch3Checkpoint(checkpoint);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      checkpoint.failed_pages.push({
        query_key: query.key,
        offset,
        attempts: options.maxRetries,
        reason,
        timestamp: new Date().toISOString(),
      });
      stats.source_pages_failed += 1;
      idleRounds += 1;
      saveBatch3Checkpoint(checkpoint);
    }
  }

  saveBatch3Checkpoint(checkpoint);
  return stats;
}

async function importCandidates(
  supabase: SupabaseClient,
  candidates: Batch3Candidate[],
  mode: Mode
) {
  const stats = {
    existing_catalog_duplicates_skipped: 0,
    would_insert: 0,
    inserted: 0,
    failed_writes: 0,
    existing_rows_updated: 0,
    existing_rows_deleted: 0,
    inserted_station_ids: [] as string[],
    duplicate_reasons: {} as Record<string, number>,
    errors: [] as string[],
  };

  const catalogIndex = await loadCatalogDedupeIndex(supabase);
  const pending: Batch3Candidate[] = [];

  for (const candidate of candidates) {
    const catalogDup = isCatalogDuplicate(candidate, catalogIndex);
    if (catalogDup) {
      stats.existing_catalog_duplicates_skipped += 1;
      stats.duplicate_reasons[catalogDup] = (stats.duplicate_reasons[catalogDup] || 0) + 1;
      continue;
    }
    pending.push(candidate);
  }

  for (let index = 0; index < pending.length; index += 1) {
    const candidate = pending[index];
    if (mode === "dry-run") {
      stats.would_insert += 1;
      continue;
    }

    const result = await insertNewRadioStationOnly(supabase, candidate, { dryRun: false });
    if (result.outcome === "inserted") {
      stats.inserted += 1;
      if (result.stationId) stats.inserted_station_ids.push(result.stationId);
      catalogIndex.sourceKeys.add(`${candidate.source_name}:${candidate.source_station_id}`);
      catalogIndex.streams.add(candidate.normalized_stream_url);
      catalogIndex.fingerprints.add(candidate.station_fingerprint);
      continue;
    }
    if (result.outcome === "duplicate") {
      stats.existing_catalog_duplicates_skipped += 1;
      const reason = result.reason || "duplicate";
      stats.duplicate_reasons[reason] = (stats.duplicate_reasons[reason] || 0) + 1;
      continue;
    }
    stats.failed_writes += 1;
    if (result.error) stats.errors.push(result.error);

    if ((index + 1) % 250 === 0) {
      console.log(
        JSON.stringify({
          import_progress: {
            processed: index + 1,
            pending: pending.length,
            inserted: stats.inserted,
            duplicates: stats.existing_catalog_duplicates_skipped,
            failed: stats.failed_writes,
          },
        })
      );
    }
  }

  return stats;
}

async function recordImportRun(supabase: SupabaseClient, report: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("radio_import_runs").upsert(
    {
      run_id: `${BATCH_NAME}-${report.mode}`,
      source_name: "radio_browser",
      started_at: now,
      completed_at: now,
      status: report.mode === "execute" ? "completed_metadata_import" : "completed_dry_run",
      records_received: Number(report.records_received || 0),
      records_normalized: Number(report.records_normalized || 0),
      records_inserted: Number(report.inserted || 0),
      records_updated: 0,
      records_unchanged: Number(report.existing_catalog_duplicates_skipped || 0),
      duplicate_source_count: Number(report.duplicate_source_ids || 0),
      duplicate_canonical_count: Number(report.existing_catalog_duplicates_skipped || 0),
      conflict_count: 0,
      invalid_count: Number(report.invalid_records || 0),
      error_count: Number(report.failed_writes || 0),
      updated_at: now,
    },
    { onConflict: "run_id" }
  );
  if (error) throw error;
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

  const started = performance.now();
  const productionPublicBefore = await fetchProductionPublicCount().catch(() => null);
  const beforeCounts = await getRadioCatalogCounts(supabase);
  const checkpoint = loadBatch3Checkpoint();
  checkpoint.last_public_count = productionPublicBefore ?? beforeCounts.public_general;
  checkpoint.remaining_gap = remainingPublicPlayableGap(checkpoint.last_public_count);

  let discoveryStats = {
    records_received: 0,
    records_normalized: 0,
    duplicate_source_ids: 0,
    duplicate_normalized_stream_urls: 0,
    duplicate_fingerprints: 0,
    mature_candidates_excluded: 0,
    invalid_records: 0,
    source_pages_attempted: 0,
    source_pages_successful: 0,
    source_pages_failed: 0,
    source_pages_exhausted: 0,
    newly_discovered_candidates: 0,
    retries_performed: 0,
  };

  if (!options.importOnly) {
    discoveryStats = await discoverCandidates(supabase, checkpoint, options);
  }

  const candidates = checkpoint.candidates.slice(0, options.target);
  const importStats = options.discoverOnly
    ? {
        existing_catalog_duplicates_skipped: 0,
        would_insert: 0,
        inserted: 0,
        failed_writes: 0,
        existing_rows_updated: 0,
        existing_rows_deleted: 0,
        inserted_station_ids: [],
        duplicate_reasons: {},
        errors: [],
      }
    : await importCandidates(supabase, candidates, options.mode);

  const afterCounts = await getRadioCatalogCounts(supabase);
  const productionPublicAfter = await fetchProductionPublicCount().catch(() => null);
  const runtimeSeconds = Math.round((performance.now() - started) / 1000);

  const report = {
    batch: BATCH_NAME,
    mode: options.mode,
    checkpoint_path: checkpointPath,
    target_public_playable: RADIO_PUBLIC_PLAYABLE_TARGET,
    requested_candidate_target: options.target,
    unique_candidates_collected: checkpoint.candidates.length,
    approved_candidate_snapshot_size: candidates.length,
    completed_candidate_floor: checkpoint.candidates.length >= options.target,
    ...discoveryStats,
    ...importStats,
    category_distribution: distribution(candidates, (c) => c.category_slug),
    country_distribution: distribution(candidates, (c) => c.country_code || c.country),
    language_distribution: distribution(candidates, (c) => c.language),
    query_distribution: distribution(candidates, (c) => c.discovered_query_key),
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
    existing_rows_updated: importStats.existing_rows_updated,
    existing_rows_deleted: importStats.existing_rows_deleted,
    existing_station_ids_changed: 0,
    existing_stream_urls_changed: 0,
    public_api_files_changed: 0,
    frontend_files_changed: 0,
    playback_files_changed: 0,
    runtime_seconds: runtimeSeconds,
    resume_command: `npx tsx scripts/run-radio-general-batch3-resume-import.ts${options.mode === "dry-run" ? "" : " --execute"}`,
    verify_command: `npx tsx scripts/run-radio-expansion-verify-unchecked.ts${options.mode === "dry-run" ? "" : " --execute"}`,
    failed_pages: checkpoint.failed_pages.slice(-50),
    exhausted_queries_count: checkpoint.exhausted_queries.length,
  };

  ensureDir(resultPath);
  if (options.mode === "execute" && !options.discoverOnly) {
    await recordImportRun(supabase, report);
  }
  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
