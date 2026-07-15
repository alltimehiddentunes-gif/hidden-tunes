import { performance } from "node:perf_hooks";

import { discoverFromAdaptersParallel } from "../lib/tvExpansion25k/fast/parallelDiscovery";
import { getWave4NormalSourceAdapters } from "../lib/tvExpansion25k/sources/registry";
import { createInitialWave4Checkpoint } from "../lib/tvExpansion25k/wave4/checkpoint";
import { throughputPerMinute } from "../lib/tvExpansion25k/fast/timing";
import { TV_FAST_CONFIG } from "../lib/tvExpansion25k/fast/config";
import { mapWithConcurrency } from "../lib/tvExpansion25k/fast/workerPool";

async function benchmarkDiscovery(
  label: string,
  concurrency: number,
  adapters: ReturnType<typeof getWave4NormalSourceAdapters>,
  sourceState: ReturnType<typeof createInitialWave4Checkpoint>["sources"],
  batchSize: number,
  batchNumber: number,
  adminRoot: string
) {
  const start = performance.now();
  const result = await discoverFromAdaptersParallel(
    adapters,
    sourceState,
    batchSize,
    batchNumber,
    adminRoot,
    {
      concurrency,
      sourceTimeoutMs: TV_FAST_CONFIG.sourceTimeoutMs,
    }
  );
  const durationMs = performance.now() - start;
  return {
    label,
    concurrency,
    durationMs: Math.round(durationMs),
    candidates: result.candidates.length,
    sourcesActive: Object.values(result.sources).filter((row) => (row.discovered || 0) > 0).length,
    candidatesPerMin: Math.round(throughputPerMinute(result.candidates.length, durationMs)),
  };
}

async function benchmarkSyntheticParallelism() {
  const adapters = getWave4NormalSourceAdapters();
  const delayMs = 40;
  const start = performance.now();
  for (const adapter of adapters) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    void adapter.id;
  }
  const serialMs = performance.now() - start;

  const parallelStart = performance.now();
  await mapWithConcurrency(adapters, TV_FAST_CONFIG.discoveryConcurrency, async () => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  });
  const parallelMs = performance.now() - parallelStart;

  return {
    adapterCount: adapters.length,
    simulatedSourceDelayMs: delayMs,
    serialMs: Math.round(serialMs),
    parallelMs: Math.round(parallelMs),
    discoverySpeedMultiplier: serialMs > 0 ? Number((serialMs / parallelMs).toFixed(2)) : 0,
  };
}

async function main() {
  const checkpoint = createInitialWave4Checkpoint("normal");
  const adapters = getWave4NormalSourceAdapters();
  const batchSize = 500;
  const batchNumber = 1;
  const adminRoot = process.cwd();
  const sourceState = checkpoint.sources;

  const before = await benchmarkDiscovery(
    "serial-equivalent",
    1,
    adapters,
    sourceState,
    batchSize,
    batchNumber,
    adminRoot
  );

  const after = await benchmarkDiscovery(
    "parallel",
    TV_FAST_CONFIG.discoveryConcurrency,
    adapters,
    sourceState,
    batchSize,
    batchNumber,
    adminRoot
  );

  const discoveryMultiplier =
    after.durationMs > 0 ? Number((before.durationMs / after.durationMs).toFixed(2)) : 0;

  const synthetic = await benchmarkSyntheticParallelism();

  const report = {
    at: new Date().toISOString(),
    before: {
      sourceConcurrency: before.concurrency,
      verificationConcurrency: 1,
      batchSize,
      candidatesPerMinute: before.candidatesPerMin,
      averageBatchDurationMs: before.durationMs,
    },
    after: {
      sourceConcurrency: after.concurrency,
      verificationConcurrency: TV_FAST_CONFIG.verifyConcurrency,
      batchSize,
      candidatesPerMinute: after.candidatesPerMin,
      averageBatchDurationMs: after.durationMs,
    },
    discovery: { before, after },
    improvement: {
      discoverySpeedMultiplier: discoveryMultiplier,
      syntheticParallelMultiplier: synthetic.discoverySpeedMultiplier,
    },
    synthetic,
    note:
      "Serial-equivalent uses concurrency=1 on the Wave 4 parallel discovery path. Same checkpoint and inventory for both runs.",
  };

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
