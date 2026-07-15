/** Standard (non-mature) podcast show target for mass expansion. */
export const PODCAST_EXPANSION_TARGET_STANDARD = 100_000;

/** Mature (+18) podcast show target for mass expansion. */
export const PODCAST_EXPANSION_TARGET_MATURE = 30_000;

/** Feeds processed per resumable batch (500–1000 recommended). */
export const PODCAST_EXPANSION_DEFAULT_BATCH_SIZE = 750;

/** Maximum episodes ingested per feed during expansion imports. */
export const PODCAST_EXPANSION_MAX_EPISODES_PER_FEED = 5_000;

/** Checkpoint interval during a single batch (feeds). */
export const PODCAST_EXPANSION_CHECKPOINT_INTERVAL = 100;

/** Data directory for mass expansion artifacts. */
export const PODCAST_MASS_EXPANSION_DATA_DIR = "podcast-mass-expansion";
