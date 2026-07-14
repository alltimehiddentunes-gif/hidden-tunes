import {
  appendTvExpansion25kBatchLog,
  loadTvExpansion25kCheckpoint,
  saveTvExpansion25kCheckpoint,
  type TvExpansion25kBatchReport,
  type TvExpansion25kCheckpoint,
} from "@/lib/tvExpansion25k/checkpoint";
import {
  getTvExpansionBatchSize,
  TV_EXPANSION_25K_TARGET,
  TV_EXPANSION_ZERO_IMPORT_STALL_LIMIT,
} from "@/lib/tvExpansion25k/constants";
import { prefilterNewTvCandidates } from "@/lib/tvExpansion25k/dedupeKeys";
import {
  allTvExpansionSourcesExhausted,
  discoverTvExpansionCandidates,
} from "@/lib/tvExpansion25k/discoverCandidates";
import { updateSourceSummary } from "@/lib/tvExpansion25k/expansionLogs";
import { getTvPlatformEligibleCount } from "@/lib/tvExpansion25k/platformCount";
import { importVerifiedTvGrowthCandidates, runTvStationHealthChecks } from "@/lib/tvStationHealth";

export type TvExpansion25kRunOptions = {
  execute: boolean;
  maxBatches: number;
  adminRoot?: string;
};

export type TvExpansion25kRunResult = {
  mode: "report" | "execute";
  completed: boolean;
  reason: string;
  checkpoint: TvExpansion25kCheckpoint;
  platformEligible: number;
  batchesRun: number;
};

function isDestructiveErrorMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("drop table") ||
    normalized.includes("truncate") ||
    normalized.includes("violates foreign key") ||
    normalized.includes("database corruption")
  );
}

export async function runTvExpansion25kBatch(
  checkpoint: TvExpansion25kCheckpoint,
  execute: boolean,
  adminRoot: string
) {
  const startedAt = Date.now();
  const batchNumber = checkpoint.batchNumber + 1;
  const batchSize = getTvExpansionBatchSize(batchNumber);
  const platformEligibleBefore = await getTvPlatformEligibleCount();

  if (platformEligibleBefore >= TV_EXPANSION_25K_TARGET) {
    return {
      done: true,
      reason: "target_reached_before_batch",
      checkpoint,
      report: null as TvExpansion25kBatchReport | null,
      platformEligible: platformEligibleBefore,
    };
  }

  const discovery = await discoverTvExpansionCandidates(
    checkpoint.sources,
    batchSize,
    batchNumber,
    adminRoot
  );
  const prefilter = await prefilterNewTvCandidates(discovery.candidates);

  let importResult = {
    found: 0,
    unique: 0,
    imported: 0,
    rejected: 0,
  };
  let healthResult = { checked: 0, playable: 0, failed: 0, quarantined: 0, disabled: 0 };

  if (execute && prefilter.accepted.length > 0) {
    importResult = await importVerifiedTvGrowthCandidates(prefilter.accepted);

    if (importResult.imported > 0) {
      const healthLimit = Math.min(Math.max(importResult.imported, 10), 50);
      healthResult = await runTvStationHealthChecks(healthLimit);
    }
  } else if (execute) {
    importResult = {
      found: prefilter.accepted.length,
      unique: prefilter.accepted.length,
      imported: 0,
      rejected: prefilter.accepted.length,
    };
  }

  const platformEligibleAfter = execute
    ? await getTvPlatformEligibleCount()
    : platformEligibleBefore;

  const providerErrors = Object.entries(discovery.sources)
    .filter(([, value]) => value.error && value.error !== "exhausted" && value.error !== "deferred_batch_full")
    .map(([source, value]) => `${source}: ${value.error}`);

  const report: TvExpansion25kBatchReport = {
    batchNumber,
    batchSize,
    at: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    discovered: discovery.candidates.length,
    preDedupeRemoved: prefilter.removed,
    preProbeRejected: discovery.preProbeRejected,
    fingerprintSkipped: discovery.fingerprintSkipped,
    importFound: importResult.found,
    importUnique: importResult.unique,
    importImported: importResult.imported,
    importRejected: importResult.rejected,
    healthChecked: healthResult.checked,
    healthPlayable: healthResult.playable,
    healthFailed: healthResult.failed,
    platformEligibleBefore,
    platformEligibleAfter,
    sources: discovery.sources,
    providerErrors,
    cumulativeImported: checkpoint.totalImported + importResult.imported,
  };

  const nextCheckpoint: TvExpansion25kCheckpoint = {
    ...checkpoint,
    batchNumber,
    sources: discovery.nextSourceState,
    totalImported: checkpoint.totalImported + importResult.imported,
    consecutiveZeroImportBatches:
      execute && importResult.imported === 0 && prefilter.accepted.length > 0
        ? checkpoint.consecutiveZeroImportBatches + 1
        : importResult.imported > 0
          ? 0
          : checkpoint.consecutiveZeroImportBatches,
    lastBatch: report,
  };

  saveTvExpansion25kCheckpoint(nextCheckpoint, adminRoot);
  appendTvExpansion25kBatchLog(report, adminRoot);

  const sourceSummaryUpdates: Record<
    string,
    {
      candidates?: number;
      probePasses?: number;
      imports?: number;
      rejects?: number;
      lastError?: string | null;
      exhausted?: boolean;
    }
  > = {};

  for (const [source, detail] of Object.entries(discovery.sources)) {
    if (detail.error === "deferred_no_allocation" || detail.error === "exhausted") continue;
    sourceSummaryUpdates[source] = {
      candidates: detail.discovered || 0,
      rejects: (detail.preRejected || 0) + (detail.fingerprintSkipped || 0),
      lastError: detail.error || null,
      exhausted: detail.exhausted === true,
    };
  }
  if (Object.keys(sourceSummaryUpdates).length > 0) {
    updateSourceSummary(sourceSummaryUpdates, adminRoot);
  }

  if (platformEligibleAfter >= TV_EXPANSION_25K_TARGET) {
    return {
      done: true,
      reason: "target_reached",
      checkpoint: nextCheckpoint,
      report,
      platformEligible: platformEligibleAfter,
    };
  }

  if (allTvExpansionSourcesExhausted(nextCheckpoint.sources)) {
    return {
      done: true,
      reason: "sources_exhausted",
      checkpoint: nextCheckpoint,
      report,
      platformEligible: platformEligibleAfter,
    };
  }

  if (nextCheckpoint.consecutiveZeroImportBatches >= TV_EXPANSION_ZERO_IMPORT_STALL_LIMIT) {
    return {
      done: true,
      reason: "zero_import_stall",
      checkpoint: nextCheckpoint,
      report,
      platformEligible: platformEligibleAfter,
    };
  }

  return {
    done: false,
    reason: "continue",
    checkpoint: nextCheckpoint,
    report,
    platformEligible: platformEligibleAfter,
  };
}

export async function runTvExpansion25k(
  options: TvExpansion25kRunOptions
): Promise<TvExpansion25kRunResult> {
  const adminRoot = options.adminRoot || process.cwd();
  let checkpoint = loadTvExpansion25kCheckpoint(adminRoot);
  const platformEligible = await getTvPlatformEligibleCount();

  if (!options.execute) {
    return {
      mode: "report",
      completed: platformEligible >= TV_EXPANSION_25K_TARGET,
      reason:
        platformEligible >= TV_EXPANSION_25K_TARGET ? "target_reached" : "report_only",
      checkpoint,
      platformEligible,
      batchesRun: 0,
    };
  }

  if (platformEligible >= TV_EXPANSION_25K_TARGET) {
    return {
      mode: "execute",
      completed: true,
      reason: "target_already_reached",
      checkpoint,
      platformEligible,
      batchesRun: 0,
    };
  }

  let batchesRun = 0;

  while (batchesRun < options.maxBatches) {
    try {
      const result = await runTvExpansion25kBatch(checkpoint, true, adminRoot);
      checkpoint = result.checkpoint;
      batchesRun += 1;

      console.log(
        JSON.stringify(
          {
            event: "tv_expansion_25k_batch_complete",
            batch: result.report,
            platformEligible: result.platformEligible,
            reason: result.reason,
            checkpoint: {
              batchNumber: checkpoint.batchNumber,
              totalImported: checkpoint.totalImported,
              adapterCursors: checkpoint.sources.adapterCursors,
            },
          },
          null,
          2
        )
      );

      if (result.done) {
        return {
          mode: "execute",
          completed: result.reason === "target_reached",
          reason: result.reason,
          checkpoint,
          platformEligible: result.platformEligible,
          batchesRun,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isDestructiveErrorMessage(message)) {
        throw error;
      }

      console.error(
        JSON.stringify(
          {
            event: "tv_expansion_25k_batch_error",
            error: message,
            continuing: true,
          },
          null,
          2
        )
      );

      batchesRun += 1;
    }
  }

  return {
    mode: "execute",
    completed: false,
    reason: "max_batches_reached",
    checkpoint,
    platformEligible: await getTvPlatformEligibleCount(),
    batchesRun,
  };
}
