import fs from "node:fs";
import path from "node:path";

import type { AudiobookExpansionBatchReport } from "@/lib/audiobookExpansionRunner";
import type { AudiobookStatusSummary } from "@/lib/audiobookHealth";

export type AudiobookImportWaveReport = {
  generated_at: string;
  lane: "general" | "mature";
  providers_processed: string[];
  audiobooks_discovered: number;
  audiobooks_validated: number;
  chapters_imported: number;
  duplicates_merged: number;
  rejected_records: number;
  countries_represented: number;
  languages_represented: number;
  category_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  total_public_audiobook_count: number;
  total_mature_audiobook_count: number;
  batches: AudiobookExpansionBatchReport[];
};

const REPORT_DIR = path.join(process.cwd(), "data", "audiobook-import-reports");

export async function writeAudiobookImportWaveReport(input: {
  lane: "general" | "mature";
  providersProcessed: string[];
  batchReports: AudiobookExpansionBatchReport[];
  status: AudiobookStatusSummary;
}) {
  const report: AudiobookImportWaveReport = {
    generated_at: new Date().toISOString(),
    lane: input.lane,
    providers_processed: input.providersProcessed.filter(Boolean),
    audiobooks_discovered: input.batchReports.reduce(
      (sum, report) => sum + report.records_examined,
      0
    ),
    audiobooks_validated: input.batchReports.reduce(
      (sum, report) => sum + report.records_accepted,
      0
    ),
    chapters_imported: input.batchReports.reduce(
      (sum, report) => sum + report.chapters_inserted,
      0
    ),
    duplicates_merged: input.batchReports.reduce(
      (sum, report) => sum + report.duplicates_merged,
      0
    ),
    rejected_records: input.batchReports.reduce(
      (sum, report) => sum + report.records_rejected,
      0
    ),
    countries_represented: input.status.countries,
    languages_represented: input.status.languages,
    category_distribution: input.status.categoryDistribution,
    language_distribution: input.status.languageDistribution,
    total_public_audiobook_count: input.status.publicPlayableEditions,
    total_mature_audiobook_count: input.status.maturePlayableEditions,
    batches: input.batchReports,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = report.generated_at.replace(/[:.]/g, "-");
  const filePath = path.join(
    REPORT_DIR,
    `${input.lane}-wave-${stamp}.json`
  );
  const latestPath = path.join(REPORT_DIR, `${input.lane}-latest.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2));
  return { report, filePath, latestPath };
}
