/** Isolated Wave 4 expansion checkpoint — does not modify Wave 1–3 state. */

export const TV_WAVE4_CHECKPOINT_DIR = "data/tv-expansion-wave4";
export const TV_WAVE4_STATE_FILE = "state.json";
export const TV_WAVE4_BATCH_LOG = "batch-log.jsonl";

/** Stop Wave 4 after this many consecutive empty-discovery batches. */
export const TV_WAVE4_EMPTY_BATCH_STOP_LIMIT = 10;

/** Default staged import limits for controlled rollout. */
export const TV_WAVE4_STAGED_LIMITS = [25, 100, 500] as const;

export type TvWave4ContentScope = "normal" | "mature";

export type TvWave4RunLimits = {
  targetEligible?: number;
  maxBatches?: number;
  maxRuntimeMinutes?: number;
  maxImports?: number;
  stopAfterEmptyBatches?: number;
  contentScope?: TvWave4ContentScope;
  sourceInclude?: string[];
  sourceExclude?: string[];
  dryRun?: boolean;
};
