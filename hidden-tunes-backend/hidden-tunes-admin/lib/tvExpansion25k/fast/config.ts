/** Fast TV expansion — env-driven concurrency and batch caps. */

function readInt(name: string, fallback: number, min = 1, max = 10_000) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(raw)));
}

export const TV_FAST_CONFIG = {
  discoveryConcurrency: readInt("TV_DISCOVERY_CONCURRENCY", 8, 1, 32),
  discoveryConcurrencyMax: readInt("TV_DISCOVERY_CONCURRENCY_MAX", 16, 1, 64),
  verifyConcurrency: readInt("TV_VERIFY_CONCURRENCY", 24, 1, 128),
  verifyConcurrencyMax: readInt("TV_VERIFY_CONCURRENCY_MAX", 48, 1, 256),
  perHostConcurrency: readInt("TV_PER_HOST_CONCURRENCY", 3, 1, 16),
  importBatchSize: readInt("TV_IMPORT_BATCH_SIZE", 500, 25, 5000),
  verifyBatchSize: readInt("TV_VERIFY_BATCH_SIZE", 100, 10, 1000),
  discoveryBatchMin: readInt("TV_DISCOVERY_BATCH_MIN", 250, 50, 5000),
  discoveryBatchMax: readInt("TV_DISCOVERY_BATCH_MAX", 2000, 100, 20_000),
  sourceTimeoutMs: readInt("TV_SOURCE_TIMEOUT_MS", 45_000, 5000, 300_000),
  dedupeRefreshEveryBatches: readInt("TV_DEDUPE_REFRESH_BATCHES", 5, 1, 100),
  emptyBatchStopLimit: readInt("TV_FAST_EMPTY_BATCH_STOP", 10, 1, 100),
} as const;

export type TvFastRuntimeConfig = typeof TV_FAST_CONFIG & {
  activeDiscoveryConcurrency: number;
  activeVerifyConcurrency: number;
  activeDiscoveryBatchSize: number;
};

export function createFastRuntimeConfig(overrides?: Partial<TvFastRuntimeConfig>): TvFastRuntimeConfig {
  return {
    ...TV_FAST_CONFIG,
    activeDiscoveryConcurrency: TV_FAST_CONFIG.discoveryConcurrency,
    activeVerifyConcurrency: TV_FAST_CONFIG.verifyConcurrency,
    activeDiscoveryBatchSize: TV_FAST_CONFIG.discoveryBatchMin,
    ...overrides,
  };
}
