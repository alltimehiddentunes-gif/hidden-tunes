import fs from "node:fs";
import path from "node:path";

import { PODCAST_MASS_EXPANSION_DATA_DIR } from "@/lib/podcastExpansionConstants";

export type PodcastMassExpansionState = {
  version: 1;
  started_at: string;
  updated_at: string;
  batch_number: number;
  active_source_key: string | null;
  source_cursors: Record<string, string>;
  exhausted_sources: string[];
  standard_shows_imported: number;
  mature_shows_imported: number;
  episodes_imported: number;
  duplicate_feeds_skipped: number;
  failed_feeds: number;
  completed_feed_urls: string[];
  status: "running" | "completed" | "paused" | "failed";
  last_batch_report_path: string | null;
  targets: {
    standard: number;
    mature: number;
  };
};

const STATE_FILE = "state.json";

function expansionDir(adminRoot = process.cwd()) {
  return path.join(adminRoot, "data", PODCAST_MASS_EXPANSION_DATA_DIR);
}

export function getPodcastMassExpansionStatePath(adminRoot = process.cwd()) {
  return path.join(expansionDir(adminRoot), STATE_FILE);
}

export function getPodcastMassExpansionBatchLogPath(adminRoot = process.cwd()) {
  return path.join(expansionDir(adminRoot), "batch-log.jsonl");
}

export function getPodcastMassExpansionReportDir(adminRoot = process.cwd()) {
  return path.join(expansionDir(adminRoot), "batch-reports");
}

export function loadPodcastMassExpansionState(
  adminRoot = process.cwd()
): PodcastMassExpansionState | null {
  const filePath = getPodcastMassExpansionStatePath(adminRoot);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PodcastMassExpansionState;
}

export function createPodcastMassExpansionState(options: {
  targets: { standard: number; mature: number };
}): PodcastMassExpansionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    started_at: now,
    updated_at: now,
    batch_number: 0,
    active_source_key: null,
    source_cursors: {},
    exhausted_sources: [],
    standard_shows_imported: 0,
    mature_shows_imported: 0,
    episodes_imported: 0,
    duplicate_feeds_skipped: 0,
    failed_feeds: 0,
    completed_feed_urls: [],
    status: "running",
    last_batch_report_path: null,
    targets: options.targets,
  };
}

export function writePodcastMassExpansionState(
  state: PodcastMassExpansionState,
  adminRoot = process.cwd()
) {
  const dir = expansionDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(
    getPodcastMassExpansionStatePath(adminRoot),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

export function appendPodcastMassExpansionBatchLog(
  entry: Record<string, unknown>,
  adminRoot = process.cwd()
) {
  const dir = expansionDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    getPodcastMassExpansionBatchLogPath(adminRoot),
    `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`,
    "utf8"
  );
}

export function writePodcastMassExpansionBatchReport(
  batchNumber: number,
  report: Record<string, unknown>,
  adminRoot = process.cwd()
) {
  const dir = getPodcastMassExpansionReportDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `batch-${String(batchNumber).padStart(5, "0")}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return filePath;
}
