import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

import { loadAdminEnv } from "@/lib/radioExpansion25k/env";
import {
  bulkFindExistingSourceKeys,
  chunk,
  insertNewRadioStationOnly,
} from "@/lib/radioExpansion25k/insertOnlyImport";
import {
  fetchProductionPublicCount,
  getRadioCatalogCounts,
  remainingPublicPlayableGap,
} from "@/lib/radioExpansion25k/publicCounts";
import {
  RADIO_EXPANSION_BATCH3_NAME,
  radioExpansionBatchPaths,
} from "@/lib/radioExpansion25k/constants";

const BATCH3_NAME = RADIO_EXPANSION_BATCH3_NAME;
const adminRoot = path.resolve(__dirname, "..");
const batchPaths = radioExpansionBatchPaths(adminRoot, BATCH3_NAME);
const candidatePath = batchPaths.candidates;
const resultPath = batchPaths.resumeResult;

function readArgs() {
  return {
    mode: process.argv.includes("--execute") ? ("execute" as const) : ("dry-run" as const),
  };
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

  const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8")) as {
    candidates?: Array<Record<string, unknown>>;
  };
  const candidates = parsed.candidates || [];
  const sourceKeys = candidates.map(
    (candidate) => `${candidate.source_name}:${candidate.source_station_id}`
  );
  const mapped = await bulkFindExistingSourceKeys(supabase, sourceKeys);
  const remaining = candidates.filter(
    (candidate) => !mapped.has(`${candidate.source_name}:${candidate.source_station_id}`)
  );

  const beforeCounts = await getRadioCatalogCounts(supabase);
  const productionPublicBefore = await fetchProductionPublicCount().catch(() => null);
  const started = performance.now();
  const stats = {
    mode: options.mode === "execute" ? "execute-resume" : "dry-run-resume",
    batch_candidate_count: candidates.length,
    already_mapped_before_resume: mapped.size,
    remaining_candidates: remaining.length,
    inserted: 0,
    duplicates_skipped: 0,
    failed_writes: 0,
    existing_rows_updated: 0,
    existing_rows_deleted: 0,
    inserted_station_ids: [] as string[],
    errors: [] as string[],
  };

  for (const candidateChunk of chunk(remaining, 25)) {
    for (const candidate of candidateChunk) {
      const result = await insertNewRadioStationOnly(supabase, candidate as never, {
        dryRun: options.mode === "dry-run",
      });
      if (result.outcome === "inserted") {
        stats.inserted += 1;
        if (result.stationId) stats.inserted_station_ids.push(result.stationId);
      } else if (result.outcome === "duplicate") {
        stats.duplicates_skipped += 1;
      } else if (result.outcome === "dry_run_would_insert") {
        stats.inserted += 1;
      } else {
        stats.failed_writes += 1;
        if (result.error) stats.errors.push(result.error);
      }
    }
  }

  const afterCounts = await getRadioCatalogCounts(supabase);
  const productionPublicAfter = await fetchProductionPublicCount().catch(() => null);
  const now = new Date().toISOString();

  if (options.mode === "execute") {
    await supabase.from("radio_import_runs").upsert(
      {
        run_id: `${BATCH3_NAME}-execute-resume`,
        source_name: "radio_browser",
        started_at: now,
        completed_at: now,
        status: "completed_metadata_import_resume",
        records_received: candidates.length,
        records_normalized: candidates.length,
        records_inserted: stats.inserted,
        records_updated: 0,
        records_unchanged: stats.duplicates_skipped,
        duplicate_source_count: mapped.size,
        duplicate_canonical_count: stats.duplicates_skipped,
        conflict_count: 0,
        invalid_count: 0,
        error_count: stats.failed_writes,
        updated_at: now,
      },
      { onConflict: "run_id" }
    );
  }

  const report = {
    batch: BATCH3_NAME,
    ...stats,
    before_counts: beforeCounts,
    after_counts: afterCounts,
    production_public_before: productionPublicBefore,
    production_public_after: productionPublicAfter,
    remaining_gap_after: remainingPublicPlayableGap(
      productionPublicAfter ?? afterCounts.public_general
    ),
    runtime_seconds: Math.round((performance.now() - started) / 1000),
    verify_command: `npx tsx scripts/run-radio-general-batch3-verification.ts${options.mode === "dry-run" ? "" : " --execute"}`,
  };

  fs.writeFileSync(resultPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
