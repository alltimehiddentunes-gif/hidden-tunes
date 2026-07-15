import {
  getTvExpansionBatchSize,
  TV_EXPANSION_25K_TARGET,
} from "@/lib/tvExpansion25k/constants";
import { prefilterNewTvCandidates } from "@/lib/tvExpansion25k/dedupeKeys";
import { allAdaptersExhausted, discoverFromAdapters } from "@/lib/tvExpansion25k/sourceDiscovery";
import {
  getWave4NormalSourceAdapters,
  getWave4MatureSourceAdapters,
  TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS,
} from "@/lib/tvExpansion25k/sources/registry";
import { getTvPlatformEligibleCounts } from "@/lib/tvExpansion25k/platformCount";
import { importVerifiedTvGrowthCandidates } from "@/lib/tvStationHealth";
import {
  appendTvWave4BatchLog,
  loadTvWave4Checkpoint,
  saveTvWave4Checkpoint,
  type TvWave4Checkpoint,
} from "@/lib/tvExpansion25k/wave4/checkpoint";
import {
  TV_WAVE4_EMPTY_BATCH_STOP_LIMIT,
  type TvWave4RunLimits,
} from "@/lib/tvExpansion25k/wave4/constants";
import { allWave4SourcesExhausted, getWave4SourceWeight } from "@/lib/tvExpansion25k/wave4/scheduler";
import type { TvExpansion25kBatchReport } from "@/lib/tvExpansion25k/checkpoint";

export type TvWave4RunResult = {
  mode: "dry-run" | "execute";
  completed: boolean;
  reason: string;
  checkpoint: TvWave4Checkpoint;
  counts: Awaited<ReturnType<typeof getTvPlatformEligibleCounts>>;
  batchesRun: number;
  lastProgress: TvWave4ProgressReport | null;
};

export type TvWave4ProgressReport = {
  startingPlatformEligible: number;
  currentPlatformEligible: number;
  increaseThisRun: number;
  target: number;
  remainingGap: number;
  normalPlatformEligible: number;
  maturePlatformEligible: number;
  combinedPlatformEligible: number;
  source: Record<string, unknown>;
  candidatesDiscovered: number;
  uniqueCandidates: number;
  duplicates: number;
  imported: number;
  rejected: number;
  emptyBatches: number;
  sourceExhausted: boolean;
  runnerStatus: string;
  contentScope: string;
};

function selectWave4Adapters(contentScope: "normal" | "mature") {
  return contentScope === "mature" ? getWave4MatureSourceAdapters() : getWave4NormalSourceAdapters();
}

function filterAdaptersByFlags(
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

function buildProgressReport(
  checkpoint: TvWave4Checkpoint,
  report: TvExpansion25kBatchReport | null,
  counts: Awaited<ReturnType<typeof getTvPlatformEligibleCounts>>,
  startingNormalEligible: number,
  reason: string
): TvWave4ProgressReport {
  const currentNormal = counts.normalPlatformEligible;
  return {
    startingPlatformEligible: startingNormalEligible,
    currentPlatformEligible: currentNormal,
    increaseThisRun: currentNormal - startingNormalEligible,
    target: checkpoint.target,
    remainingGap: Math.max(0, checkpoint.target - currentNormal),
    normalPlatformEligible: counts.normalPlatformEligible,
    maturePlatformEligible: counts.maturePlatformEligible,
    combinedPlatformEligible: counts.combinedPlatformEligible,
    source: report?.sources || {},
    candidatesDiscovered: report?.discovered || 0,
    uniqueCandidates: report?.importUnique || 0,
    duplicates: report?.preDedupeRemoved || 0,
    imported: report?.importImported || 0,
    rejected: report?.importRejected || 0,
    emptyBatches: checkpoint.consecutiveEmptyBatches,
    sourceExhausted: allWave4SourcesExhausted(
      checkpoint.sources.adapterCursors,
      [...TV_EXPANSION_WAVE4_ACTIVE_SOURCE_IDS]
    ),
    runnerStatus: reason,
    contentScope: checkpoint.contentScope,
  };
}

export async function runTvWave4Batch(
  checkpoint: TvWave4Checkpoint,
  limits: TvWave4RunLimits,
  adminRoot: string
) {
  const startedAt = Date.now();
  const batchNumber = checkpoint.batchNumber + 1;
  const batchSize = getTvExpansionBatchSize(batchNumber);
  const countsBefore = await getTvPlatformEligibleCounts();
  const adapters = filterAdaptersByFlags(selectWave4Adapters(checkpoint.contentScope), limits);

  if (countsBefore.normalPlatformEligible >= (limits.targetEligible || checkpoint.target)) {
    return {
      done: true,
      reason: "target_reached_before_batch",
      checkpoint,
      report: null as TvExpansion25kBatchReport | null,
      counts: countsBefore,
    };
  }

  const discovery = await discoverFromAdapters(
    adapters,
    checkpoint.sources,
    batchSize,
    batchNumber,
    adminRoot
  );
  const preProbeRejected = Object.values(discovery.sources).reduce(
    (sum, source) => sum + (source.preRejected || 0) + (source.unsupported || 0),
    0
  );
  const fingerprintSkipped = Object.values(discovery.sources).reduce(
    (sum, source) => sum + (source.fingerprintSkipped || 0),
    0
  );
  const prefilter = await prefilterNewTvCandidates(discovery.candidates);

  let importResult = {
    found: 0,
    unique: 0,
    imported: 0,
    rejected: 0,
  };

  if (!limits.dryRun && prefilter.accepted.length > 0) {
    importResult = await importVerifiedTvGrowthCandidates(prefilter.accepted, {
      isMature: checkpoint.contentScope === "mature",
      matureSourceApproved: false,
    });
  } else if (!limits.dryRun) {
    importResult = {
      found: prefilter.accepted.length,
      unique: prefilter.accepted.length,
      imported: 0,
      rejected: prefilter.accepted.length,
    };
  } else {
    importResult = {
      found: prefilter.accepted.length,
      unique: prefilter.accepted.length,
      imported: 0,
      rejected: 0,
    };
  }

  const countsAfter = limits.dryRun ? countsBefore : await getTvPlatformEligibleCounts();
  const report: TvExpansion25kBatchReport = {
    batchNumber,
    batchSize,
    at: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    discovered: discovery.candidates.length,
    preDedupeRemoved: prefilter.removed,
    preProbeRejected,
    fingerprintSkipped,
    importFound: importResult.found,
    importUnique: importResult.unique,
    importImported: importResult.imported,
    importRejected: importResult.rejected,
    healthChecked: 0,
    healthPlayable: 0,
    healthFailed: 0,
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
    consecutiveEmptyBatches: emptyBatch
      ? checkpoint.consecutiveEmptyBatches + 1
      : 0,
    lastBatch: report,
  };

  saveTvWave4Checkpoint(nextCheckpoint, adminRoot);
  appendTvWave4BatchLog(report, adminRoot);

  const stopEmptyLimit = limits.stopAfterEmptyBatches ?? TV_WAVE4_EMPTY_BATCH_STOP_LIMIT;
  const targetEligible = limits.targetEligible || checkpoint.target;

  if (countsAfter.normalPlatformEligible >= targetEligible) {
    return {
      done: true,
      reason: "target_reached",
      checkpoint: nextCheckpoint,
      report,
      counts: countsAfter,
    };
  }

  if (
    allAdaptersExhausted(
      nextCheckpoint.sources.adapterCursors,
      adapters.map((adapter) => adapter.id),
      getWave4SourceWeight
    )
  ) {
    return {
      done: true,
      reason: "sources_exhausted",
      checkpoint: nextCheckpoint,
      report,
      counts: countsAfter,
    };
  }

  if (nextCheckpoint.consecutiveEmptyBatches >= stopEmptyLimit) {
    return {
      done: true,
      reason: "empty_batch_limit",
      checkpoint: nextCheckpoint,
      report,
      counts: countsAfter,
    };
  }

  if (limits.maxImports && nextCheckpoint.totalImported >= limits.maxImports) {
    return {
      done: true,
      reason: "max_imports_reached",
      checkpoint: nextCheckpoint,
      report,
      counts: countsAfter,
    };
  }

  return {
    done: false,
    reason: "continue",
    checkpoint: nextCheckpoint,
    report,
    counts: countsAfter,
  };
}

export async function runTvWave4Expansion(
  limits: TvWave4RunLimits,
  adminRoot = process.cwd()
): Promise<TvWave4RunResult> {
  const contentScope = limits.contentScope || "normal";
  let checkpoint = loadTvWave4Checkpoint(adminRoot);
  checkpoint.contentScope = contentScope;

  const counts = await getTvPlatformEligibleCounts();
  const startingNormalEligible = counts.normalPlatformEligible;
  const maxBatches = limits.maxBatches ?? 1;
  const startedMs = Date.now();
  const maxRuntimeMs = (limits.maxRuntimeMinutes || 0) * 60_000;

  if (limits.dryRun && maxBatches === 1) {
    const result = await runTvWave4Batch(checkpoint, limits, adminRoot);
    const progress = buildProgressReport(
      result.checkpoint,
      result.report,
      result.counts,
      startingNormalEligible,
      result.reason
    );
    console.log(
      `Wave4 dry-run | discovered ${progress.candidatesDiscovered} | unique ${progress.uniqueCandidates} | duplicates ${progress.duplicates}`
    );
    return {
      mode: "dry-run",
      completed: result.done,
      reason: result.reason,
      checkpoint: result.checkpoint,
      counts: result.counts,
      batchesRun: 1,
      lastProgress: progress,
    };
  }

  let batchesRun = 0;
  let lastProgress: TvWave4ProgressReport | null = null;

  while (batchesRun < maxBatches) {
    if (maxRuntimeMs > 0 && Date.now() - startedMs >= maxRuntimeMs) {
      return {
        mode: limits.dryRun ? "dry-run" : "execute",
        completed: true,
        reason: "max_runtime_reached",
        checkpoint,
        counts: await getTvPlatformEligibleCounts(),
        batchesRun,
        lastProgress,
      };
    }

    const result = await runTvWave4Batch(checkpoint, limits, adminRoot);
    checkpoint = result.checkpoint;
    batchesRun += 1;
    lastProgress = buildProgressReport(
      checkpoint,
      result.report,
      result.counts,
      startingNormalEligible,
      result.reason
    );

    console.log(
      `Wave4 batch complete | scope ${contentScope} | imported ${result.report?.importImported ?? 0} | normal eligible ${result.counts.normalPlatformEligible} | continuing`
    );

    if (result.done) {
      return {
        mode: limits.dryRun ? "dry-run" : "execute",
        completed: result.reason === "target_reached",
        reason: result.reason,
        checkpoint,
        counts: result.counts,
        batchesRun,
        lastProgress,
      };
    }
  }

  return {
    mode: limits.dryRun ? "dry-run" : "execute",
    completed: false,
    reason: "max_batches_reached",
    checkpoint,
    counts: await getTvPlatformEligibleCounts(),
    batchesRun,
    lastProgress,
  };
}
