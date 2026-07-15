import type { TvExpansion25kSourceState } from "@/lib/tvExpansion25k/checkpoint";
import {
  allRegisteredSourcesExhausted,
  discoverFromRegisteredSources,
} from "@/lib/tvExpansion25k/sourceDiscovery";

export type TvDiscoveryResult = {
  candidates: import("@/lib/tvStationHealth").TvGrowthCandidate[];
  sources: Record<
    string,
    {
      discovered: number;
      preRejected?: number;
      fingerprintSkipped?: number;
      unsupported?: number;
      error?: string;
      cursor?: string;
      page?: number;
      exhausted?: boolean;
    }
  >;
  nextSourceState: TvExpansion25kSourceState;
  preProbeRejected: number;
  fingerprintSkipped: number;
};

export async function discoverTvExpansionCandidates(
  sourceState: TvExpansion25kSourceState,
  batchSize: number,
  batchNumber = 0,
  adminRoot = process.cwd()
): Promise<TvDiscoveryResult> {
  const result = await discoverFromRegisteredSources(
    sourceState,
    batchSize,
    batchNumber,
    adminRoot
  );

  const preProbeRejected = Object.values(result.sources).reduce(
    (sum, source) => sum + (source.preRejected || 0) + (source.unsupported || 0),
    0
  );
  const fingerprintSkipped = Object.values(result.sources).reduce(
    (sum, source) => sum + (source.fingerprintSkipped || 0),
    0
  );

  return {
    candidates: result.candidates,
    sources: result.sources,
    nextSourceState: result.nextSourceState,
    preProbeRejected,
    fingerprintSkipped,
  };
}

export function allTvExpansionSourcesExhausted(
  sourceState: TvExpansion25kSourceState,
  adminRoot = process.cwd()
) {
  return allRegisteredSourcesExhausted(sourceState, adminRoot);
}
