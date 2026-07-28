import fs from "node:fs";
import path from "node:path";

export type PodcastExpansionCheckpoint = {
  batch: number;
  sub_batch?: number;
  feeds_target: number;
  feeds_imported: number;
  feeds_inserted: number;
  feeds_updated: number;
  episodes_inserted?: number;
  episodes_imported?: number;
  duplicate_feeds: number;
  invalid_feeds: number;
  discovery_cursor: number;
  completed_feed_urls: string[];
  started_at: string;
  timestamp: string;
  database_totals: {
    shows: number;
    episodes: number;
    pending_shows: number;
    pending_episodes: number;
  } | null;
};

const CHECKPOINT_DIR = path.join(process.cwd(), "data", "podcast-expansion-checkpoints");

function checkpointPath(batch: number, subBatch?: number) {
  const suffix = subBatch ? `-sub${subBatch}` : "";
  return path.join(CHECKPOINT_DIR, `batch${batch}${suffix}.json`);
}

export function loadPodcastExpansionCheckpoint(batch: number, subBatch?: number) {
  const filePath = checkpointPath(batch, subBatch);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PodcastExpansionCheckpoint;
}

export function writePodcastExpansionCheckpoint(
  checkpoint: PodcastExpansionCheckpoint,
  subBatch?: number
) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(
    checkpointPath(checkpoint.batch, subBatch),
    `${JSON.stringify(checkpoint, null, 2)}\n`,
    "utf8"
  );
}

export function clearPodcastExpansionCheckpoint(batch: number, subBatch?: number) {
  const filePath = checkpointPath(batch, subBatch);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function isPriorBatchValidated(batch: number, adminRoot = process.cwd()) {
  if (batch <= 1) return true;
  const prior = batch - 1;
  const validatedPath = path.join(
    adminRoot,
    "data",
    `podcast-expansion-batch${prior}-validated.json`
  );
  if (!fs.existsSync(validatedPath)) return false;
  try {
    const payload = JSON.parse(fs.readFileSync(validatedPath, "utf8")) as { pass?: boolean };
    return payload.pass === true;
  } catch {
    return false;
  }
}

export function waitForPriorBatchValidated(
  batch: number,
  adminRoot: string,
  maxWaitMs = 3_600_000,
  pollMs = 15_000
) {
  const prior = batch - 1;
  const validatedPath = path.join(
    adminRoot,
    "data",
    `podcast-expansion-batch${prior}-validated.json`
  );
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (fs.existsSync(validatedPath)) {
      try {
        const payload = JSON.parse(fs.readFileSync(validatedPath, "utf8")) as { pass?: boolean };
        if (payload.pass === true) return true;
        if (payload.pass === false) return false;
      } catch {
        /* keep waiting */
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pollMs);
  }
  return false;
}

export function isBatchResultComplete(resultPath: string) {
  if (!fs.existsSync(resultPath)) return false;
  try {
    const result = JSON.parse(fs.readFileSync(resultPath, "utf8")) as {
      dry_run?: boolean;
      success?: boolean;
      feeds_inserted?: number;
      feeds_updated?: number;
    };
    if (result.dry_run) return false;
    if (!result.success) return false;
    return (result.feeds_inserted || 0) + (result.feeds_updated || 0) > 0;
  } catch {
    return false;
  }
}
