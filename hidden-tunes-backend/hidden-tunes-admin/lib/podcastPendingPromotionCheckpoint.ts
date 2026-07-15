import fs from "node:fs";
import path from "node:path";

import type { PodcastCatalogKind } from "@/lib/podcastSourceRegistry";

export type PodcastPendingPromotionState = {
  version: 1;
  catalog: PodcastCatalogKind;
  batch_number: number;
  last_processed_id: string | null;
  last_processed_created_at: string | null;
  started_at: string;
  updated_at: string;
  examined: number;
  promoted: number;
  skipped: number;
  failed: number;
  shutdown_requested: boolean;
  status: "running" | "paused" | "completed" | "failed";
};

const DATA_DIR = "podcast-pending-promotion";
const STATE_FILE = "state.json";

function dataDir(adminRoot = process.cwd()) {
  return path.join(adminRoot, "data", DATA_DIR);
}

export function getPodcastPendingPromotionStatePath(adminRoot = process.cwd()) {
  return path.join(dataDir(adminRoot), STATE_FILE);
}

export function getPodcastPendingPromotionBatchLogPath(adminRoot = process.cwd()) {
  return path.join(dataDir(adminRoot), "batch-log.jsonl");
}

export function getPodcastPendingPromotionReportDir(adminRoot = process.cwd()) {
  return path.join(dataDir(adminRoot), "batch-reports");
}

export function loadPodcastPendingPromotionState(
  adminRoot = process.cwd()
): PodcastPendingPromotionState | null {
  const filePath = getPodcastPendingPromotionStatePath(adminRoot);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PodcastPendingPromotionState;
}

export function createPodcastPendingPromotionState(
  catalog: PodcastCatalogKind
): PodcastPendingPromotionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    catalog,
    batch_number: 0,
    last_processed_id: null,
    last_processed_created_at: null,
    started_at: now,
    updated_at: now,
    examined: 0,
    promoted: 0,
    skipped: 0,
    failed: 0,
    shutdown_requested: false,
    status: "running",
  };
}

export function writePodcastPendingPromotionStateAtomic(
  state: PodcastPendingPromotionState,
  adminRoot = process.cwd()
) {
  const dir = dataDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  state.updated_at = new Date().toISOString();
  const finalPath = getPodcastPendingPromotionStatePath(adminRoot);
  const tempPath = `${finalPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, finalPath);
}

export function appendPodcastPendingPromotionBatchLog(
  entry: Record<string, unknown>,
  adminRoot = process.cwd()
) {
  const dir = dataDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    getPodcastPendingPromotionBatchLogPath(adminRoot),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    "utf8"
  );
}

export function writePodcastPendingPromotionBatchReport(
  batchNumber: number,
  report: Record<string, unknown>,
  adminRoot = process.cwd()
) {
  const dir = getPodcastPendingPromotionReportDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `batch-${String(batchNumber).padStart(5, "0")}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}
