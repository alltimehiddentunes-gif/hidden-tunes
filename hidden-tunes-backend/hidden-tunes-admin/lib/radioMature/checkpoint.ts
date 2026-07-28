import fs from "node:fs";
import path from "node:path";

import { RADIO_MATURE_EXPANSION_SOURCE_KEY } from "@/lib/radioMature/constants";

export type MatureRadioExpansionCheckpoint = {
  version: 1;
  source_key: string;
  updated_at: string;
  query_offsets: Record<string, number>;
  exhausted_queries: string[];
  empty_streak: Record<string, number>;
  completed_pages: Array<{ query_key: string; offset: number }>;
  failed_pages: Array<{
    query_key: string;
    offset: number;
    attempts: number;
    reason: string;
    timestamp: string;
  }>;
  cursor_complete: boolean;
  stats: {
    raw_candidates: number;
    confirmed_mature: number;
    borderline: number;
    false_positive: number;
    not_mature: number;
    podcast_or_on_demand: number;
    duplicates: number;
    inserted: number;
    review_queued: number;
    rejected: number;
  };
};

export function defaultMatureRadioCheckpoint(): MatureRadioExpansionCheckpoint {
  return {
    version: 1,
    source_key: RADIO_MATURE_EXPANSION_SOURCE_KEY,
    updated_at: new Date().toISOString(),
    query_offsets: {},
    exhausted_queries: [],
    empty_streak: {},
    completed_pages: [],
    failed_pages: [],
    cursor_complete: false,
    stats: {
      raw_candidates: 0,
      confirmed_mature: 0,
      borderline: 0,
      false_positive: 0,
      not_mature: 0,
      podcast_or_on_demand: 0,
      duplicates: 0,
      inserted: 0,
      review_queued: 0,
      rejected: 0,
    },
  };
}

export function matureRadioCheckpointPath(adminRoot: string) {
  return path.join(adminRoot, "data", "radio-mature-worldwide-expansion.state.json");
}

export function matureRadioResultPath(adminRoot: string) {
  return path.join(adminRoot, "data", "radio-mature-worldwide-expansion-result.json");
}

export function loadMatureRadioCheckpoint(adminRoot: string) {
  const filePath = matureRadioCheckpointPath(adminRoot);
  if (!fs.existsSync(filePath)) return defaultMatureRadioCheckpoint();
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as MatureRadioExpansionCheckpoint;
  if (!parsed.stats) parsed.stats = defaultMatureRadioCheckpoint().stats;
  if (!parsed.empty_streak) parsed.empty_streak = {};
  return parsed;
}

export function saveMatureRadioCheckpoint(adminRoot: string, checkpoint: MatureRadioExpansionCheckpoint) {
  checkpoint.updated_at = new Date().toISOString();
  const filePath = matureRadioCheckpointPath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2));
}

export function saveMatureRadioResult(adminRoot: string, report: Record<string, unknown>) {
  const filePath = matureRadioResultPath(adminRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
}
