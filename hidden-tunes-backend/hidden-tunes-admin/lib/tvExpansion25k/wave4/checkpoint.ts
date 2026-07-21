import fs from "node:fs";
import path from "node:path";

import {
  TV_WAVE4_BATCH_LOG,
  TV_WAVE4_CHECKPOINT_DIR,
  TV_WAVE4_STATE_FILE,
} from "@/lib/tvExpansion25k/wave4/constants";
import { TV_EXPANSION_25K_TARGET } from "@/lib/tvExpansion25k/constants";
import {
  initialAdapterCursors,
  TV_EXPANSION_INDEPENDENT_SOURCE_ADAPTERS,
  TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS,
} from "@/lib/tvExpansion25k/sources/registry";
import type { TvExpansion25kBatchReport, TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import { createInitialSourceCursor } from "@/lib/tvExpansion25k/sources/types";

export type TvWave4Checkpoint = {
  version: 1;
  wave: 4;
  target: number;
  batchNumber: number;
  consecutiveEmptyBatches: number;
  totalImported: number;
  contentScope: "normal" | "mature";
  startedAt: string;
  updatedAt: string;
  sources: TvExpansion25kSourceState;
  lastBatch: TvExpansion25kBatchReport | null;
};

function statePath(adminRoot: string) {
  return path.join(adminRoot, TV_WAVE4_CHECKPOINT_DIR, TV_WAVE4_STATE_FILE);
}

function batchLogPath(adminRoot: string) {
  return path.join(adminRoot, TV_WAVE4_CHECKPOINT_DIR, TV_WAVE4_BATCH_LOG);
}

const WAVE4_PLUS_INDEPENDENT_SOURCE_IDS = [
  ...TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS,
  ...TV_EXPANSION_INDEPENDENT_SOURCE_ADAPTERS.map((adapter) => adapter.id),
] as const;

export function createInitialWave4Checkpoint(
  contentScope: "normal" | "mature" = "normal"
): TvWave4Checkpoint {
  const allCursors = initialAdapterCursors();
  const adapterCursors: TvWave4Checkpoint["sources"]["adapterCursors"] = {};

  for (const sourceId of WAVE4_PLUS_INDEPENDENT_SOURCE_IDS) {
    adapterCursors[sourceId] = allCursors[sourceId] || createInitialSourceCursor(sourceId);
  }

  return {
    version: 1,
    wave: 4,
    target: TV_EXPANSION_25K_TARGET,
    batchNumber: 0,
    consecutiveEmptyBatches: 0,
    totalImported: 0,
    contentScope,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sources: { adapterCursors },
    lastBatch: null,
  };
}

export function loadTvWave4Checkpoint(adminRoot = process.cwd()): TvWave4Checkpoint {
  const filePath = statePath(adminRoot);
  if (!fs.existsSync(filePath)) {
    return createInitialWave4Checkpoint();
  }
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as TvWave4Checkpoint;
  return {
    ...createInitialWave4Checkpoint(payload.contentScope || "normal"),
    ...payload,
    sources: {
      adapterCursors: {
        ...createInitialWave4Checkpoint(payload.contentScope || "normal").sources.adapterCursors,
        ...(payload.sources?.adapterCursors || {}),
      },
      legacy: payload.sources?.legacy,
    },
  };
}

export function saveTvWave4Checkpoint(checkpoint: TvWave4Checkpoint, adminRoot = process.cwd()) {
  const filePath = statePath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(
    tempPath,
    `${JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );
  fs.renameSync(tempPath, filePath);
}

export function appendTvWave4BatchLog(report: TvExpansion25kBatchReport, adminRoot = process.cwd()) {
  const filePath = batchLogPath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(report)}\n`, "utf8");
}
