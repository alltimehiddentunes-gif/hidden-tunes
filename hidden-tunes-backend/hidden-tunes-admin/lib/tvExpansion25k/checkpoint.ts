import fs from "node:fs";
import path from "node:path";

import {
  TV_EXPANSION_CHECKPOINT_DIR,
  TV_EXPANSION_STATE_FILE,
} from "@/lib/tvExpansion25k/constants";
import { initialAdapterCursors } from "@/lib/tvExpansion25k/sources/registry";
import type { TvExpansionSourceCursor } from "@/lib/tvExpansion25k/sources/types";

export type TvExpansion25kSourceState = {
  adapterCursors: Record<string, TvExpansionSourceCursor>;
  legacy?: {
    iptvOrgOffset?: number;
    iptvOrgExhausted?: boolean;
    curatedSeedsAttempted?: boolean;
    youtubeStarterAttempted?: boolean;
  };
};

export type TvExpansion25kSourceReport = {
  discovered: number;
  preRejected?: number;
  fingerprintSkipped?: number;
  unsupported?: number;
  error?: string;
  cursor?: string;
  page?: number;
  exhausted?: boolean;
};

export type TvExpansion25kBatchReport = {
  batchNumber: number;
  batchSize: number;
  at: string;
  durationMs: number;
  discovered: number;
  preDedupeRemoved: number;
  preProbeRejected: number;
  fingerprintSkipped: number;
  importFound: number;
  importUnique: number;
  importImported: number;
  importRejected: number;
  healthChecked: number;
  healthPlayable: number;
  healthFailed: number;
  platformEligibleBefore: number;
  platformEligibleAfter: number;
  sources: Record<string, TvExpansion25kSourceReport>;
  providerErrors: string[];
  cumulativeImported: number;
};

export type TvExpansion25kCheckpoint = {
  version: 2;
  target: number;
  batchNumber: number;
  consecutiveZeroImportBatches: number;
  totalImported: number;
  startedAt: string;
  updatedAt: string;
  sources: TvExpansion25kSourceState;
  lastBatch: TvExpansion25kBatchReport | null;
};

type LegacyCheckpointV1 = {
  version?: 1;
  target: number;
  batchNumber: number;
  consecutiveZeroImportBatches: number;
  totalImported: number;
  startedAt: string;
  updatedAt: string;
  sources: {
    iptvOrgOffset: number;
    iptvOrgExhausted: boolean;
    curatedSeedsAttempted: boolean;
    youtubeStarterAttempted: boolean;
    lastErrors: Record<string, string>;
  };
  lastBatch: TvExpansion25kBatchReport | null;
};

function statePath(adminRoot = process.cwd()) {
  return path.join(adminRoot, TV_EXPANSION_CHECKPOINT_DIR, TV_EXPANSION_STATE_FILE);
}

function migrateLegacyCheckpoint(legacy: LegacyCheckpointV1): TvExpansion25kCheckpoint {
  const adapterCursors = initialAdapterCursors();

  adapterCursors["iptv-org"] = {
    ...adapterCursors["iptv-org"],
    cursor: String(legacy.sources.iptvOrgOffset || 0),
    exhausted: legacy.sources.iptvOrgExhausted === true,
    processed: legacy.sources.iptvOrgOffset || 0,
    lastError: legacy.sources.lastErrors?.["iptv-org"] || null,
  };

  adapterCursors["curated-seeds"] = {
    ...adapterCursors["curated-seeds"],
    exhausted: legacy.sources.curatedSeedsAttempted === true,
    cursor: legacy.sources.curatedSeedsAttempted ? "done" : "0",
    lastError: legacy.sources.lastErrors?.["curated-seeds"] || null,
  };

  adapterCursors["youtube-starter"] = {
    ...adapterCursors["youtube-starter"],
    exhausted: legacy.sources.youtubeStarterAttempted === true,
    cursor: legacy.sources.youtubeStarterAttempted ? "done" : "0",
    lastError: legacy.sources.lastErrors?.["youtube-starter"] || null,
  };

  return {
    version: 2,
    target: legacy.target,
    batchNumber: legacy.batchNumber,
    consecutiveZeroImportBatches: legacy.consecutiveZeroImportBatches,
    totalImported: legacy.totalImported,
    startedAt: legacy.startedAt,
    updatedAt: legacy.updatedAt,
    sources: {
      adapterCursors,
      legacy: {
        iptvOrgOffset: legacy.sources.iptvOrgOffset,
        iptvOrgExhausted: legacy.sources.iptvOrgExhausted,
        curatedSeedsAttempted: legacy.sources.curatedSeedsAttempted,
        youtubeStarterAttempted: legacy.sources.youtubeStarterAttempted,
      },
    },
    lastBatch: legacy.lastBatch,
  };
}

export function loadTvExpansion25kCheckpoint(adminRoot = process.cwd()): TvExpansion25kCheckpoint {
  const filePath = statePath(adminRoot);
  if (!fs.existsSync(filePath)) {
    const now = new Date().toISOString();
    return {
      version: 2,
      target: 25_000,
      batchNumber: 0,
      consecutiveZeroImportBatches: 0,
      totalImported: 0,
      startedAt: now,
      updatedAt: now,
      sources: {
        adapterCursors: initialAdapterCursors(),
      },
      lastBatch: null,
    };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as
    | TvExpansion25kCheckpoint
    | LegacyCheckpointV1;

  if (parsed.version === 2) {
    const checkpoint = parsed as TvExpansion25kCheckpoint;
    const defaults = initialAdapterCursors();
    checkpoint.sources.adapterCursors = {
      ...defaults,
      ...checkpoint.sources.adapterCursors,
    };
    return checkpoint;
  }

  return migrateLegacyCheckpoint(parsed as LegacyCheckpointV1);
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
