import fs from "node:fs";
import path from "node:path";

export type MotivationPlayableCheckpoint = {
  section: "motivation_playable";
  query_family: string;
  source_page: number;
  source_cursor: string | null;
  last_identifier: string | null;
  updated_at: string;
  totals: {
    candidates_discovered: number;
    direct_media_resolved: number;
    playback_probes_passed: number;
    rights_checks_passed: number;
    duplicates_skipped: number;
    pending_inserted: number;
    failed_media: number;
    failed_rights: number;
    unsupported_files: number;
    errors: number;
  };
};

const CHECKPOINT_DIR = path.join(process.cwd(), "data", "motivation-playable-checkpoints");

function checkpointPath(queryFamily: string) {
  const safe = queryFamily.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const base = path.join(CHECKPOINT_DIR, `${safe}.json`);
  return { active: base, temp: `${base}.tmp`, backup: `${base}.bak` };
}

export function createMotivationPlayableCheckpoint(queryFamily: string): MotivationPlayableCheckpoint {
  return {
    section: "motivation_playable",
    query_family: queryFamily,
    source_page: 0,
    source_cursor: null,
    last_identifier: null,
    updated_at: new Date().toISOString(),
    totals: {
      candidates_discovered: 0,
      direct_media_resolved: 0,
      playback_probes_passed: 0,
      rights_checks_passed: 0,
      duplicates_skipped: 0,
      pending_inserted: 0,
      failed_media: 0,
      failed_rights: 0,
      unsupported_files: 0,
      errors: 0,
    },
  };
}

export function loadMotivationPlayableCheckpoint(queryFamily: string) {
  const paths = checkpointPath(queryFamily);
  for (const filePath of [paths.active, paths.backup]) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MotivationPlayableCheckpoint;
      if (raw.section === "motivation_playable" && raw.query_family === queryFamily) {
        return raw;
      }
    } catch {
      continue;
    }
  }
  return createMotivationPlayableCheckpoint(queryFamily);
}

export function writeMotivationPlayableCheckpoint(checkpoint: MotivationPlayableCheckpoint) {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const paths = checkpointPath(checkpoint.query_family);
  checkpoint.updated_at = new Date().toISOString();
  const payload = `${JSON.stringify(checkpoint, null, 2)}\n`;
  if (fs.existsSync(paths.active)) {
    fs.copyFileSync(paths.active, paths.backup);
  }
  fs.writeFileSync(paths.temp, payload, "utf8");
  fs.renameSync(paths.temp, paths.active);
}
