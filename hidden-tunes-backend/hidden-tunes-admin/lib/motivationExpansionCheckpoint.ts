import fs from "node:fs";
import path from "node:path";

export type MotivationExpansionCheckpoint = {
  section: "motivation";
  batch_number: number;
  source_key: string;
  status: "running" | "paused" | "completed" | "failed";
  records_examined: number;
  records_accepted: number;
  records_inserted: number;
  records_updated: number;
  records_skipped: number;
  records_rejected: number;
  files_inserted: number;
  media_verified: number;
  media_failed: number;
  completed_item_keys: string[];
  failed_item_keys: string[];
  last_external_id: string | null;
  source_page: number;
  source_cursor: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
};

const CHECKPOINT_DIR = path.join(process.cwd(), "data", "motivation-expansion-checkpoints");

const FIELD_ALIASES: Record<string, keyof MotivationExpansionCheckpoint> = {
  batch: "batch_number",
  batchNumber: "batch_number",
  sourceKey: "source_key",
  completedItems: "completed_item_keys",
  failedItems: "failed_item_keys",
  lastExternalId: "last_external_id",
  sourcePage: "source_page",
  sourceCursor: "source_cursor",
  startedAt: "started_at",
  updatedAt: "updated_at",
  completedAt: "completed_at",
};

function checkpointPaths(batchNumber: number, sourceKey: string) {
  const safeKey = sourceKey.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const base = path.join(CHECKPOINT_DIR, `batch${batchNumber}-${safeKey}`);
  return {
    active: `${base}.json`,
    temp: `${base}.json.tmp`,
    backup: `${base}.json.bak`,
  };
}

function normalizeCheckpoint(raw: Record<string, unknown>): MotivationExpansionCheckpoint {
  const normalized: Record<string, unknown> = { ...raw };
  for (const [alias, target] of Object.entries(FIELD_ALIASES)) {
    if (normalized[alias] !== undefined && normalized[target] === undefined) {
      normalized[target] = normalized[alias];
    }
  }

  return {
    section: "motivation",
    batch_number: Number(normalized.batch_number ?? 0),
    source_key: String(normalized.source_key || ""),
    status: (normalized.status as MotivationExpansionCheckpoint["status"]) || "running",
    records_examined: Number(normalized.records_examined ?? 0),
    records_accepted: Number(normalized.records_accepted ?? 0),
    records_inserted: Number(normalized.records_inserted ?? 0),
    records_updated: Number(normalized.records_updated ?? 0),
    records_skipped: Number(normalized.records_skipped ?? 0),
    records_rejected: Number(normalized.records_rejected ?? 0),
    files_inserted: Number(normalized.files_inserted ?? 0),
    media_verified: Number(normalized.media_verified ?? 0),
    media_failed: Number(normalized.media_failed ?? 0),
    completed_item_keys: Array.isArray(normalized.completed_item_keys)
      ? normalized.completed_item_keys.map(String)
      : [],
    failed_item_keys: Array.isArray(normalized.failed_item_keys)
      ? normalized.failed_item_keys.map(String)
      : [],
    last_external_id: normalized.last_external_id ? String(normalized.last_external_id) : null,
    source_page: Number(normalized.source_page ?? 0),
    source_cursor: normalized.source_cursor ? String(normalized.source_cursor) : null,
    started_at: String(normalized.started_at || new Date().toISOString()),
    updated_at: String(normalized.updated_at || new Date().toISOString()),
    completed_at: normalized.completed_at ? String(normalized.completed_at) : null,
  };
}

export function validateMotivationExpansionCheckpoint(
  checkpoint: MotivationExpansionCheckpoint
) {
  const errors: string[] = [];
  if (checkpoint.section !== "motivation") errors.push("Checkpoint section must be motivation.");
  if (!checkpoint.source_key) errors.push("Checkpoint source_key is required.");
  if (!Number.isFinite(checkpoint.batch_number)) errors.push("Invalid batch_number.");
  if (!["running", "paused", "completed", "failed"].includes(checkpoint.status)) {
    errors.push("Invalid checkpoint status.");
  }
  return { ok: errors.length === 0, errors };
}

export function loadMotivationExpansionCheckpoint(batchNumber: number, sourceKey: string) {
  const paths = checkpointPaths(batchNumber, sourceKey);
  const candidates = [paths.active, paths.backup];
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
      const checkpoint = normalizeCheckpoint(raw);
      const validation = validateMotivationExpansionCheckpoint(checkpoint);
      if (validation.ok) return { checkpoint, recovered_from: filePath === paths.backup ? "backup" : "active" };
    } catch {
      continue;
    }
  }
  return null;
}

export function writeMotivationExpansionCheckpoint(checkpoint: MotivationExpansionCheckpoint) {
  const validation = validateMotivationExpansionCheckpoint(checkpoint);
  if (!validation.ok) {
    throw new Error(`Invalid checkpoint: ${validation.errors.join("; ")}`);
  }

  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  const paths = checkpointPaths(checkpoint.batch_number, checkpoint.source_key);
  const payload = `${JSON.stringify(checkpoint, null, 2)}\n`;

  if (fs.existsSync(paths.active)) {
    fs.copyFileSync(paths.active, paths.backup);
  }
  fs.writeFileSync(paths.temp, payload, "utf8");
  fs.renameSync(paths.temp, paths.active);
}

export function markMotivationCheckpointItemCompleted(
  checkpoint: MotivationExpansionCheckpoint,
  stableItemKey: string
) {
  if (!checkpoint.completed_item_keys.includes(stableItemKey)) {
    checkpoint.completed_item_keys.push(stableItemKey);
  }
  checkpoint.failed_item_keys = checkpoint.failed_item_keys.filter((key) => key !== stableItemKey);
  checkpoint.updated_at = new Date().toISOString();
  return checkpoint;
}

export function markMotivationCheckpointItemFailed(
  checkpoint: MotivationExpansionCheckpoint,
  stableItemKey: string
) {
  if (!checkpoint.failed_item_keys.includes(stableItemKey)) {
    checkpoint.failed_item_keys.push(stableItemKey);
  }
  checkpoint.updated_at = new Date().toISOString();
  return checkpoint;
}

export function isMotivationCheckpointItemCompleted(
  checkpoint: MotivationExpansionCheckpoint,
  stableItemKey: string
) {
  return checkpoint.completed_item_keys.includes(stableItemKey);
}

export function createMotivationExpansionCheckpoint(input: {
  batch_number: number;
  source_key: string;
}) {
  const nowIso = new Date().toISOString();
  return normalizeCheckpoint({
    section: "motivation",
    batch_number: input.batch_number,
    source_key: input.source_key,
    status: "running",
    records_examined: 0,
    records_accepted: 0,
    records_inserted: 0,
    records_updated: 0,
    records_skipped: 0,
    records_rejected: 0,
    files_inserted: 0,
    media_verified: 0,
    media_failed: 0,
    completed_item_keys: [],
    failed_item_keys: [],
    last_external_id: null,
    source_page: 0,
    source_cursor: null,
    started_at: nowIso,
    updated_at: nowIso,
    completed_at: null,
  });
}

export function validateMotivationCheckpointFiles(batchNumber?: number) {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    return { ok: true, files: [], errors: [] as string[] };
  }

  const files = fs
    .readdirSync(CHECKPOINT_DIR)
    .filter((name) => name.endsWith(".json") || name.endsWith(".json.bak"));
  const errors: string[] = [];
  const summaries = [];

  for (const name of files) {
    if (batchNumber !== undefined && !name.startsWith(`batch${batchNumber}-`)) continue;
    const filePath = path.join(CHECKPOINT_DIR, name);
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
      const checkpoint = normalizeCheckpoint(raw);
      const validation = validateMotivationExpansionCheckpoint(checkpoint);
      summaries.push({
        file: name,
        ok: validation.ok,
        batch_number: checkpoint.batch_number,
        source_key: checkpoint.source_key,
        status: checkpoint.status,
        completed_items: checkpoint.completed_item_keys.length,
        failed_items: checkpoint.failed_item_keys.length,
      });
      if (!validation.ok) errors.push(`${name}: ${validation.errors.join("; ")}`);
    } catch (error) {
      errors.push(`${name}: malformed checkpoint (${error instanceof Error ? error.message : String(error)})`);
      summaries.push({ file: name, ok: false });
    }
  }

  return { ok: errors.length === 0, files: summaries, errors };
}
