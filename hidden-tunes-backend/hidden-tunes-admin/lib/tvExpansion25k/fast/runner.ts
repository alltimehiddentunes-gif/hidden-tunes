import {
  TV_EXPANSION_25K_TARGET,
} from "@/lib/tvExpansion25k/constants";
import { allAdaptersExhausted } from "@/lib/tvExpansion25k/sourceDiscovery";
import {
  getWave4NormalSourceAdapters,
  getWave4MatureSourceAdapters,
  TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS,
} from "@/lib/tvExpansion25k/sources/registry";
import { getTvPlatformEligibleCounts } from "@/lib/tvExpansion25k/platformCount";
import {
  appendTvWave4BatchLog,
  loadTvWave4Checkpoint,
  saveTvWave4Checkpoint,
  type TvWave4Checkpoint,
} from "@/lib/tvExpansion25k/wave4/checkpoint";
import type { TvExpansion25kBatchReport } from "@/lib/tvExpansion25k/checkpoint";
import type { TvSourceDiscoveryDetail } from "@/lib/tvExpansion25k/sourceDiscovery";
import type { TvWave4RunLimits } from "@/lib/tvExpansion25k/wave4/constants";
import { getWave4SourceWeight } from "@/lib/tvExpansion25k/wave4/scheduler";
import { createFastRuntimeConfig, type TvFastRuntimeConfig } from "@/lib/tvExpansion25k/fast/config";
import { TvDedupeCache } from "@/lib/tvExpansion25k/fast/dedupeCache";
import { discoverFromAdaptersParallel } from "@/lib/tvExpansion25k/fast/parallelDiscovery";
import { bulkImportVerifiedCandidates } from "@/lib/tvExpansion25k/fast/bulkImport";
import {
  adjustFastRuntime,
  resolveDiscoveryBatchSize,
  signalsFromTiming,
} from "@/lib/tvExpansion25k/fast/adaptiveController";
import { TvBatchTimer, throughputPerMinute } from "@/lib/tvExpansion25k/fast/timing";
import {
  assertDryRunNoWrites,
  getDryRunWriteMetrics,
  resetDryRunWriteCounters,
} from "@/lib/tvExpansion25k/fast/dryRunGuard";
import { logFastStage } from "@/lib/tvExpansion25k/fast/stageLog";

export type TvFastExpansionResult = {
  mode: "dry-run" | "execute";
  completed: boolean;
  reason: string;
  checkpoint: TvWave4Checkpoint;
  counts: Awaited<ReturnType<typeof getTvPlatformEligibleCounts>>;
  batchesRun: number;
  timing: ReturnType<TvBatchTimer["report"]>;
  runtime: TvFastRuntimeConfig;
  writeMetrics?: ReturnType<typeof getDryRunWriteMetrics>;
};

function selectWave4Adapters(contentScope: "normal" | "mature") {
  return contentScope === "mature" ? getWave4MatureSourceAdapters() : getWave4NormalSourceAdapters();
}

function filterAdapters(
  adapters: ReturnType<typeof getWave4NormalSourceAdapters>,
  limits: TvWave4RunLimits
) {
  let selected = adapters;
  if (limits.sourceInclude?.length) {
    const include = new Set(limits.sourceInclude);
    selected = selected.filter((adapter) => include.has(adapter.id));
  }
  if (limits.sourceExclude?.length) {
    const exclude = new Set(limits.sourceExclude);
    selected = selected.filter((adapter) => !exclude.has(adapter.id));
  }
  return selected;
}

export async function runTvFastExpansionBatch(
  checkpoint: TvWave4Checkpoint,
  limits: TvWave4RunLimits,
  runtime: TvFastRuntimeConfig,
  dedupeCache: TvDedupeCache,
  adminRoot: string
) {
  const timer = new TvBatchTimer();
  const batchNumber = checkpoint.batchNumber + 1;
  const batchSize = resolveDiscoveryBatchSize(runtime, batchNumber);
  const countsBefore = await getTvPlatformEligibleCounts();
  const adapters = filterAdapters(selectWave4Adapters(checkpoint.contentScope), limits);

  if (countsBefore.normalPlatformEligible >= (limits.targetEligible || checkpoint.target)) {
    return {
      done: true,
      reason: "target_reached_before_batch",
      checkpoint,
      report: null as TvExpansion25kBatchReport | null,
      counts: countsBefore,
      timing: timer.report({}),
      runtime,
    };
  }

  timer.mark("sourceFetch");
  const discovery = await discoverFromAdaptersParallel(
    adapters,
    checkpoint.sources,
    batchSize,
    batchNumber,
    adminRoot,
    {
      concurrency: runtime.activeDiscoveryConcurrency,
      sourceTimeoutMs: runtime.sourceTimeoutMs,
      lastSources: checkpoint.lastBatch?.sources as
        | Record<string, TvSourceDiscoveryDetail>
        | undefined,
    }
  );
  timer.close("sourceFetch");

  timer.mark("dedupe");
  const prefilter = await dedupeCache.prefilter(discovery.candidates);
  timer.close("dedupe");

  timer.mark("verification");
  const importResult = await bulkImportVerifiedCandidates(prefilter.accepted, dedupeCache, {
    dryRun: limits.dryRun,
    verifyConcurrency: runtime.activeVerifyConcurrency,
    perHostConcurrency: runtime.perHostConcurrency,
    importBatchSize: runtime.importBatchSize,
    importOptions: {
      isMature: checkpoint.contentScope === "mature",
      matureSourceApproved: false,
    },
  });
  timer.close("verification");

  const countsAfter = limits.dryRun ? countsBefore : await getTvPlatformEligibleCounts();
  const preProbeRejected = Object.values(discovery.sources).reduce(
    (sum, source) => sum + (source.preRejected || 0) + (source.unsupported || 0),
    0
  );
  const fingerprintSkipped = Object.values(discovery.sources).reduce(
    (sum, source) => sum + (source.fingerprintSkipped || 0),
    0
  );
  const providerErrors = Object.values(discovery.sources).filter(
    (source) => source.error && source.error !== "exhausted" && source.error !== "skipped_low_yield"
  ).length;
  const timeouts = Object.values(discovery.sources).filter((source) =>
    String(source.error || "").toLowerCase().includes("timed out")
  ).length;

  const timing = timer.report({
    candidatesProcessed: discovery.candidates.length,
    uniqueCandidates: prefilter.accepted.length,
    verificationChecks: importResult.verificationChecks,
    databaseRoundTrips: importResult.databaseRoundTrips + 1,
  });

  const report: TvExpansion25kBatchReport = {
    batchNumber,
    batchSize,
    at: new Date().toISOString(),
    durationMs: timing.totalMs,
    discovered: discovery.candidates.length,
    preDedupeRemoved: prefilter.removed,
    preProbeRejected,
    fingerprintSkipped,
    importFound: importResult.found,
    importUnique: importResult.unique,
    importImported: importResult.imported,
    importRejected: importResult.rejected,
    healthChecked: importResult.verificationChecks,
    healthPlayable: importResult.imported,
    healthFailed: importResult.rejected,
    platformEligibleBefore: countsBefore.normalPlatformEligible,
    platformEligibleAfter: countsAfter.normalPlatformEligible,
    sources: discovery.sources,
    providerErrors: [],
    cumulativeImported: checkpoint.totalImported + importResult.imported,
  };

  const emptyBatch = discovery.candidates.length === 0;
  const nextCheckpoint: TvWave4Checkpoint = {
    ...checkpoint,
    batchNumber,
    sources: discovery.nextSourceState,
    totalImported: checkpoint.totalImported + importResult.imported,
    consecutiveEmptyBatches: emptyBatch ? checkpoint.consecutiveEmptyBatches + 1 : 0,
    lastBatch: report,
  };

  if (!limits.dryRun) {
    saveTvWave4Checkpoint(nextCheckpoint, adminRoot);
    appendTvWave4BatchLog(report, adminRoot);
  } else {
    logFastStage("dry_run_checkpoint_skipped");
  }

  const nextRuntime = adjustFastRuntime(
    runtime,
    signalsFromTiming(timing, discovery.candidates.length, providerErrors, timeouts)
  );

  console.log(
    JSON.stringify({
      event: "tv_fast_batch",
      batch: batchNumber,
      durationMs: timing.totalMs,
      discovered: discovery.candidates.length,
      unique: prefilter.accepted.length,
      imported: importResult.imported,
      rejected: importResult.rejected,
      candidatesPerMin: throughputPerMinute(discovery.candidates.length, timing.totalMs),
      verifyPerMin: throughputPerMinute(importResult.verificationChecks, timing.totalMs),
      discoveryConcurrency: nextRuntime.activeDiscoveryConcurrency,
      verifyConcurrency: nextRuntime.activeVerifyConcurrency,
    })
  );

  const stopEmptyLimit = limits.stopAfterEmptyBatches ?? runtime.emptyBatchStopLimit;
  const targetEligible = limits.targetEligible || checkpoint.target;

  if (countsAfter.normalPlatformEligible >= targetEligible) {
    return { done: true, reason: "target_reached", checkpoint: nextCheckpoint, report, counts: countsAfter, timing, runtime: nextRuntime };
  }
  if (
    allAdaptersExhausted(
      nextCheckpoint.sources.adapterCursors,
      adapters.map((a) => a.id),
      getWave4SourceWeight
    )
  ) {
    return { done: true, reason: "sources_exhausted", checkpoint: nextCheckpoint, report, counts: countsAfter, timing, runtime: nextRuntime };
  }
  if (nextCheckpoint.consecutiveEmptyBatches >= stopEmptyLimit) {
    return { done: true, reason: "empty_batch_limit", checkpoint: nextCheckpoint, report, counts: countsAfter, timing, runtime: nextRuntime };
  }
  if (limits.maxImports && nextCheckpoint.totalImported >= limits.maxImports) {
    return { done: true, reason: "max_imports_reached", checkpoint: nextCheckpoint, report, counts: countsAfter, timing, runtime: nextRuntime };
  }

  return { done: false, reason: "continue", checkpoint: nextCheckpoint, report, counts: countsAfter, timing, runtime: nextRuntime };
}

export async function runTvFastExpansion(
  limits: TvWave4RunLimits,
  adminRoot = process.cwd()
): Promise<TvFastExpansionResult> {
  resetDryRunWriteCounters();
  logFastStage("run_start");
  let checkpoint = loadTvWave4Checkpoint(adminRoot);
  checkpoint.contentScope = limits.contentScope || "normal";
  checkpoint.target = limits.targetEligible || TV_EXPANSION_25K_TARGET;

  let runtime = createFastRuntimeConfig();
  const dedupeCache = new TvDedupeCache();
  logFastStage("dedupe_preload_start");
  await dedupeCache.ensureLoaded();
  logFastStage("dedupe_preload_complete");

  const maxBatches = limits.maxBatches ?? 1;
  const startedMs = Date.now();
  const maxRuntimeMs = (limits.maxRuntimeMinutes || 0) * 60_000;
  let batchesRun = 0;
  let lastTiming = new TvBatchTimer().report({});
  let counts = await getTvPlatformEligibleCounts();
  let reason = "continue";

  while (batchesRun < maxBatches) {
    if (maxRuntimeMs > 0 && Date.now() - startedMs >= maxRuntimeMs) {
      reason = "max_runtime_reached";
      break;
    }

    if (batchesRun > 0 && batchesRun % runtime.dedupeRefreshEveryBatches === 0 && !limits.dryRun) {
      await dedupeCache.refresh();
    }

    logFastStage(`batch_${batchesRun + 1}_start`);
    const result = await runTvFastExpansionBatch(
      checkpoint,
      limits,
      runtime,
      dedupeCache,
      adminRoot
    );
    logFastStage(`batch_${batchesRun + 1}_complete`);
    checkpoint = result.checkpoint;
    runtime = result.runtime;
    counts = result.counts;
    lastTiming = result.timing;
    batchesRun += 1;
    reason = result.reason;

    if (result.done) {
      assertDryRunNoWrites(limits.dryRun !== false);
      logFastStage("run_complete");
      return {
        mode: limits.dryRun ? "dry-run" : "execute",
        completed: result.reason === "target_reached",
        reason: result.reason,
        checkpoint,
        counts,
        batchesRun,
        timing: lastTiming,
        runtime,
        writeMetrics: getDryRunWriteMetrics(),
      };
    }
  }

  assertDryRunNoWrites(limits.dryRun !== false);
  logFastStage("run_complete");

  return {
    mode: limits.dryRun ? "dry-run" : "execute",
    completed: false,
    reason: batchesRun >= maxBatches ? "max_batches_reached" : reason,
    checkpoint,
    counts,
    batchesRun,
    timing: lastTiming,
    runtime,
    writeMetrics: getDryRunWriteMetrics(),
  };
}
