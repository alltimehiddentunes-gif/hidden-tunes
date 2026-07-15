import type { TvFastRuntimeConfig } from "@/lib/tvExpansion25k/fast/config";
import type { TvBatchTimingReport } from "@/lib/tvExpansion25k/fast/timing";

export type AdaptiveSignals = {
  batchLatencyMs: number;
  timeoutRate: number;
  errorRate: number;
  successRate: number;
};

export function adjustFastRuntime(
  config: TvFastRuntimeConfig,
  signals: AdaptiveSignals
): TvFastRuntimeConfig {
  let discovery = config.activeDiscoveryConcurrency;
  let verify = config.activeVerifyConcurrency;
  let batchSize = config.activeDiscoveryBatchSize;

  const unhealthy =
    signals.timeoutRate > 0.15 ||
    signals.errorRate > 0.2 ||
    signals.batchLatencyMs > 120_000;

  const healthy =
    signals.batchLatencyMs < 45_000 &&
    signals.timeoutRate < 0.05 &&
    signals.errorRate < 0.05 &&
    signals.successRate > 0.5;

  if (unhealthy) {
    discovery = Math.max(1, Math.floor(discovery * 0.75));
    verify = Math.max(1, Math.floor(verify * 0.75));
    batchSize = Math.max(config.discoveryBatchMin, Math.floor(batchSize * 0.8));
  } else if (healthy) {
    discovery = Math.min(config.discoveryConcurrencyMax, discovery + 1);
    verify = Math.min(config.verifyConcurrencyMax, verify + 2);
    batchSize = Math.min(config.discoveryBatchMax, Math.floor(batchSize * 1.1));
  }

  return {
    ...config,
    activeDiscoveryConcurrency: discovery,
    activeVerifyConcurrency: verify,
    activeDiscoveryBatchSize: batchSize,
  };
}

export function signalsFromTiming(
  timing: TvBatchTimingReport,
  discovered: number,
  errors: number,
  timeouts: number
): AdaptiveSignals {
  const checks = Math.max(1, discovered);
  return {
    batchLatencyMs: timing.totalMs,
    timeoutRate: timeouts / checks,
    errorRate: errors / checks,
    successRate: Math.max(0, 1 - (errors + timeouts) / checks),
  };
}

export function resolveDiscoveryBatchSize(
  config: TvFastRuntimeConfig,
  batchNumber: number
) {
  const floor = config.activeDiscoveryBatchSize;
  const legacyCap = batchNumber < 4 ? [100, 250, 500, 1000][batchNumber - 1] || floor : floor;
  return Math.max(legacyCap, Math.min(config.discoveryBatchMax, floor));
}
