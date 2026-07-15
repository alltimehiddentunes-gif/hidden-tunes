import type { TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import { appendRejectedCandidateLog } from "@/lib/tvExpansion25k/expansionLogs";
import {
  allocateWave4SourceLimits,
  getWave4SourceWeight,
  orderWave4SourcesForBatch,
} from "@/lib/tvExpansion25k/wave4/scheduler";
import type {
  TvRegistryDiscoveryResult,
  TvSourceDiscoveryDetail,
} from "@/lib/tvExpansion25k/sourceDiscovery";
import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { filterFingerprintRejected, recordRejectedFingerprints } from "@/lib/tvExpansion25k/sources/shared/fingerprintCache";
import { filterCandidatesPreProbe, preProbeRejectReason } from "@/lib/tvExpansion25k/sources/shared/preProbeFilter";
import { createInitialSourceCursor, type TvExpansionSourceCursor } from "@/lib/tvExpansion25k/sources/types";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";
import { rankSourcesForParallelRun } from "@/lib/tvExpansion25k/fast/sourceScoring";
import { mapWithConcurrency, withTimeout } from "@/lib/tvExpansion25k/fast/workerPool";

function normalizeCursor(
  adapterId: string,
  cursor: TvExpansionSourceCursor | undefined
): TvExpansionSourceCursor {
  const base = cursor || createInitialSourceCursor(adapterId);
  return {
    ...createInitialSourceCursor(adapterId),
    ...base,
    source: adapterId,
    status: base.status || (base.exhausted ? "exhausted" : "active"),
    processedFixedIds: base.processedFixedIds || [],
  };
}

function classifyErrorStatus(message: string): TvExpansionSourceCursor["status"] {
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) return "rate_limited";
  if (lower.includes("timeout") || lower.includes("econnreset") || lower.includes("503")) {
    return "temporarily_failed";
  }
  return "temporarily_failed";
}

type ParallelDiscoveryOptions = {
  concurrency: number;
  sourceTimeoutMs: number;
  lastSources?: Record<string, TvSourceDiscoveryDetail>;
};

async function discoverOneSource(
  adapter: TvExpansionSourceAdapter,
  cursor: TvExpansionSourceCursor,
  limit: number,
  batchNumber: number,
  adminRoot: string,
  sourceTimeoutMs: number
) {
  if (limit <= 0) {
    return {
      candidates: [] as TvGrowthCandidate[],
      detail: {
        discovered: 0,
        preRejected: 0,
        fingerprintSkipped: 0,
        unsupported: 0,
        error: "deferred_no_allocation",
        cursor: cursor.cursor,
        page: cursor.page,
        exhausted: cursor.exhausted,
        status: cursor.status,
        allocated: 0,
      } as TvSourceDiscoveryDetail,
      nextCursor: cursor,
    };
  }

  const result = await withTimeout(
    adapter.discover({ limit, cursor, batchNumber }),
    sourceTimeoutMs,
    `source:${adapter.id}`
  );

  const fingerprint = filterFingerprintRejected(result.candidates, adminRoot);
  const preProbe = filterCandidatesPreProbe(fingerprint.accepted);

  for (const candidate of fingerprint.accepted) {
    if (preProbeRejectReason(candidate)) {
      appendRejectedCandidateLog(
        { source: adapter.id, reason: "pre_probe_rejected", candidate },
        adminRoot
      );
    }
  }

  const rejectedForFingerprint = result.candidates.filter(
    (candidate) =>
      !preProbe.accepted.some(
        (accepted) =>
          accepted.source_key === candidate.source_key &&
          accepted.source_url === candidate.source_url
      )
  );
  if (rejectedForFingerprint.length > 0) {
    recordRejectedFingerprints(rejectedForFingerprint, adminRoot);
  }

  const nextStatus: TvExpansionSourceCursor["status"] = result.nextCursor.exhausted
    ? "exhausted"
    : result.stats.error
      ? classifyErrorStatus(result.stats.error)
      : "active";

  const nextCursor: TvExpansionSourceCursor = {
    ...result.nextCursor,
    status: nextStatus,
    accepted: cursor.accepted,
    rejected: cursor.rejected + preProbe.rejected + fingerprint.skipped,
    processedFixedIds: result.nextCursor.processedFixedIds || cursor.processedFixedIds,
  };

  return {
    candidates: preProbe.accepted,
    detail: {
      discovered: result.candidates.length,
      preRejected: result.stats.preRejected + preProbe.rejected,
      fingerprintSkipped: fingerprint.skipped,
      unsupported: preProbe.rejected,
      error: result.stats.error,
      cursor: result.nextCursor.cursor,
      page: result.nextCursor.page,
      exhausted: result.nextCursor.exhausted,
      status: nextStatus,
      allocated: limit,
    } as TvSourceDiscoveryDetail,
    nextCursor,
  };
}

/**
 * Parallel source discovery — exhausted sources are skipped immediately (not scheduled).
 */
export async function discoverFromAdaptersParallel(
  adapters: TvExpansionSourceAdapter[],
  sourceState: TvExpansion25kSourceState,
  batchSize: number,
  batchNumber: number,
  adminRoot: string,
  options: ParallelDiscoveryOptions
): Promise<TvRegistryDiscoveryResult> {
  const adapterCursors: Record<string, TvExpansionSourceCursor> = {
    ...sourceState.adapterCursors,
  };
  const sources: Record<string, TvSourceDiscoveryDetail> = {};
  const candidates: TvGrowthCandidate[] = [];

  const ranked = rankSourcesForParallelRun(
    adapters,
    sourceState,
    options.lastSources
  );
  const rankedIds = new Set(ranked.map((row) => row.sourceId));
  const orderedAdapters = orderWave4SourcesForBatch(adapters, batchNumber);

  for (const adapter of orderedAdapters) {
    const cursor = normalizeCursor(adapter.id, adapterCursors[adapter.id]);
    adapterCursors[adapter.id] = cursor;
    if (cursor.exhausted || cursor.status === "exhausted" || cursor.status === "disabled_for_safety") {
      sources[adapter.id] = {
        discovered: 0,
        preRejected: 0,
        fingerprintSkipped: 0,
        unsupported: 0,
        error: "exhausted",
        cursor: cursor.cursor,
        page: cursor.page,
        exhausted: true,
        status: cursor.status,
      };
    }
  }

  const activeAdapterIds = ranked.map((row) => row.sourceId);
  const allocation = allocateWave4SourceLimits(
    batchSize,
    activeAdapterIds.length > 0 ? activeAdapterIds : []
  );

  const jobs = ranked
    .map((row) => {
      const adapter = adapters.find((item) => item.id === row.sourceId);
      if (!adapter) return null;
      const cursor = normalizeCursor(adapter.id, adapterCursors[adapter.id]);
      const limit = allocation.get(adapter.id) || 0;
      return { adapter, cursor, limit };
    })
    .filter(Boolean) as Array<{
    adapter: TvExpansionSourceAdapter;
    cursor: TvExpansionSourceCursor;
    limit: number;
  }>;

  const results = await mapWithConcurrency(
    jobs,
    options.concurrency,
    async (job) =>
      discoverOneSource(
        job.adapter,
        job.cursor,
        job.limit,
        batchNumber,
        adminRoot,
        options.sourceTimeoutMs
      ).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const status = classifyErrorStatus(message);
        return {
          candidates: [] as TvGrowthCandidate[],
          detail: {
            discovered: 0,
            preRejected: 0,
            fingerprintSkipped: 0,
            unsupported: 0,
            error: message,
            cursor: job.cursor.cursor,
            page: job.cursor.page,
            exhausted: job.cursor.exhausted,
            status,
            allocated: job.limit,
          } as TvSourceDiscoveryDetail,
          nextCursor: { ...job.cursor, status, lastError: message },
        };
      })
  );

  for (let i = 0; i < jobs.length; i += 1) {
    const job = jobs[i];
    const result = results[i];
    adapterCursors[job.adapter.id] = result.nextCursor;
    sources[job.adapter.id] = result.detail;
    candidates.push(...result.candidates);
  }

  for (const adapter of orderedAdapters) {
    if (rankedIds.has(adapter.id)) continue;
    const cursor = adapterCursors[adapter.id];
    if (sources[adapter.id]) continue;
    sources[adapter.id] = {
      discovered: 0,
      preRejected: 0,
      fingerprintSkipped: 0,
      unsupported: 0,
      error: cursor?.exhausted ? "exhausted" : "skipped_low_yield",
      cursor: cursor?.cursor,
      page: cursor?.page,
      exhausted: cursor?.exhausted,
      status: cursor?.status,
      allocated: 0,
    };
  }

  return {
    candidates,
    sources,
    nextSourceState: {
      adapterCursors,
      legacy: sourceState.legacy,
    },
  };
}
