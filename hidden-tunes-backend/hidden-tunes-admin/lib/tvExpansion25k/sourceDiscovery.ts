import type { TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import { appendRejectedCandidateLog } from "@/lib/tvExpansion25k/expansionLogs";
import {
  allocateSourceLimits,
  listActiveWeightedSourceIds,
  orderSourcesForBatch,
} from "@/lib/tvExpansion25k/sourceScheduler";
import {
  TV_EXPANSION_SOURCE_ADAPTERS,
} from "@/lib/tvExpansion25k/sources/registry";
import type { TvExpansionSourceAdapter } from "@/lib/tvExpansion25k/sources/types";
import { filterFingerprintRejected, recordRejectedFingerprints } from "@/lib/tvExpansion25k/sources/shared/fingerprintCache";
import { filterCandidatesPreProbe, preProbeRejectReason } from "@/lib/tvExpansion25k/sources/shared/preProbeFilter";
import { createInitialSourceCursor, type TvExpansionSourceCursor } from "@/lib/tvExpansion25k/sources/types";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

export type TvSourceDiscoveryDetail = {
  discovered: number;
  preRejected: number;
  fingerprintSkipped: number;
  unsupported: number;
  allocated?: number;
  error?: string;
  cursor?: string;
  page?: number;
  exhausted?: boolean;
  status?: string;
};

export type TvRegistryDiscoveryResult = {
  candidates: TvGrowthCandidate[];
  sources: Record<string, TvSourceDiscoveryDetail>;
  nextSourceState: TvExpansion25kSourceState;
};

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

export async function discoverFromAdapters(
  adapters: TvExpansionSourceAdapter[],
  sourceState: TvExpansion25kSourceState,
  batchSize: number,
  batchNumber: number,
  adminRoot = process.cwd()
): Promise<TvRegistryDiscoveryResult> {
  const candidates: TvGrowthCandidate[] = [];
  const sources: Record<string, TvSourceDiscoveryDetail> = {};
  const adapterCursors: Record<string, TvExpansionSourceCursor> = {
    ...sourceState.adapterCursors,
  };

  const orderedAdapters = orderSourcesForBatch(adapters, batchNumber, adminRoot);
  const activeAdapterIds = orderedAdapters
    .filter((adapter) => {
      const cursor = normalizeCursor(adapter.id, adapterCursors[adapter.id]);
      return cursor.status !== "exhausted" && cursor.status !== "disabled_for_safety" && !cursor.exhausted;
    })
    .map((adapter) => adapter.id);

  const allocation = allocateSourceLimits(
    batchSize,
    activeAdapterIds.length > 0 ? activeAdapterIds : orderedAdapters.map((a) => a.id),
    adminRoot
  );

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
      continue;
    }

    const limit = allocation.get(adapter.id) || 0;
    if (limit <= 0) {
      sources[adapter.id] = {
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
      };
      continue;
    }

    try {
      const result = await adapter.discover({
        limit,
        cursor,
        batchNumber,
      });

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

      adapterCursors[adapter.id] = {
        ...result.nextCursor,
        status: nextStatus,
        accepted: cursor.accepted,
        rejected: cursor.rejected + preProbe.rejected + fingerprint.skipped,
        processedFixedIds: result.nextCursor.processedFixedIds || cursor.processedFixedIds,
      };

      candidates.push(...preProbe.accepted);

      sources[adapter.id] = {
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
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = classifyErrorStatus(message);
      adapterCursors[adapter.id] = {
        ...cursor,
        status,
        lastError: message,
      };
      sources[adapter.id] = {
        discovered: 0,
        preRejected: 0,
        fingerprintSkipped: 0,
        unsupported: 0,
        error: message,
        cursor: cursor.cursor,
        page: cursor.page,
        exhausted: cursor.exhausted,
        status,
        allocated: limit,
      };
    }
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

export async function discoverFromRegisteredSources(
  sourceState: TvExpansion25kSourceState,
  batchSize: number,
  batchNumber: number,
  adminRoot = process.cwd()
): Promise<TvRegistryDiscoveryResult> {
  return discoverFromAdapters(
    TV_EXPANSION_SOURCE_ADAPTERS,
    sourceState,
    batchSize,
    batchNumber,
    adminRoot
  );
}

export function allRegisteredSourcesExhausted(
  sourceState: TvExpansion25kSourceState,
  adminRoot = process.cwd()
) {
  const activeIds = listActiveWeightedSourceIds(adminRoot);
  if (activeIds.length === 0) return true;
  return activeIds.every((id) => {
    const cursor = sourceState.adapterCursors[id];
    return cursor?.exhausted === true || cursor?.status === "exhausted";
  });
}

export function allAdaptersExhausted(
  adapterCursors: Record<string, TvExpansionSourceCursor | undefined>,
  adapterIds: string[],
  weightForId: (id: string) => number
) {
  const activeIds = adapterIds.filter((id) => weightForId(id) > 0);
  if (activeIds.length === 0) return true;
  return activeIds.every((id) => {
    const cursor = adapterCursors[id];
    return cursor?.exhausted === true || cursor?.status === "exhausted";
  });
}
