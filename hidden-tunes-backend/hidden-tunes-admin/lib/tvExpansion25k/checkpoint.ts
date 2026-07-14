import fs from "node:fs";
import path from "node:path";

import {
  TV_EXPANSION_CHECKPOINT_DIR,
  TV_EXPANSION_STATE_FILE,
} from "@/lib/tvExpansion25k/constants";

export type TvExpansion25kSourceState = {
  iptvOrgOffset: number;
  iptvOrgExhausted: boolean;
  curatedSeedsAttempted: boolean;
  youtubeStarterAttempted: boolean;
  lastErrors: Record<string, string>;
};

export type TvExpansion25kBatchReport = {
  batchNumber: number;
  batchSize: number;
  at: string;
  discovered: number;
  preDedupeRemoved: number;
  importFound: number;
  importUnique: number;
  importImported: number;
  importRejected: number;
  healthChecked: number;
  healthPlayable: number;
  healthFailed: number;
  platformEligibleBefore: number;
  platformEligibleAfter: number;
  sources: Record<string, { discovered: number; error?: string }>;
};

export type TvExpansion25kCheckpoint = {
  version: 1;
  target: number;
  batchNumber: number;
  consecutiveZeroImportBatches: number;
  totalImported: number;
  startedAt: string;
  updatedAt: string;
  sources: TvExpansion25kSourceState;
  lastBatch: TvExpansion25kBatchReport | null;
};

function statePath(adminRoot = process.cwd()) {
  return path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, TV_EXPANSION_STATE_FILE);
}

export function loadTvExpansion25kCheckpoint(adminRoot = process.cwd()): TvExpansion25kCheckpoint {
  const filePath = statePath(adminRoot);
  if (!fs.existsSync(filePath)) {
    const now = new Date().toISOString();
    return {
      version: 1,
      target: 25_000,
      batchNumber: 0,
      consecutiveZeroImportBatches: 0,
      totalImported: 0,
      startedAt: now,
      updatedAt: now,
      sources: {
        iptvOrgOffset: 0,
        iptvOrgExhausted: false,
        curatedSeedsAttempted: false,
        youtubeStarterAttempted: false,
        lastErrors: {},
      },
      lastBatch: null,
    };
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as TvExpansion25kCheckpoint;
}

export function saveTvExpansion25kCheckpoint(
  checkpoint: TvExpansion25kCheckpoint,
  adminRoot = process.cwd()
) {
  const filePath = statePath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  fs.writeFileSync(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

export function appendTvExpansion25kBatchLog(
  report: TvExpansion25kBatchReport,
  adminRoot = process.cwd()
) {
  const logPath = path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, "batch-log.jsonl");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(report)}\n`, "utf8");
}
