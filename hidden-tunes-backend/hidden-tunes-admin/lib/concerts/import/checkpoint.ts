/**
 * File-backed checkpoints for Concerts import runs (resumable).
 */

import fs from "fs";
import path from "path";

export type ConcertImportCheckpoint = {
  version: 1;
  worker_name: string;
  source_stable_key: string;
  source_id: string | null;
  channel_id: string | null;
  uploads_playlist_id: string | null;
  page_token: string | null;
  pages_processed: number;
  candidates_seen: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  inserted: number;
  status: "idle" | "running" | "paused" | "failed" | "completed";
  updated_at: string;
  last_error: string | null;
};

function checkpointDir(adminRoot: string) {
  return path.join(adminRoot, "data", "concert-import-checkpoints");
}

export function concertImportCheckpointPath(
  adminRoot: string,
  sourceStableKey: string
): string {
  return path.join(checkpointDir(adminRoot), `${sourceStableKey}.json`);
}

export function createConcertImportCheckpoint(
  sourceStableKey: string
): ConcertImportCheckpoint {
  return {
    version: 1,
    worker_name: "concerts-import",
    source_stable_key: sourceStableKey,
    source_id: null,
    channel_id: null,
    uploads_playlist_id: null,
    page_token: null,
    pages_processed: 0,
    candidates_seen: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    inserted: 0,
    status: "idle",
    updated_at: new Date().toISOString(),
    last_error: null,
  };
}

export function loadConcertImportCheckpoint(
  adminRoot: string,
  sourceStableKey: string
): ConcertImportCheckpoint | null {
  const filePath = concertImportCheckpointPath(adminRoot, sourceStableKey);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as ConcertImportCheckpoint;
  } catch {
    return null;
  }
}

export function writeConcertImportCheckpoint(
  adminRoot: string,
  checkpoint: ConcertImportCheckpoint
): string {
  const dir = checkpointDir(adminRoot);
  fs.mkdirSync(dir, { recursive: true });
  const next = {
    ...checkpoint,
    updated_at: new Date().toISOString(),
  };
  const filePath = concertImportCheckpointPath(adminRoot, next.source_stable_key);
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return filePath;
}
