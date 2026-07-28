import fs from "node:fs";
import path from "node:path";

import { LECTURE_EXPANSION_STATE_DIR } from "@/lib/lecturesExpansion/constants";

export type LectureExpansionState = {
  started_at: string;
  updated_at: string;
  batch_number: number;
  targets: {
    programs: number;
    playable_items: number;
  };
  exhausted_sources: string[];
  exhausted_tasks: string[];
  last_source_key: string | null;
  last_query_family: string | null;
  last_batch_summary: Record<string, unknown> | null;
  status: "running" | "completed" | "source_exhausted" | "failed";
};

function statePath(adminRoot: string) {
  return path.join(adminRoot, LECTURE_EXPANSION_STATE_DIR, "state.json");
}

export function loadLectureExpansionState(adminRoot: string): LectureExpansionState | null {
  const filePath = statePath(adminRoot);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as LectureExpansionState;
}

export function writeLectureExpansionState(state: LectureExpansionState, adminRoot: string) {
  const dir = path.join(adminRoot, LECTURE_EXPANSION_STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(statePath(adminRoot), JSON.stringify(state, null, 2));
}

export function createLectureExpansionState(targets: {
  programs: number;
  playable_items: number;
}): LectureExpansionState {
  const now = new Date().toISOString();
  return {
    started_at: now,
    updated_at: now,
    batch_number: 0,
    targets,
    exhausted_sources: [],
    exhausted_tasks: [],
    last_source_key: null,
    last_query_family: null,
    last_batch_summary: null,
    status: "running",
  };
}

export function appendLectureExpansionBatchReport(
  adminRoot: string,
  batchNumber: number,
  report: Record<string, unknown>
) {
  const dir = path.join(adminRoot, LECTURE_EXPANSION_STATE_DIR, "batches");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `batch-${String(batchNumber).padStart(5, "0")}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return filePath;
}

export function taskKey(sourceKey: string, queryFamily: string) {
  return `${sourceKey}::${queryFamily}`;
}

export function isTaskExhausted(state: LectureExpansionState, sourceKey: string, queryFamily: string) {
  return state.exhausted_tasks.includes(taskKey(sourceKey, queryFamily));
}

export function markTaskExhausted(state: LectureExpansionState, sourceKey: string, queryFamily: string) {
  const key = taskKey(sourceKey, queryFamily);
  if (!state.exhausted_tasks.includes(key)) state.exhausted_tasks.push(key);
}
