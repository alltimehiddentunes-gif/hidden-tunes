/** User-facing completion target for this expansion project. */
export const TV_EXPANSION_25K_TARGET = 25_000;

/** Batch sizes after each completed batch (1-indexed). */
export const TV_EXPANSION_BATCH_PROGRESSION = [100, 250, 500, 1000] as const;

export function getTvExpansionBatchSize(batchNumber: number) {
  const index = Math.max(0, Math.min(batchNumber - 1, TV_EXPANSION_BATCH_PROGRESSION.length - 1));
  return TV_EXPANSION_BATCH_PROGRESSION[index];
}

export const TV_EXPANSION_CHECKPOINT_DIR = "data/tv-expansion-25k";
export const TV_EXPANSION_STATE_FILE = "state.json";
export const TV_EXPANSION_BATCH_LOG = "batch-log.jsonl";

/** Stop if this many consecutive batches import zero while candidates were offered. */
export const TV_EXPANSION_ZERO_IMPORT_STALL_LIMIT = 25;

/** Candidate discovery multiplier for iptv-org scanning per batch. */
export const TV_EXPANSION_IPTV_SCAN_MULTIPLIER = 4;
