import fs from "node:fs";
import path from "node:path";

import { importInternetArchiveAudiobookCandidate } from "@/lib/audiobookBatchImport";
import {
  AUDIOBOOK_EXPANSION_DEFAULT_BATCH_SIZE,
  AUDIOBOOK_EXPANSION_TARGET,
} from "@/lib/audiobookExpansionConstants";
import {
  createAudiobookExpansionCheckpoint,
  loadAudiobookExpansionCheckpoint,
  writeAudiobookExpansionCheckpoint,
} from "@/lib/audiobookExpansionCheckpoint";
import { getAudiobookStatusSummary } from "@/lib/audiobookHealth";
import {
  ingestAudiobookSeedCatalog,
  type AudiobookSeedCategorySlug,
  AUDIOBOOK_SEED_CATEGORIES,
} from "@/lib/audiobookSeedIngest";
import {
  discoverInternetArchiveAudiobooks,
  fetchInternetArchiveAudiobookCandidate,
  type InternetArchiveAudiobookQueryFamily,
} from "@/lib/audiobookSources/internetArchiveAudiobookSource";
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
};

export type AudiobookExpansionBatchReport = {
  generated_at: string;
  batch_number: number;
  source_key: string;
  dry_run: boolean;
  target: number;
  public_playable_total: number;
  gap_to_target: number;
  records_examined: number;
  records_accepted: number;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  records_rejected: number;
  chapters_inserted: number;
  checkpoint_cursor: string | null;
  status: "completed" | "failed";
  error?: string;
};

const DEFAULT_REPORT_PATH = path.join(
  process.cwd(),
  "data",
  "audiobook-expansion-report.json"
);

function parseArchiveFamily(sourceKey: string): InternetArchiveAudiobookQueryFamily | null {
  if (sourceKey === "internet_archive:librivoxaudio") return "librivoxaudio";
  if (sourceKey === "internet_archive:opensource_audio") return "opensource_audio";
  if (sourceKey === "internet_archive:audio_bookspoetry") return "audio_bookspoetry";
  return null;
}

async function runLibrivoxBatch(
  checkpoint: ReturnType<typeof createAudiobookExpansionCheckpoint>,
  options: AudiobookExpansionRunOptions
) {
  const batchSize = Math.max(50, Math.min(1000, Number(options.batchSize || 500)));
  const categoryIndex = Math.max(0, (checkpoint.source_page || 1) - 1) % AUDIOBOOK_SEED_CATEGORIES.length;
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
  checkpoint.source_page = result.books_attempted < batchSize ? categoryIndex + 2 : categoryIndex + 1;
  checkpoint.last_external_id = category;

  return {
    success: result.success,
    exhausted: result.books_attempted === 0,
  };
}

async function runInternetArchiveBatch(
  sourceKey: string,
  checkpoint: ReturnType<typeof createAudiobookExpansionCheckpoint>,
  options: AudiobookExpansionRunOptions
) {
  const queryFamily = parseArchiveFamily(sourceKey);
  if (!queryFamily) {
    return { success: false, exhausted: true };
  }

  const batchSize = Math.max(25, Math.min(250, Number(options.batchSize || 100)));
  const page = Math.max(1, checkpoint.source_page || 1);
  const discovery = await discoverInternetArchiveAudiobooks({
    queryFamily,
    page,
    limit: batchSize,
  });

  let inserted = 0;
  let updated = 0;
  let rejected = 0;
  let skipped = 0;
  let chaptersInserted = 0;

  for (const identifier of discovery.identifiers) {
    checkpoint.records_examined += 1;
    const candidate = await fetchInternetArchiveAudiobookCandidate({
      identifier,
      queryFamily,
    });

    if (!candidate) {
      rejected += 1;
      continue;
    }

    if (options.completeOnly && !candidate.isComplete) {
      skipped += 1;
      continue;
    }

    if (options.language && candidate.language?.toLowerCase() !== options.language.toLowerCase()) {
      skipped += 1;
      continue;
    }

    const result = await importInternetArchiveAudiobookCandidate(candidate, {
      dryRun: options.dryRun === true,
      verifyPlayback: options.verifySample !== false,
    });

    if (!result.accepted) {
      rejected += 1;
      continue;
    }

    checkpoint.records_accepted += 1;
    if (result.inserted) inserted += 1;
    if (result.updated) updated += 1;
    if (result.skipped) skipped += 1;
    chaptersInserted += result.chaptersInserted || 0;
    checkpoint.completed_item_keys.push(identifier);
    checkpoint.last_external_id = identifier;
  }

  checkpoint.records_inserted += inserted;
  checkpoint.records_updated += updated;
  checkpoint.records_skipped += skipped;
  checkpoint.records_rejected += rejected;
  checkpoint.chapters_inserted += chaptersInserted;
  checkpoint.source_page = discovery.nextPage;
  checkpoint.source_cursor = String(discovery.nextPage);

  return {
    success: true,
    exhausted: !discovery.hasMore && discovery.identifiers.length === 0,
  };
}

export async function runAudiobookExpansionBatch(
  options: AudiobookExpansionRunOptions = {}
): Promise<AudiobookExpansionBatchReport> {
  const target = Math.max(1, Number(options.target || AUDIOBOOK_EXPANSION_TARGET));
  const batchNumber = Math.max(0, Number(options.batchNumber || 0));
  const statusBefore = await getAudiobookStatusSummary();

  if (statusBefore.publicPlayableEditions >= target) {
    return {
      generated_at: new Date().toISOString(),
      batch_number: batchNumber,
      source_key: "none",
      dry_run: options.dryRun === true,
      target,
      public_playable_total: statusBefore.publicPlayableEditions,
      gap_to_target: 0,
      records_examined: 0,
      records_accepted: 0,
      records_inserted: 0,
      records_updated: 0,
      records_skipped: 0,
      records_rejected: 0,
      chapters_inserted: 0,
      checkpoint_cursor: null,
      status: "completed",
    };
  }

  const sources = await listEnabledAudiobookSources();
  const selected =
    (options.source
      ? sources.find((entry) => entry.source_key === options.source)
      : null) || pickNextAudiobookSource(sources, batchNumber);

  if (!selected) {
    throw new Error("No enabled audiobook sources available.");
  }

  const sourceKey = selected.source_key;
  let checkpoint =
    (options.resume !== false
      ? loadAudiobookExpansionCheckpoint(batchNumber, sourceKey)?.checkpoint
      : null) ||
    createAudiobookExpansionCheckpoint({
      batch_number: batchNumber,
      source_key: sourceKey,
    });

  checkpoint.status = "running";
  checkpoint.updated_at = new Date().toISOString();
  writeAudiobookExpansionCheckpoint(checkpoint);

  let success = true;
  let exhausted = false;
  let errorMessage: string | undefined;

  try {
    if (sourceKey === "librivox") {
      const result = await runLibrivoxBatch(checkpoint, options);
      success = result.success;
      exhausted = result.exhausted;
    } else {
      const result = await runInternetArchiveBatch(sourceKey, checkpoint, options);
      success = result.success;
      exhausted = result.exhausted;
    }
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : "audiobook_expansion_failed";
  }

  checkpoint.status = success ? "completed" : "failed";
  checkpoint.completed_at = new Date().toISOString();
  checkpoint.updated_at = checkpoint.completed_at;
  writeAudiobookExpansionCheckpoint(checkpoint);

  if (!options.dryRun) {
    await updateAudiobookSourceRegistry(sourceKey, {
      checkpoint_cursor: checkpoint.source_cursor,
      ...(success
        ? {
            last_successful_import: checkpoint.completed_at,
            accepted_editions:
              selected.accepted_editions + checkpoint.records_inserted,
          }
        : {
            last_failed_import: checkpoint.completed_at,
            failure_count: selected.failure_count + 1,
          }),
      ...(exhausted ? { is_exhausted: true } : {}),
    });
  }

  const statusAfter = await getAudiobookStatusSummary();
  const report: AudiobookExpansionBatchReport = {
    generated_at: new Date().toISOString(),
    batch_number: batchNumber,
    source_key: sourceKey,
    dry_run: options.dryRun === true,
    target,
    public_playable_total: statusAfter.publicPlayableEditions,
    gap_to_target: Math.max(0, target - statusAfter.publicPlayableEditions),
    records_examined: checkpoint.records_examined,
    records_accepted: checkpoint.records_accepted,
    records_inserted: checkpoint.records_inserted,
    records_updated: checkpoint.records_updated,
    records_skipped: checkpoint.records_skipped,
    records_rejected: checkpoint.records_rejected,
    chapters_inserted: checkpoint.chapters_inserted,
    checkpoint_cursor: checkpoint.source_cursor,
    status: success ? "completed" : "failed",
    error: errorMessage,
  };

  const reportPath = options.reportPath || DEFAULT_REPORT_PATH;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}

export async function runAudiobookExpansionLoop(options: AudiobookExpansionRunOptions = {}) {
  const target = Math.max(1, Number(options.target || AUDIOBOOK_EXPANSION_TARGET));
  const maxBatches = Math.max(1, Number(options.maxBatches || 50));
  const reports: AudiobookExpansionBatchReport[] = [];

  for (let index = 0; index < maxBatches; index += 1) {
    const status = await getAudiobookStatusSummary();
    if (status.publicPlayableEditions >= target) break;

    const report = await runAudiobookExpansionBatch({
      ...options,
      batchNumber: index,
      resume: true,
    });
    reports.push(report);
    if (report.status === "failed") break;
    if (report.gap_to_target <= 0) break;
  }

  return reports;
}
