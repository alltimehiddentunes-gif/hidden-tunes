import fs from "node:fs";
import path from "node:path";

import { runMotivationBatchImport } from "@/lib/motivationBatchImport";
import {
  createMotivationExpansionCheckpoint,
  loadMotivationExpansionCheckpoint,
  writeMotivationExpansionCheckpoint,
} from "@/lib/motivationExpansionCheckpoint";
import { MOTIVATION_TARGET_ITEMS } from "@/lib/motivationCatalog";
import { getMotivationStatusSummary } from "@/lib/motivationHealth";
import { ARCHIVE_MOTIVATION_QUERY_FAMILIES } from "@/lib/motivationSources/archiveSource";

export type MotivationExpansionRunOptions = {
  batchNumber?: number;
  examineLimit?: number;
  dryRun?: boolean;
  queryFamily?: string;
  milestoneTarget?: number;
  reportPath?: string;
};

export type MotivationExpansionReport = {
  generated_at: string;
  batch_number: number;
  dry_run: boolean;
  query_family: string;
  milestone_target: number;
  public_healthy_total: number;
  database_total: number;
  pending_total: number;
  gap_to_target: number;
  import_result: Awaited<ReturnType<typeof runMotivationBatchImport>>;
  checkpoint_source_key: string;
};

const DEFAULT_REPORT_PATH = path.join(
  process.cwd(),
  "data",
  "motivation-expansion-report.json"
);

export async function runMotivationExpansionBatch(
  options: MotivationExpansionRunOptions = {}
): Promise<MotivationExpansionReport> {
  const batchNumber = Math.max(0, Number(options.batchNumber ?? 0));
  const examineLimit = Math.max(1, Math.min(250, Number(options.examineLimit ?? 100)));
  const dryRun = options.dryRun === true;
  const queryFamily =
    options.queryFamily ||
    Object.keys(ARCHIVE_MOTIVATION_QUERY_FAMILIES)[batchNumber % Object.keys(ARCHIVE_MOTIVATION_QUERY_FAMILIES).length];
  const milestoneTarget = Math.max(100, Number(options.milestoneTarget ?? MOTIVATION_TARGET_ITEMS));
  const checkpointSourceKey = `archive:expansion:${queryFamily}`;

  let checkpoint =
    loadMotivationExpansionCheckpoint(batchNumber, checkpointSourceKey)?.checkpoint ||
    createMotivationExpansionCheckpoint({
      batch_number: batchNumber,
      source_key: checkpointSourceKey,
    });

  checkpoint.status = "running";
  checkpoint.updated_at = new Date().toISOString();
  writeMotivationExpansionCheckpoint(checkpoint);

  const importResult = await runMotivationBatchImport({
    batchNumber,
    examineLimit,
    dryRun,
    queryFamily,
  });

  const status = await getMotivationStatusSummary();

  checkpoint.status = importResult.success ? "completed" : "failed";
  checkpoint.records_examined = importResult.records_examined;
  checkpoint.records_accepted = importResult.records_accepted;
  checkpoint.records_inserted = importResult.records_inserted;
  checkpoint.records_rejected = importResult.records_rejected;
  checkpoint.completed_at = new Date().toISOString();
  checkpoint.updated_at = checkpoint.completed_at;
  writeMotivationExpansionCheckpoint(checkpoint);

  const report: MotivationExpansionReport = {
    generated_at: new Date().toISOString(),
    batch_number: batchNumber,
    dry_run: dryRun,
    query_family: queryFamily,
    milestone_target: milestoneTarget,
    public_healthy_total: status.publicVerified,
    database_total: status.total,
    pending_total: status.pending,
    gap_to_target: Math.max(0, milestoneTarget - status.publicVerified),
    import_result: importResult,
    checkpoint_source_key: checkpointSourceKey,
  };

  const reportPath = options.reportPath || DEFAULT_REPORT_PATH;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return report;
}
