import fs from "node:fs";
import path from "node:path";

export type AudiobookExpansionCheckpoint = {
  section: "audiobook";
  batch_number: number;
  source_key: string;
  status: "running" | "paused" | "completed" | "failed";
  records_examined: number;
  records_accepted: number;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  records_rejected: number;
  chapters_inserted: number;
  playable_chapters: number;
  completed_item_keys: string[];
  failed_item_keys: string[];
  last_external_id: string | null;
  source_page: number;
  source_cursor: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

const CHECKPOINT_DIR = path.join(
  process.cwd(),
  "data",
  "audiobook-expansion-checkpoints"
);

function checkpointPaths(batchNumber: number, sourceKey: string) {
  const safeKey = sourceKey.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const base = path.join(CHECKPOINT_DIR, `batch${batchNumber}-${safeKey}`);
  return {
    active: `${base}.json`,
    temp: `${base}.json.tmp`,
    backup: `${base}.json.bak`,
  };
}

export function createAudiobookExpansionCheckpoint(input: {
  batch_number: number;
  source_key: string;
}): AudiobookExpansionCheckpoint {
  const now = new Date().toISOString();
  return {
    section: "audiobook",
    batch_number: input.batch_number,
    source_key: input.source_key,
    status: "running",
    records_examined: 0,
    records_accepted: 0,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    records_rejected: 0,
    chapters_inserted: 0,
    playable_chapters: 0,
    completed_item_keys: [],
    failed_item_keys: [],
    last_external_id: null,
    source_page: 1,
    source_cursor: null,
    started_at: now,
    updated_at: now,
    completed_at: null,
  };
}

export function loadAudiobookExpansionCheckpoint(
  batchNumber: number,
  sourceKey: string
): { checkpoint: AudiobookExpansionCheckpoint; path: string } | null {
  const paths = checkpointPaths(batchNumber, sourceKey);
  if (!fs.existsSync(paths.active)) return null;
  const raw = JSON.parse(
    fs.readFileSync(paths.active, "utf8")
  ) as AudiobookExpansionCheckpoint;
  return { checkpoint: raw, path: paths.active };
}

export function writeAudiobookExpansionCheckpoint(
  checkpoint: AudiobookExpansionCheckpoint
) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const paths = checkpointPaths(checkpoint.batch_number, checkpoint.source_key);
  if (fs.existsSync(paths.active)) {
    fs.copyFileSync(paths.active, paths.backup);
  }
  fs.writeFileSync(paths.temp, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(paths.temp, paths.active);
}
