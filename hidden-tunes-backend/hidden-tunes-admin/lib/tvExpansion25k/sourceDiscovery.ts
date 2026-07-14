import type { TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import { TV_EXPANSION_SOURCE_ADAPTERS } from "@/lib/tvExpansion25k/sources/registry";
import { filterFingerprintRejected, recordRejectedFingerprints } from "@/lib/tvExpansion25k/sources/shared/fingerprintCache";
import { filterCandidatesPreProbe } from "@/lib/tvExpansion25k/sources/shared/preProbeFilter";
import type { TvGrowthCandidate } from "@/lib/tvStationHealth";

export type TvSourceDiscoveryDetail = {
  discovered: number;
  preRejected: number;
  fingerprintSkipped: number;
  unsupported: number;
  error?: string;
  cursor?: string;
  page?: number;
  exhausted?: boolean;
};

export type TvRegistryDiscoveryResult = {
  candidates: TvGrowthCandidate[];
  sources: Record<string, TvSourceDiscoveryDetail>;
  nextSourceState: TvExpansion25kSourceState;
};

export async function discoverFromRegisteredSources(
  sourceState: TvExpansion25kSourceState,
  batchSize: number,
  batchNumber: number,
  adminRoot = process.cwd()
): Promise<TvRegistryDiscoveryResult> {
  const perSourceLimit = Math.max(25, Math.ceil(batchSize / 3));
  const candidates: TvGrowthCandidate[] = [];
  const sources: Record<string, TvSourceDiscoveryDetail> = {};
  const adapterCursors = { ...sourceState.adapterCursors };

  for (const adapter of TV_EXPANSION_SOURCE_ADAPTERS) {
    const cursor = adapterCursors[adapter.id] || {
      source: adapter.id,
      cursor: "0",
      page: 0,
      processed: 0,
      accepted: 0,
      rejected: 0,
      exhausted: false,
      lastError: null,
    };

    if (cursor.exhausted) {
      sources[adapter.id] = {
        discovered: 0,
        preRejected: 0,
        fingerprintSkipped: 0,
        unsupported: 0,
        error: "exhausted",
        cursor: cursor.cursor,
        page: cursor.page,
        exhausted: true,
      };
      continue;
    }

    if (candidates.length >= batchSize) {
      sources[adapter.id] = {
        discovered: 0,
        preRejected: 0,
        fingerprintSkipped: 0,
        unsupported: 0,
        error: "deferred_batch_full",
        cursor: cursor.cursor,
        page: cursor.page,
        exhausted: cursor.exhausted,
      };
      continue;
    }

    const remaining = batchSize - candidates.length;
    const limit = Math.min(perSourceLimit, remaining);

    try {
      const result = await adapter.discover({
        limit,
        cursor,
        batchNumber,
      });

      const fingerprint = filterFingerprintRejected(result.candidates, adminRoot);
      const preProbe = filterCandidatesPreProbe(fingerprint.accepted);

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

      adapterCursors[adapter.id] = {
        ...result.nextCursor,
        accepted: cursor.accepted,
        rejected: cursor.rejected + preProbe.rejected + fingerprint.skipped,
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
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      adapterCursors[adapter.id] = {
        ...cursor,
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

export function allRegisteredSourcesExhausted(sourceState: TvExpansion25kSourceState) {
  return TV_EXPANSION_SOURCE_ADAPTERS.every((adapter) => {
    const cursor = sourceState.adapterCursors[adapter.id];
    return cursor?.exhausted === true;
  });
}
