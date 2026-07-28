import fs from "node:fs";
import path from "node:path";

import { importNormalizedAudiobookCandidate } from "@/lib/audiobookBatchImport";
import {
  AUDIOBOOK_EXPANSION_DEFAULT_BATCH_SIZE,
  AUDIOBOOK_GENERAL_MILESTONE_TARGET,
  AUDIOBOOK_IA_BATCH_SIZE_DEFAULT,
  AUDIOBOOK_IA_BATCH_SIZE_MAX,
} from "@/lib/audiobookExpansionConstants";
import {
  createAudiobookExpansionCheckpoint,
  loadAudiobookExpansionCheckpoint,
  writeAudiobookExpansionCheckpoint,
} from "@/lib/audiobookExpansionCheckpoint";
import { getAudiobookStatusSummary } from "@/lib/audiobookHealth";
import { writeAudiobookImportWaveReport } from "@/lib/audiobookImportReport";
import {
  ingestAudiobookSeedCatalog,
  type AudiobookSeedCategorySlug,
  AUDIOBOOK_SEED_CATEGORIES,
} from "@/lib/audiobookSeedIngest";
import { getAudiobookSourceAdapter } from "@/lib/audiobookSources/adapterRegistry";
import {
  listEnabledAudiobookSources,
  pickNextAudiobookSource,
  updateAudiobookSourceRegistry,
} from "@/lib/audiobookSourceRegistry";

export type AudiobookExpansionRunOptions = {
  target?: number;
  batchSize?: number;
  maxBatches?: number;
  source?: string;
  language?: string;
  category?: string;
  completeOnly?: boolean;
  resume?: boolean;
  dryRun?: boolean;
  repair?: boolean;
  verifySample?: boolean;
  batchNumber?: number;
  reportPath?: string;
  lane?: "general" | "mature";
};

export type AudiobookExpansionBatchReport = {
  generated_at: string;
  batch_number: number;
  source_key: string;
  lane: "general" | "mature";
  dry_run: boolean;
  target: number;
  public_playable_total: number;
  mature_playable_total: number;
  gap_to_target: number;
  records_examined: number;
  records_accepted: number;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  records_rejected: number;
  chapters_inserted: number;
  duplicates_merged: number;
  checkpoint_cursor: string | null;
  status: "completed" | "failed";
  error?: string;
};

const DEFAULT_REPORT_PATH = path.join(
  process.cwd(),
  "data",
  "audiobook-expansion-report.json"
);

async function runLibrivoxBatch(
  checkpoint: ReturnType<typeof createAudiobookExpansionCheckpoint>,
  options: AudiobookExpansionRunOptions
) {
  const batchSize = Math.max(
    50,
    Math.min(1000, Number(options.batchSize || AUDIOBOOK_EXPANSION_DEFAULT_BATCH_SIZE))
  );
  const categoryIndex =
    Math.max(0, (checkpoint.source_page || 1) - 1) % AUDIOBOOK_SEED_CATEGORIES.length;
  const category = AUDIOBOOK_SEED_CATEGORIES[categoryIndex] as AudiobookSeedCategorySlug;
  const offset = Number(checkpoint.source_cursor || 0);

  const result = await ingestAudiobookSeedCatalog({
    categories: [category],
    limit: batchSize,
    offset,
    batch_size: batchSize,
    dry_run: options.dryRun === true,
  });

  checkpoint.records_examined += result.books_attempted;
  checkpoint.records_accepted += result.books_imported;
  checkpoint.records_inserted += result.books_imported;
  checkpoint.records_skipped += result.books_skipped;
  checkpoint.records_rejected += result.books_failed;
  checkpoint.chapters_inserted += result.chapters_upserted;
  checkpoint.playable_chapters += result.files_upserted;
  checkpoint.source_cursor = String(offset + result.books_attempted);
  checkpoint.source_page =
    result.books_attempted < batchSize ? categoryIndex + 2 : categoryIndex + 1;
  checkpoint.last_external_id = category;

  return {
    success: result.success,
    exhausted: result.books_attempted === 0,
    duplicatesMerged: result.books_skipped,
  };
}

async function runAdapterBatch(
  sourceKey: string,
  checkpoint: ReturnType<typeof createAudiobookExpansionCheckpoint>,
  options: AudiobookExpansionRunOptions
) {
  const adapter = getAudiobookSourceAdapter(sourceKey);
  if (!adapter) {
    return { success: false, exhausted: true, duplicatesMerged: 0 };
  }

  const batchSize = Math.max(
    10,
    Math.min(
      AUDIOBOOK_IA_BATCH_SIZE_MAX,
      Number(options.batchSize || AUDIOBOOK_IA_BATCH_SIZE_DEFAULT)
    )
  );
  const page = Math.max(1, checkpoint.source_page || 1);
  const discovery = await adapter.discover({
    page,
    limit: batchSize,
    cursor: checkpoint.source_cursor,
  });

  let inserted = 0;
  let updated = 0;
  let rejected = 0;
  let skipped = 0;
  let chaptersInserted = 0;
  let duplicatesMerged = 0;

  for (const identifier of discovery.identifiers) {
    if (checkpoint.completed_item_keys.includes(identifier)) {
      skipped += 1;
      continue;
    }

    checkpoint.records_examined += 1;
    // Gentle pacing to avoid Archive.org / CDN stalls under concurrent probes.
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      const candidate = await adapter.fetchCandidate({ identifier });

      if (!candidate) {
        rejected += 1;
        checkpoint.records_rejected += 1;
        continue;
      }

      if (options.completeOnly && !candidate.isComplete) {
        skipped += 1;
        continue;
      }

      if (
        options.language &&
        candidate.language?.toLowerCase() !== options.language.toLowerCase()
      ) {
        skipped += 1;
        continue;
      }

      const result = await importNormalizedAudiobookCandidate(candidate, {
        dryRun: options.dryRun === true,
        verifyPlayback: options.verifySample !== false,
        forceMature: adapter.catalogLane === "mature",
      });

      if (!result.accepted) {
        if (result.skipped) {
          skipped += 1;
          duplicatesMerged += 1;
        } else {
          rejected += 1;
          checkpoint.records_rejected += 1;
        }
        continue;
      }

      checkpoint.records_accepted += 1;
      if (result.inserted) {
        inserted += 1;
        checkpoint.records_inserted += 1;
      }
      if (result.updated) {
        updated += 1;
        duplicatesMerged += 1;
        checkpoint.records_updated += 1;
      }
      if (result.skipped) skipped += 1;
      chaptersInserted += result.chaptersInserted || 0;
      checkpoint.chapters_inserted += result.chaptersInserted || 0;
      checkpoint.completed_item_keys.push(identifier);
      checkpoint.last_external_id = identifier;
      checkpoint.updated_at = new Date().toISOString();
      if (options.dryRun !== true && checkpoint.completed_item_keys.length % 3 === 0) {
        writeAudiobookExpansionCheckpoint(checkpoint);
      }
    } catch (error) {
      rejected += 1;
      checkpoint.records_rejected += 1;
      checkpoint.failed_item_keys.push(identifier);
      checkpoint.updated_at = new Date().toISOString();
      const message =
        error instanceof Error
          ? error.message
          : error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || error)
            : String(error);
      console.error(
        JSON.stringify({
          phase: "item_failed",
          source_key: sourceKey,
          identifier,
          error: message,
        })
      );
    }
  }

  checkpoint.records_skipped += skipped;
  checkpoint.source_page = discovery.nextPage;
  checkpoint.source_cursor = discovery.nextCursor || String(discovery.nextPage);

  return {
    success: true,
    exhausted: !discovery.hasMore && discovery.identifiers.length === 0,
    duplicatesMerged,
  };
}

export async function runAudiobookExpansionBatch(
  options: AudiobookExpansionRunOptions = {}
): Promise<AudiobookExpansionBatchReport> {
  const lane = options.lane || "general";
  const target = Math.max(
    1,
    Number(options.target || AUDIOBOOK_GENERAL_MILESTONE_TARGET)
  );
  const batchNumber = Math.max(0, Number(options.batchNumber || 0));
  const statusBefore = await getAudiobookStatusSummary();

  const currentTotal =
    lane === "mature"
      ? statusBefore.maturePlayableEditions
      : statusBefore.publicPlayableEditions;

  if (currentTotal >= target) {
    return {
      generated_at: new Date().toISOString(),
      batch_number: batchNumber,
      source_key: "none",
      lane,
      dry_run: options.dryRun === true,
      target,
      public_playable_total: statusBefore.publicPlayableEditions,
      mature_playable_total: statusBefore.maturePlayableEditions,
      gap_to_target: 0,
      records_examined: 0,
      records_accepted: 0,
      records_inserted: 0,
      records_updated: 0,
      records_skipped: 0,
      records_rejected: 0,
      chapters_inserted: 0,
      duplicates_merged: 0,
      checkpoint_cursor: null,
      status: "completed",
    };
  }

  const sources = await listEnabledAudiobookSources({ lane });
  const selected =
    (options.source
      ? sources.find((entry) => entry.source_key === options.source)
      : null) || pickNextAudiobookSource(sources, batchNumber);

  if (!selected) {
    throw new Error(`No enabled audiobook sources available for lane=${lane}.`);
  }

  const sourceKey = selected.source_key;
  let checkpoint =
    (options.resume !== false && options.dryRun !== true
      ? loadAudiobookExpansionCheckpoint(batchNumber, sourceKey)?.checkpoint
      : null) ||
    createAudiobookExpansionCheckpoint({
      batch_number: batchNumber,
      source_key: sourceKey,
    });

  // Resume past failed/completed batches by continuing pagination.
  if (checkpoint.status === "failed" || checkpoint.status === "completed") {
    checkpoint.status = "running";
    checkpoint.completed_at = null;
  }

  checkpoint.status = "running";
  checkpoint.updated_at = new Date().toISOString();
  if (options.dryRun !== true) {
    writeAudiobookExpansionCheckpoint(checkpoint);
  }

  let success = true;
  let exhausted = false;
  let duplicatesMerged = 0;
  let errorMessage: string | undefined;

  try {
    if (sourceKey === "librivox") {
      if (lane === "mature") {
        throw new Error("LibriVox is general-catalog only.");
      }
      const result = await runLibrivoxBatch(checkpoint, options);
      success = result.success;
      exhausted = result.exhausted;
      duplicatesMerged = result.duplicatesMerged;
    } else {
      const result = await runAdapterBatch(sourceKey, checkpoint, options);
      success = result.success;
      exhausted = result.exhausted;
      duplicatesMerged = result.duplicatesMerged;
    }
  } catch (error) {
    success = false;
    errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : JSON.stringify(error) || "audiobook_expansion_failed";
    console.error(
      JSON.stringify({
        phase: "batch_failed",
        source_key: sourceKey,
        error: errorMessage,
      })
    );
  }

  checkpoint.status = success ? "completed" : "failed";
  checkpoint.completed_at = new Date().toISOString();
  checkpoint.updated_at = checkpoint.completed_at;
  if (options.dryRun !== true) {
    writeAudiobookExpansionCheckpoint(checkpoint);
  }

  if (!options.dryRun) {
    await updateAudiobookSourceRegistry(sourceKey, {
      checkpoint_cursor: checkpoint.source_cursor,
      ...(success
        ? {
            last_successful_import: checkpoint.completed_at,
            accepted_editions:
              selected.accepted_editions + checkpoint.records_inserted,
            rejected_editions:
              selected.rejected_editions + checkpoint.records_rejected,
          }
        : {
            last_failed_import: checkpoint.completed_at,
            failure_count: selected.failure_count + 1,
          }),
      ...(exhausted ? { is_exhausted: true } : {}),
    });
  }

  const statusAfter = await getAudiobookStatusSummary();
  const playableAfter =
    lane === "mature"
      ? statusAfter.maturePlayableEditions
      : statusAfter.publicPlayableEditions;

  const report: AudiobookExpansionBatchReport = {
    generated_at: new Date().toISOString(),
    batch_number: batchNumber,
    source_key: sourceKey,
    lane,
    dry_run: options.dryRun === true,
    target,
    public_playable_total: statusAfter.publicPlayableEditions,
    mature_playable_total: statusAfter.maturePlayableEditions,
    gap_to_target: Math.max(0, target - playableAfter),
    records_examined: checkpoint.records_examined,
    records_accepted: checkpoint.records_accepted,
    records_inserted: checkpoint.records_inserted,
    records_updated: checkpoint.records_updated,
    records_skipped: checkpoint.records_skipped,
    records_rejected: checkpoint.records_rejected,
    chapters_inserted: checkpoint.chapters_inserted,
    duplicates_merged: duplicatesMerged,
    checkpoint_cursor: checkpoint.source_cursor,
    status: success ? "completed" : "failed",
    error: errorMessage,
  };

  const reportPath = options.reportPath || DEFAULT_REPORT_PATH;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  await writeAudiobookImportWaveReport({
    lane,
    providersProcessed: [sourceKey],
    batchReports: [report],
    status: statusAfter,
  });

  return report;
}

export async function runAudiobookExpansionLoop(
  options: AudiobookExpansionRunOptions = {}
) {
  const lane = options.lane || "general";
  const target = Math.max(
    1,
    Number(options.target || AUDIOBOOK_GENERAL_MILESTONE_TARGET)
  );
  const maxBatches = Math.max(1, Number(options.maxBatches || 50));
  const reports: AudiobookExpansionBatchReport[] = [];

  for (let index = 0; index < maxBatches; index += 1) {
    const status = await getAudiobookStatusSummary();
    const current =
      lane === "mature"
        ? status.maturePlayableEditions
        : status.publicPlayableEditions;
    if (current >= target) break;

    // Keep a stable checkpoint namespace per source so pagination resumes
    // across loop iterations instead of restarting every batch at page 1.
    const report = await runAudiobookExpansionBatch({
      ...options,
      lane,
      batchNumber: 0,
      resume: true,
      target,
    });
    reports.push(report);
    if (report.status === "failed") {
      const failCount = reports.filter((row) => row.status === "failed").length;
      if (failCount >= 3) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    if (report.gap_to_target <= 0) break;
    if (report.records_examined === 0 && report.records_accepted === 0) break;
  }

  const status = await getAudiobookStatusSummary();
  await writeAudiobookImportWaveReport({
    lane,
    providersProcessed: [...new Set(reports.map((report) => report.source_key))],
    batchReports: reports,
    status,
  });

  return reports;
}
